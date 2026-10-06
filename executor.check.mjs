import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ler, escrever, mover } from './quadro.mjs';
import { criarExecutor } from './executor.mjs';
import { descartar } from './git.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'plan exec '));
const pasta = path.join(raiz, 'sis'), dir = path.join(raiz, 'plan'), arqQuadro = path.join(raiz, 'quadro.md');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const esperar = async (cond, ms = 15000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error('timeout no teste'); await new Promise(r => setTimeout(r, 20)); } };
const cartaoMd = (id, col, extra = '') => `## ${col}\n\n### Cartão ${id}\n<!-- id: ${id} · categoria: bug${extra} -->\ncorpo ${id}\n\n`;
const gravarMd = (...cartoes) => fs.writeFileSync(arqQuadro, `# Quadro\n\n${cartoes.join('')}`);
const quadro = () => ler(fs.readFileSync(arqQuadro, 'utf8'));
const cartao = id => quadro().colunas.flatMap(c => c.cartoes).find(c => c.id === id);
const procs = [], pedidos = [], notas = [];
const modos = {};

const base = {
  projetos: () => [{ id: 'sis', nome: 'Sis', pasta, quadro: arqQuadro }],
  lerQuadro: () => quadro(),
  gravarQuadro: (_, q) => fs.writeFileSync(arqQuadro, escrever(q)),
  rodarAgente: ({ copia, cartao: c, pedido }) => {
    pedidos.push({ id: c.id, pedido });
    const child = spawn('node', [path.join(aqui, 'teste/agente-falso.mjs'), copia, modos[c.id] || 'ok'], { stdio: 'ignore' });
    const p = { child, fechou: false }; procs.push(p);
    return { pronto: new Promise(r => child.on('close', code => { p.fechou = true; r({ ok: code === 0, resumo: `saiu ${code}` }); })), matar: () => child.kill() };
  },
  rodarTestes: async () => ({ ok: true, saida: 'ok' }),
  notificar: n => notas.push(n),
  dir,
};
const novo = (extra = {}) => criarExecutor({ ...base, ...extra });
const rodar = async ex => { await ex.tick(); await esperar(() => ex.estado() === null); };

