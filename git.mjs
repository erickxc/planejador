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
// desfaz toda junção node_modules da cópia (sem apagar a origem)
const soltarJuncoes = (dir, nivel = 0) => {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    const p = path.join(dir, d.name);
    if (d.name === 'node_modules') { try { if (fs.lstatSync(p).isSymbolicLink()) fs.rmdirSync(p); } catch {} }
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
  for (const nm of pastasNm(pasta)) {
    const origem = path.join(pasta, nm), junc = path.join(copia, nm);
    if (!fs.existsSync(origem) || existe(junc) || !fs.existsSync(path.dirname(junc))) continue;
    try { execFileSync('cmd', ['/c', 'mklink', '/J', junc, origem], { stdio: 'pipe' }); }
    catch (e) { throw new Error(`mklink falhou: ${(e.stderr || e.message).toString().trim()}`); }
  }
  return { copia, ramo, base: git(pasta, 'merge-base', 'HEAD', ramo).trim() };
}

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

export function aceitar({ pasta, ramo, copia }) {
  if (git(pasta, 'status', '--porcelain').trim()) return { ok: false, motivo: 'o ramo atual tem alterações sem commit' };
  try { git(pasta, 'merge', '--no-ff', ramo, '-m', `Fila: ${ramo}`); }
  catch (e) {
    const arqs = git(pasta, 'diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean);
    ok(pasta, 'merge', '--abort');
    return { ok: false, motivo: arqs.length ? `conflito ao juntar: ${arqs.join(', ')}` : e.message };
  }
  try { descartar({ pasta, ramo, copia }); } catch (e) { return { ok: true, aviso: e.message }; }
  return { ok: true };
}
