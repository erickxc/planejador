// Planejador: quadro kanban de pendências de TODOS os sistemas (projetos.json) + o agente planejador. Só em localhost.
//   GET  /api/projetos                 sistemas, com contagens e o próximo passo de cada rumo
//   GET  /api/quadro?p=<id>|todos      o quadro de um sistema (ou todos juntos, cada cartão com o sistema)
//   POST /api/mover|salvar|excluir     { projeto, ... } altera o quadro do sistema e regrava o .md
//   GET  /api/rumo?p=<id>              o rumo do sistema + estado da rodada do agente
//   POST /api/rumo { projeto }         roda o agente (claude -p --agent planejador) na pasta do sistema
// Quadro e rumo: os caminhos do projetos.json (relativos à pasta do sistema) ou, se não houver, quadros/<id>.md e
// rumos/<id>.md aqui no planejador (sem mexer no repositório do sistema).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ler, escrever, mover, salvar, excluir } from './quadro.mjs';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const CLAUDE = process.env.CLAUDE_BIN || [join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')].find(existsSync) || 'claude';
const FERRAMENTAS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(git log:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git branch:*)', 'Bash(git rev-list:*)',
  'Bash(gh run list:*)', 'Bash(gh run view:*)', 'Bash(npm test:*)', 'Bash(npm run check:*)', 'Bash(mkdir:*)'];

const projetos = () => JSON.parse(readFileSync(join(DIR, 'projetos.json'), 'utf8'));
const projeto = id => { const p = projetos().find(x => x.id === id); if (!p) throw new Error(`sistema ${id} não está no projetos.json`); return p; };
const caminho = (p, rel, padrao) => (rel ? (isAbsolute(rel) ? rel : join(p.pasta, rel)) : padrao);
const arqQuadro = p => caminho(p, p.quadro, join(DIR, 'quadros', p.id + '.md'));
const arqRumo = p => caminho(p, p.rumo, join(DIR, 'rumos', p.id + '.md'));
const modelo = p => readFileSync(join(DIR, 'modelo.md'), 'utf8').replace('{{nome}}', p.nome);
const textoQuadro = p => (existsSync(arqQuadro(p)) ? readFileSync(arqQuadro(p), 'utf8') : modelo(p));
const mtime = f => (existsSync(f) ? statSync(f).mtimeMs : 0);
const gravarQuadro = (p, q) => { mkdirSync(dirname(arqQuadro(p)), { recursive: true }); writeFileSync(arqQuadro(p), escrever(q)); };