try {
  fs.mkdirSync(pasta, { recursive: true });
  g(pasta, 'init', '-q'); g(pasta, 'config', 'user.name', 't'); g(pasta, 'config', 'user.email', 't@t');
  fs.writeFileSync(path.join(pasta, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(pasta, 'a.txt'), 'velho\n');
  g(pasta, 'add', '.'); g(pasta, 'commit', '-qm', 'inicial');
  const ramo = n => g(pasta, 'branch', '--list', `fila/${n}`).trim();

  // ciclo: Fila -> Fazendo -> Revisar
  let ex = novo();
  gravarMd(cartaoMd('x', 'Fila'));
  await ex.tick();
  assert.strictEqual(cartao('x').coluna, 'Fazendo');
  assert.strictEqual(cartao('x').outros.exec, 'rodando');
  assert.strictEqual(ex.estado().id, 'x');
  await esperar(() => ex.estado() === null);
  assert.strictEqual(cartao('x').coluna, 'Revisar');
  assert.strictEqual(cartao('x').outros.exec, 'pronto');
  const h = ex.historico('sis', 'x');
  assert.strictEqual(h.rodadas[0].commits, 1);
  assert.strictEqual(h.rodadas[0].status, 'pronto');
  assert.ok(h.base);
  assert.deepStrictEqual(notas.map(n => n.status), ['pronto']);
  assert.match(pedidos[0].pedido, /Cartão x[\s\S]*corpo x/);

  // agente sem commit
  modos.n = 'nada';
  gravarMd(cartaoMd('n', 'Fila'));
  await rodar(ex);
  assert.strictEqual(cartao('n').coluna, 'Revisar');
  assert.strictEqual(cartao('n').outros.exec, 'falhou');
  assert.match(ex.historico('sis', 'n').rodadas[0].resumo, /nenhum commit/);

  // árvore suja na cópia: falha mesmo com commit
  modos.s = 'sujo';
  gravarMd(cartaoMd('s', 'Fila'));
  await rodar(ex);
  assert.strictEqual(cartao('s').outros.exec, 'falhou');
  assert.match(ex.historico('sis', 's').rodadas[0].resumo, /sem commit na cópia/);

  // erro em rodarAgente: falha e deixa o executor livre
  gravarMd(cartaoMd('e', 'Fila'));
  await novo({ rodarAgente: () => { throw new Error('boom'); } }).tick();
  assert.strictEqual(cartao('e').outros.exec, 'falhou');
  assert.match(ex.historico('sis', 'e').rodadas[0].resumo, /boom/);

  // postergar durante a execução
  modos.l = 'lento';
  gravarMd(cartaoMd('l', 'Fila'));
  await ex.tick();
  assert.strictEqual(ex.estado().id, 'l');
  const pl = procs.at(-1);
  fs.writeFileSync(arqQuadro, escrever(mover(quadro(), 'l', 'Postergar')));
  await ex.tick();
  assert.strictEqual(ex.estado(), null);
  await esperar(() => pl.fechou);
  await new Promise(r => setTimeout(r, 100)); // dá chance ao pronto tardio sobrescrever (não pode)
  assert.strictEqual(cartao('l').coluna, 'Postergar');
  assert.strictEqual(cartao('l').outros.exec, 'parado');
  assert.strictEqual(ex.historico('sis', 'l').rodadas.length, 1);
  assert.ok(ramo('l'));
  assert.strictEqual(ex.historico('sis', 'l').rodadas[0].commits, 0);

  // tempo esgotado
  modos.t = 'lento';
  gravarMd(cartaoMd('t', 'Fila'));
  const ext = novo({ limiteMs: 200 });
  await ext.tick();
  await new Promise(r => setTimeout(r, 300));
  await ext.tick();
  assert.strictEqual(ext.estado(), null);
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(cartao('t').coluna, 'Revisar');
  assert.strictEqual(cartao('t').outros.exec, 'parado');
  assert.match(ext.historico('sis', 't').rodadas[0].resumo, /tempo esgotado/);
  assert.strictEqual(ext.historico('sis', 't').rodadas[0].commits, 0);
  assert.ok(notas.some(n => n.status === 'parado' && n.cartao.id === 't' && !('projeto' in n.cartao)));

  // testes em andamento: sem limite de tempo; Postergar durante os testes deixa o cartão onde está
  let liberar; const testesPendentes = new Promise(r => { liberar = r; });
  gravarMd(cartaoMd('ts', 'Fila'));
  const ets = novo({ limiteMs: 50, rodarTestes: () => testesPendentes });
  await ets.tick();
  await esperar(() => procs.at(-1).fechou);
  await new Promise(r => setTimeout(r, 300));
  await ets.tick();
  assert.strictEqual(ets.estado()?.id, 'ts');
  assert.strictEqual(cartao('ts').coluna, 'Fazendo');
  fs.writeFileSync(arqQuadro, escrever(mover(quadro(), 'ts', 'Postergar')));
  await ets.tick();
  assert.strictEqual(ets.estado()?.id, 'ts');
  liberar({ ok: true, saida: 'ok' });
  await esperar(() => ets.estado() === null);
  assert.strictEqual(cartao('ts').coluna, 'Postergar');
  assert.strictEqual(cartao('ts').outros.exec, 'parado');
  const rts = ets.historico('sis', 'ts').rodadas;
  assert.deepStrictEqual([rts.length, rts[0].status, rts[0].testes.ok, rts[0].commits], [1, 'parado', true, 1]);

  // um por vez
  modos.d1 = modos.d2 = 'lento';
  gravarMd(cartaoMd('d1', 'Fila'), cartaoMd('d2', 'Fila'));
  const ed = novo();
  await ed.tick(); await ed.tick();
  assert.strictEqual(ed.estado().id, 'd1');
  assert.strictEqual(cartao('d1').coluna, 'Fazendo');
  assert.strictEqual(cartao('d2').coluna, 'Fila');
  ed.parar('sis', 'd1', 'fim do teste');
  assert.strictEqual(cartao('d1').coluna, 'Postergar');

  // recuperar
  gravarMd(cartaoMd('r', 'Fazendo', ' · exec: rodando · ramo: fila/r'));
  novo().recuperar();
  assert.strictEqual(cartao('r').coluna, 'Revisar');
  assert.strictEqual(cartao('r').outros.exec, 'parado');
  assert.match(novo().historico('sis', 'r').rodadas[0].resumo, /reiniciou/);
  // recuperar: cartão fora de Fazendo fica onde está, e o histórico anterior é preservado
  gravarMd(cartaoMd('l', 'Postergar', ' · exec: rodando · ramo: fila/l'));
  const nn = notas.length;
  novo().recuperar();
  assert.strictEqual(cartao('l').coluna, 'Postergar');
  assert.strictEqual(cartao('l').outros.exec, 'parado');
  assert.strictEqual(novo().historico('sis', 'l').rodadas.length, 2);
  assert.strictEqual(notas.length, nn + 1);
  assert.deepStrictEqual(ex.aceitar('sis', 'inexistente'), { ok: false, motivo: 'cartão não encontrado' });
  assert.deepStrictEqual(ex.ajustar('sis', 'inexistente', 'x'), { ok: false, motivo: 'cartão não encontrado' });

  // aceitar
  gravarMd(cartaoMd('ac', 'Fila'));
  await rodar(ex);
  assert.deepStrictEqual(ex.aceitar('sis', 'ac'), { ok: true });
  assert.strictEqual(cartao('ac').coluna, 'Feito');
  assert.deepStrictEqual([cartao('ac').outros.exec, cartao('ac').outros.ramo, cartao('ac').outros.inicio], [undefined, undefined, undefined]);
  assert.match(cartao('ac').corpo, /Feito pela Fila/);
  assert.match(fs.readFileSync(path.join(pasta, 'a.txt'), 'utf8'), /linha/);

  // ajustar: volta à Fila e a próxima rodada leva o ajuste
  gravarMd(cartaoMd('aj', 'Fila'));
  await rodar(ex);
  const baseAj = ex.historico('sis', 'aj').base;
  ex.ajustar('sis', 'aj', 'trocar o nome');
  assert.strictEqual(cartao('aj').coluna, 'Fila');
  assert.match(cartao('aj').corpo, /Ajuste pedido/);
  await rodar(ex);
  assert.strictEqual(pedidos.filter(p => p.id === 'aj').at(-1).pedido.split('trocar o nome').length, 2);
  const haj = ex.historico('sis', 'aj');
  assert.strictEqual(haj.rodadas.length, 2);
  assert.strictEqual(haj.base, baseAj);
  assert.strictEqual(haj.rodadas[1].commits, 2);

  // descartar
  gravarMd(cartaoMd('de', 'Fila'));
  await rodar(ex);
  assert.ok(ramo('de'));
  ex.descartar('sis', 'de');
  assert.strictEqual(cartao('de').coluna, 'A fazer');
  assert.strictEqual(cartao('de').outros.exec, undefined);
  assert.strictEqual(ramo('de'), '');

  // base nova depois de descartar: o commit novo no sistema entra na base e o agente `nada` não tem commits
  gravarMd(cartaoMd('bn', 'Fila'));
  await rodar(ex);
  ex.descartar('sis', 'bn');
  assert.strictEqual(ex.historico('sis', 'bn').base, undefined);
  fs.writeFileSync(path.join(pasta, 'b.txt'), 'b'); g(pasta, 'add', 'b.txt'); g(pasta, 'commit', '-qm', 'novo no sistema');
  modos.bn = 'nada';
  fs.writeFileSync(arqQuadro, escrever(mover(quadro(), 'bn', 'Fila')));
  await rodar(ex);
  assert.strictEqual(cartao('bn').outros.exec, 'falhou');
  assert.match(ex.historico('sis', 'bn').rodadas.at(-1).resumo, /nenhum commit/);
  assert.match(String(cartao('bn').outros.inicio), /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);

  console.log('ok executor: ciclo, falha, postergar, tempo, um por vez, recuperar, aceitar/ajustar/descartar');
} finally {
  for (const p of procs) try { p.child.kill(); } catch {}
  const wt = path.join(dir, 'worktrees/sis');
  if (fs.existsSync(wt)) for (const d of fs.readdirSync(wt)) try { descartar({ pasta, ramo: `fila/${d}`, copia: path.join(wt, d) }); } catch {}
  await new Promise(r => setTimeout(r, 200));
  fs.rmSync(raiz, { recursive: true, force: true });
}
