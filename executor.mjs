// Executor da Fila: pega o próximo cartão da coluna Fila, roda o agente numa cópia isolada (worktree) e leva o cartão a Revisar.
// Quem o liga ao servidor injeta rodarAgente/rodarTestes/notificar.
import fs from 'node:fs';
import path from 'node:path';
import { mover } from './quadro.mjs';
import { proximo, marcar, comandoTestes } from './fila.mjs';
import * as git from './git.mjs';

const dataBR = ms => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const achar = (q, id) => q.colunas.flatMap(c => c.cartoes).find(c => c.id === id);

export function criarExecutor({ projetos, lerQuadro, gravarQuadro, rodarAgente, rodarTestes, notificar = () => {}, agora = Date.now, dir, limiteMs = 30 * 60 * 1000 }) {
  let atual = null; // { projeto, id, titulo, inicio, passo, passos, token, matar, copia, ramo, base }
  let seq = 0;

  const proj = pid => projetos().find(p => p.id === pid);
  const arqHist = (pid, id) => path.join(dir, 'execucoes', pid, `${id}.json`);
  const dirCopias = pid => path.join(dir, 'worktrees', pid);
  const copiaDe = (pid, id) => path.join(dirCopias(pid), String(id));
  const ramoDe = id => `fila/${id}`;
  // relê o quadro do disco imediatamente antes de cada alteração (o usuário pode ter editado)
  const alterar = (p, fn) => gravarQuadro(p, fn(lerQuadro(p)));
  const historico = (pid, id) => { try { return JSON.parse(fs.readFileSync(arqHist(pid, id), 'utf8')); } catch { return null; } };
  const gravarHist = (pid, h) => { fs.mkdirSync(path.dirname(arqHist(pid, h.id)), { recursive: true }); fs.writeFileSync(arqHist(pid, h.id), JSON.stringify(h, null, 2)); };
  const registrar = (pid, { id, titulo, ramo, base }, rodada) => {
    const h = historico(pid, id) || { id, titulo, ramo, base, rodadas: [] };
    h.titulo = titulo; h.ramo = ramo || h.ramo; h.base = h.base || base; // mantém a base original
    h.rodadas.push(rodada);
    gravarHist(pid, h);
  };
  const rodadaVazia = (a, status, resumo) => ({ inicio: a.inicio, fim: agora(), status, resumo, passos: a.passos || [], testes: { ok: false, saida: '' }, arquivos: [], diff: '' });
  const revisar = (p, id, status) => alterar(p, q => marcar(mover(q, id, 'Revisar'), id, { exec: status }));

  function parar(pid, id, motivo) {
    if (!atual || atual.projeto.id !== pid || atual.id !== id) return;
    const a = atual; atual = null; // o pronto que resolver depois da morte do processo é ignorado (token)
    try { a.matar(); } catch {}
    try {
      registrar(pid, a, rodadaVazia(a, 'parado', motivo));
      alterar(a.projeto, q => {
        const c = achar(q, id);
        if (c && c.coluna === 'Fazendo') q = mover(q, id, 'Postergar');
        return marcar(q, id, { exec: 'parado' });
      });
    } catch {}
  }

  async function terminou(a, r) {
    if (atual?.token !== a.token) return; // já parado
    let status, rodada;
    try {
      const testes = await rodarTestes({ copia: a.copia, comando: comandoTestes(lerQuadro(a.projeto).cabecalho) });
      if (atual?.token !== a.token) return;
      const al = git.alteracoes({ copia: a.copia, base: a.base, ramo: a.ramo });
      const motivo = !r.ok ? 'o agente falhou' : !testes.ok ? 'testes falharam' : al.commits === 0 ? 'nenhum commit no ramo' : null;
      status = motivo ? 'falhou' : 'pronto';
      const resumo = motivo ? [motivo, r.resumo].filter(Boolean).join(': ') : r.resumo;
      rodada = { inicio: a.inicio, fim: agora(), status, resumo, passos: a.passos, testes: { ok: !!testes.ok, saida: testes.saida }, arquivos: al.arquivos, diff: al.diff, commits: al.commits };
    } catch (e) {
      if (atual?.token !== a.token) return;
      status = 'falhou'; rodada = rodadaVazia(a, status, `erro ao concluir: ${e.message}`);
    }
    atual = null;
    try { registrar(a.projeto.id, a, rodada); revisar(a.projeto, a.id, status); } catch {}
    try { notificar({ projeto: a.projeto, cartao: { id: a.id, titulo: a.titulo }, status }); } catch {}
  }

  function iniciar(p, c) {
    const t0 = agora(), ramo = ramoDe(c.id);
    const falhar = (e, base) => {
      const a = { id: c.id, titulo: c.titulo, ramo, base, inicio: t0 };
      try { registrar(p.id, a, rodadaVazia(a, 'falhou', `erro ao iniciar: ${e.message}`)); revisar(p, c.id, 'falhou'); notificar({ projeto: p, cartao: c, status: 'falhou' }); } catch {}
    };
    let copia, base;
    try { ({ copia, base } = git.prepararCopia({ pasta: p.pasta, id: c.id, dirCopias: dirCopias(p.id) })); } catch (e) { return falhar(e); }
    const hist = historico(p.id, c.id);
    base = hist?.base || base;
    try { alterar(p, q => marcar(mover(q, c.id, 'Fazendo'), c.id, { exec: 'rodando', ramo, inicio: t0 })); } catch (e) { return falhar(e, base); }
    const a = atual = { projeto: p, id: c.id, titulo: c.titulo, inicio: t0, passo: '', passos: [], token: ++seq, copia, ramo, base, matar() {} };
    const ajuste = hist?.rodadas.at(-1)?.ajuste;
    const pedido = [c.titulo, c.corpo, ajuste && `Ajuste pedido: ${ajuste}`].filter(Boolean).join('\n\n');
    try {
      const h = rodarAgente({ copia, cartao: c, projeto: p, pedido, onPasso: txt => { if (atual?.token === a.token) { a.passo = txt; a.passos.push(txt); } } });
      a.matar = h.matar;
      h.pronto.then(r => terminou(a, r), e => terminou(a, { ok: false, resumo: e.message }));
    } catch (e) {
      atual = null;
      falhar(e, base);
    }
  }

  async function tick() {
    try {
      if (atual) {
        const c = achar(lerQuadro(atual.projeto), atual.id);
        if (!c || c.coluna !== 'Fazendo') parar(atual.projeto.id, atual.id, 'postergado');
        else if (agora() - atual.inicio > limiteMs) parar(atual.projeto.id, atual.id, 'tempo esgotado');
        return;
      }
      const ps = projetos();
      const quadros = ps.map(p => ({ projeto: { id: p.id, temGit: git.temGit(p.pasta) }, quadro: lerQuadro(p) }));
      const prox = proximo(quadros);
      if (prox) iniciar(ps.find(p => p.id === prox.projeto.id), prox.cartao);
    } catch { /* nunca para o laço */ }
  }

  function aceitar(pid, id) {
    const p = proj(pid);
    if (atual?.projeto.id === pid && atual.id === id) return { ok: false, motivo: 'o cartão está em execução' };
    const r = git.aceitar({ pasta: p.pasta, ramo: ramoDe(id), copia: copiaDe(pid, id) });
    if (r.ok) {
      const ramo = ramoDe(id), d = dataBR(agora());
      alterar(p, q => {
        q = marcar(mover(q, id, 'Feito'), id, { exec: null, ramo: null, inicio: null });
        const c = achar(q, id);
        c.corpo = `${c.corpo}\n\nFeito pela Fila em ${d} (ramo ${ramo}).`.trim();
        return q;
      });
    }
    return r;
  }

  function ajustar(pid, id, texto) {
    const p = proj(pid), h = historico(pid, id);
    if (h?.rodadas.length) { h.rodadas.at(-1).ajuste = texto; gravarHist(pid, h); }
    alterar(p, q => {
      q = mover(q, id, 'Fila');
      const c = achar(q, id);
      c.corpo = `${c.corpo}\n\nAjuste pedido em ${dataBR(agora())}: ${texto}`.trim();
      return q;
    });
  }

  function descartar(pid, id) {
    const p = proj(pid);
    if (atual?.projeto.id === pid && atual.id === id) parar(pid, id, 'descartado');
    git.descartar({ pasta: p.pasta, ramo: ramoDe(id), copia: copiaDe(pid, id) });
    alterar(p, q => marcar(mover(q, id, 'A fazer'), id, { exec: null, ramo: null, inicio: null }));
  }

  function recuperar() {
    for (const p of projetos()) {
      for (const c of lerQuadro(p).colunas.flatMap(col => col.cartoes)) {
        if (c.outros.exec !== 'rodando') continue;
        const a = { id: c.id, titulo: c.titulo, ramo: c.outros.ramo, inicio: Number(c.outros.inicio) || agora() };
        try { registrar(p.id, a, rodadaVazia(a, 'parado', 'o Planejador reiniciou no meio da execução')); revisar(p, c.id, 'parado'); } catch {}
      }
    }
  }

  const estado = () => atual && { projeto: atual.projeto, id: atual.id, titulo: atual.titulo, inicio: atual.inicio, passo: atual.passo, passos: [...atual.passos] };
  return { tick, parar, estado, historico, aceitar, ajustar, descartar, recuperar };
}
