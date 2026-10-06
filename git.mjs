import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const git = (cwd, ...args) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { throw new Error((e.stderr || e.stdout || e.message).toString().trim() || e.message); }
};
const ok = (cwd, ...args) => { try { git(cwd, ...args); return true; } catch { return false; } };

export const temGit = (pasta) => fs.existsSync(path.join(pasta, '.git'));

const subpastas = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } };
const pastasNm = (dir) => {
  let ws = [];
  try { const w = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).workspaces; ws = Array.isArray(w) ? w : w?.packages || []; } catch {}
  const pastas = [''];
  for (const e of ws) {
    if (typeof e !== 'string' || e.startsWith('!')) continue;
    // ponytail: só "x" e "x/*"; outros globs são ignorados
    if (e.endsWith('/*')) pastas.push(...subpastas(path.join(dir, e.slice(0, -2))).map(n => path.join(e.slice(0, -2), n)));
    else pastas.push(e);
  }
  return pastas.map(p => path.join(p, 'node_modules'));
};
const existe = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
const norm = (p) => path.resolve(p).toLowerCase(); // Windows: sem diferença de maiúsculas
const junta = (junc, origem) => {
  try { execFileSync('cmd', ['/c', 'mklink', '/J', junc, origem], { stdio: 'pipe' }); }
  catch (e) { throw new Error(`mklink falhou: ${(e.stderr || e.message).toString().trim()}`); }
};
const ehLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
const ehDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
// node_modules da RAIZ da cópia: diretório real; links de workspace que apontam para dentro de `pasta` passam a apontar para a cópia
// (senão o código do repositório principal seria usado no lugar do da cópia); o resto vira junção para o original
function nmRaiz(pasta, copia) {
  const origem = path.join(pasta, 'node_modules'), destino = path.join(copia, 'node_modules');
  if (!ehDir(origem)) return;
  if (ehLink(destino)) fs.rmdirSync(destino); // junção inteira de uma versão anterior (só o link)
  const raizReal = norm(fs.realpathSync(pasta));
  const liga = (o, d) => {
    if (existe(d) || !ehDir(o)) return; // arquivos (ex.: .package-lock.json) não entram
    let alvo = o;
    if (ehLink(o)) {
      const real = fs.realpathSync(o), n = norm(real);
      if (n === raizReal || n.startsWith(raizReal + path.sep)) {
        const eq = path.join(copia, path.relative(fs.realpathSync(pasta), real));
        if (fs.existsSync(eq)) alvo = eq;
      }
    }
    junta(d, alvo);
  };
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origem, { withFileTypes: true })) {
    const o = path.join(origem, e.name), d = path.join(destino, e.name);
    if (e.name.startsWith('@') && e.isDirectory()) { // pasta de escopo real: diretório real + entradas
      fs.mkdirSync(d, { recursive: true });
      for (const s of fs.readdirSync(o)) liga(path.join(o, s), path.join(d, s));
    } else liga(o, d);
  }
}
// desfaz toda junção node_modules da cópia (sem apagar a origem; rmdir não recursivo)
export const soltarJuncoes = (dir, nivel = 0) => {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    const p = path.join(dir, d.name);
    if (d.name === 'node_modules') {
      try {
        if (ehLink(p)) fs.rmdirSync(p);
        else if (nivel === 0) { // raiz real: solta cada junção (e escopos) e remove os diretórios vazios
          for (const e of fs.readdirSync(p)) {
            const q = path.join(p, e);
            if (ehLink(q)) fs.rmdirSync(q);
            else if (e.startsWith('@')) {
              for (const s of fs.readdirSync(q)) if (ehLink(path.join(q, s))) fs.rmdirSync(path.join(q, s));
              try { fs.rmdirSync(q); } catch {}
            }
          }
          try { fs.rmdirSync(p); } catch {}
        }
      } catch {}
    }
    else if (d.name !== '.git' && d.isDirectory() && nivel < 3) soltarJuncoes(p, nivel + 1);
  }
};

export function prepararCopia({ pasta, id, dirCopias }) {
  const ramo = `fila/${id}`, copia = path.join(dirCopias, String(id));
  if (!fs.existsSync(copia)) {
    git(pasta, 'worktree', 'prune');
    fs.mkdirSync(dirCopias, { recursive: true });
    if (ok(pasta, 'rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`)) git(pasta, 'worktree', 'add', copia, ramo);
    else git(pasta, 'worktree', 'add', copia, '-b', ramo, 'HEAD');
  }
  nmRaiz(pasta, copia);
  for (const nm of pastasNm(pasta).filter(nm => nm !== 'node_modules')) {
    const origem = path.join(pasta, nm), junc = path.join(copia, nm);
    if (!fs.existsSync(origem) || existe(junc) || !fs.existsSync(path.dirname(junc))) continue;
    junta(junc, origem);
  }
  return { copia, ramo, base: git(pasta, 'merge-base', 'HEAD', ramo).trim() };
}

// alterações sem commit na cópia (node_modules não conta)
export const sujo = (copia) => git(copia, 'status', '--porcelain').split('\n').filter(l => l.trim() && !/(^|[\\/ ])node_modules\/?$/.test(l.trim())).length > 0;

export function alteracoes({ copia, base, ramo }) {
  const faixa = `${base}..${ramo}`;
  const arquivos = git(copia, 'diff', '--numstat', faixa).split('\n').filter(Boolean).map(l => {
    const [mais, menos, ...arq] = l.split('\t');
    return { arq: arq.join('\t'), mais: Number(mais) || 0, menos: Number(menos) || 0 };
  });
  return { commits: Number(git(copia, 'rev-list', '--count', faixa).trim()), arquivos, diff: git(copia, 'diff', faixa) };
}

export function descartar({ pasta, ramo, copia }) {
  soltarJuncoes(copia);
  if (fs.existsSync(copia)) git(pasta, 'worktree', 'remove', '--force', copia);
  git(pasta, 'worktree', 'prune');
  if (ok(pasta, 'rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`)) git(pasta, 'branch', '-D', ramo);
}

// ignorar: caminho do quadro (relativo à pasta); versionado no repositório e regravado a cada movimento, não conta como sujo
export function aceitar({ pasta, ramo, copia, ignorar }) {
  if (git(pasta, 'status', '--porcelain', '--untracked-files=no', '--', '.', ...(ignorar ? [`:(exclude)${ignorar}`] : [])).trim()) return { ok: false, motivo: 'o ramo atual tem alterações sem commit' };
  if (Number(git(pasta, 'rev-list', '--count', `HEAD..${ramo}`).trim()) === 0) return { ok: false, motivo: 'nada para juntar: o ramo não tem commits novos' };
  try { git(pasta, 'merge', '--no-ff', ramo, '-m', `Fila: ${ramo}`); }
  catch (e) {
    const arqs = git(pasta, 'diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean);
    ok(pasta, 'merge', '--abort');
    return { ok: false, motivo: arqs.length ? `conflito ao juntar: ${arqs.join(', ')}` : `não foi possível juntar: ${e.message.split('\n').filter(Boolean).slice(0, 3).join(' ')}` };
  }
  try { descartar({ pasta, ramo, copia }); } catch (e) { return { ok: true, aviso: e.message }; }
  return { ok: true };
}