// próximo passo do rumo: a 1ª linha depois de "## Próximo passo", sem marcação
function proximo(p) {
  const f = arqRumo(p); if (!existsSync(f)) return '';
  const m = /##\s*Próximo passo\s*\n+([^\n]+)/.exec(readFileSync(f, 'utf8'));
  return m ? m[1].replace(/\*\*|`|_/g, '').trim() : '';
}

// o agente vem do arquivo agente/planejador.md (frontmatter + instruções), passado ao claude por --agents
function definicaoAgente() {
  const txt = readFileSync(join(DIR, 'agente', 'planejador.md'), 'utf8'), m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(txt.replace(/\r\n/g, '\n'));
  const meta = Object.fromEntries(m[1].split('\n').map(l => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
  return { planejador: { description: meta.description, tools: meta.tools.split(',').map(s => s.trim()), prompt: m[2].trim() } };
}

const rodadas = new Map(); // id do sistema -> estado da rodada
const vazia = () => ({ rodando: false, inicio: 0, fim: 0, ok: null, passos: [], resumo: '' });
function rodarAgente(p) {
  const e = Object.assign(vazia(), { rodando: true, inicio: Date.now() }); rodadas.set(p.id, e);
  const passo = t => { e.passos.push({ t: Date.now(), txt: t }); if (e.passos.length > 200) e.passos.shift(); };
  if (!existsSync(arqQuadro(p))) gravarQuadro(p, ler(modelo(p))); // o agente precisa do arquivo para escrever na Entrada
  mkdirSync(dirname(arqRumo(p)), { recursive: true });
  const pedido = `Rodada de planejamento do sistema "${p.nome}" (a pasta atual). Quadro: ${arqQuadro(p)}. Rumo: ${arqRumo(p)}. `
    + 'Siga as suas instruções: leia o quadro e as fontes do sistema, acrescente na coluna Entrada só sugestões novas e importantes, e reescreva o rumo.';
  passo(`Planejador iniciado em ${p.nome}`);
  const proc = spawn(CLAUDE, ['-p', pedido, '--agent', 'planejador', '--agents', JSON.stringify(definicaoAgente()), '--add-dir', DIR,
    '--permission-mode', 'acceptEdits', '--allowedTools', ...FERRAMENTAS, '--output-format', 'stream-json', '--verbose'],
  { cwd: p.pasta, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let resto = '';
  proc.stdout.on('data', d => {
    const linhas = (resto + d).split('\n'); resto = linhas.pop();
    for (const l of linhas) {
      let m; try { m = JSON.parse(l); } catch { continue; }
      if (m.type === 'assistant') for (const c of m.message?.content || []) {
        if (c.type === 'tool_use') { const i = c.input || {}; passo(`${c.name}${i.file_path ? ' ' + i.file_path.replaceAll('\\', '/').replace(p.pasta.replaceAll('\\', '/') + '/', '') : i.pattern ? ' "' + i.pattern + '"' : i.command ? ' ' + i.command : ''}`); }
        else if (c.type === 'text' && c.text.trim()) passo(c.text.trim().split('\n')[0].slice(0, 160));
      }
      if (m.type === 'result') { e.resumo = m.result || ''; e.ok = !m.is_error; }
    }
  });
  proc.stderr.on('data', d => passo('erro: ' + String(d).trim().slice(0, 200)));
  proc.on('error', err => { passo('não consegui rodar o claude: ' + err.message); e.ok = false; });
  proc.on('close', code => { e.rodando = false; e.fim = Date.now(); if (e.ok == null) e.ok = code === 0; passo(e.ok ? 'Concluído' : `Terminou com erro (código ${code})`); });
}

function lerQuadro(id) {
  if (id !== 'todos') { const p = projeto(id); return { ...ler(textoQuadro(p)), mtime: mtime(arqQuadro(p)), projeto: id }; }
  // todos: as colunas de cada sistema juntas; cada cartão leva o sistema (id e nome)
  const ps = projetos().filter(p => existsSync(p.pasta)), base = ler('');
  for (const p of ps) for (const c of ler(textoQuadro(p)).colunas) {
    const col = base.colunas.find(x => x.nome === c.nome) || (base.colunas.push({ nome: c.nome, intro: '', cartoes: [] }), base.colunas.at(-1));
    col.cartoes.push(...c.cartoes.map(x => ({ ...x, projeto: p.id, projetoNome: p.nome, foco: !!p.foco })));
  }
  for (const c of base.colunas) c.cartoes.sort((a, b) => b.foco - a.foco); // o sistema em foco primeiro
  return { ...base, mtime: Math.max(0, ...ps.map(p => mtime(arqQuadro(p)))), projeto: 'todos' };
}

const corpo = req => new Promise((ok, falha) => { let s = ''; req.on('data', d => (s += d)); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { falha(e); } }); });
const json = (res, codigo, obj) => { res.statusCode = codigo; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };

function api() {
  return {
    name: 'api-planejador',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://x'), rota = url.pathname, pid = url.searchParams.get('p');
          if (req.method === 'GET' && rota === '/projetos') {
            return json(res, 200, projetos().map(p => {
              const ok = existsSync(p.pasta), q = ok ? ler(textoQuadro(p)) : null, n = nome => q?.colunas.find(c => c.nome === nome)?.cartoes.length || 0;
              return { id: p.id, nome: p.nome, foco: !!p.foco, existe: ok, abertos: q ? q.colunas.filter(c => c.nome !== 'Feito').reduce((a, c) => a + c.cartoes.length, 0) : 0,
                entrada: n('Entrada'), rumo: mtime(arqRumo(p)), proximo: proximo(p), rodando: !!rodadas.get(p.id)?.rodando };
            }));
          }
          if (req.method === 'GET' && rota === '/quadro') return json(res, 200, lerQuadro(pid || 'todos'));
          if (req.method === 'POST' && ['/mover', '/salvar', '/excluir'].includes(rota)) {
            const b = await corpo(req), p = projeto(b.projeto), q = ler(textoQuadro(p));
            let novo = rota === '/mover' ? mover(q, b.id, b.coluna, b.posicao) : rota === '/salvar' ? salvar(q, b) : excluir(q, b.id);
            // editar trocando a coluna = mover o cartão para o fim da coluna nova
            const atual = rota === '/salvar' && b.id && q.colunas.find(c => c.cartoes.some(x => x.id === b.id))?.nome;
            if (atual && b.coluna && b.coluna !== atual) novo = mover(novo, b.id, b.coluna);
            gravarQuadro(p, novo);
            return json(res, 200, lerQuadro(pid || b.projeto));
          }
          if (req.method === 'GET' && rota === '/rumo') {
            const p = projeto(pid), f = arqRumo(p);
            return json(res, 200, { md: existsSync(f) ? readFileSync(f, 'utf8') : '', mtime: mtime(f), rodada: rodadas.get(p.id) || vazia() });
          }
          if (req.method === 'POST' && rota === '/rumo') {
            const p = projeto((await corpo(req)).projeto);
            if (rodadas.get(p.id)?.rodando) return json(res, 409, { erro: `o planejador já está rodando em ${p.nome}` });
            if (!existsSync(p.pasta)) return json(res, 400, { erro: `a pasta de ${p.nome} não existe: ${p.pasta}` });
            rodarAgente(p);
            return json(res, 202, { rodada: rodadas.get(p.id) });
          }
          json(res, 404, { erro: 'rota inexistente' });
        } catch (e) { json(res, 400, { erro: e.message }); }
      });
    },
  };
}

export default defineConfig({ plugins: [react(), api()], server: { port: 5180, strictPort: true, host: 'localhost' } });
