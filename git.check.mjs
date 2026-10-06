import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { temGit, prepararCopia, alteracoes, aceitar, descartar } from './git.mjs';

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'plan fila '));
const pasta = path.join(raiz, 'sis'), dirCopias = path.join(raiz, 'copias');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const solta = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.name === 'node_modules') { try { if (fs.lstatSync(p).isSymbolicLink()) fs.rmdirSync(p); } catch {} } else if (e.isDirectory() && e.name !== '.git') solta(p); } };
try {
  fs.mkdirSync(pasta, { recursive: true });
  g(pasta, 'init', '-q'); g(pasta, 'config', 'user.name', 't'); g(pasta, 'config', 'user.email', 't@t');
  w(path.join(pasta, '.gitignore'), 'node_modules/\n');
  w(path.join(pasta, 'package.json'), JSON.stringify({ workspaces: ['app', 'pk/*', '!x'] }));
  w(path.join(pasta, 'node_modules/x.txt'), 'x'); w(path.join(pasta, 'app/node_modules/y.txt'), 'y');
  w(path.join(pasta, 'pk/a/node_modules/z.txt'), 'z'); w(path.join(pasta, 'pk/b/node_modules/w.txt'), 'w'); w(path.join(pasta, 'pk/a/q.txt'), 'q'); w(path.join(pasta, 'pk/b/q.txt'), 'q');
  w(path.join(pasta, 'app/p.txt'), 'p'); w(path.join(pasta, 'a.txt'), 'velho\n');
  g(pasta, 'add', '.'); g(pasta, 'commit', '-qm', 'inicial');
  assert.strictEqual(temGit(pasta), true);
  assert.strictEqual(temGit(raiz), false);

  const r = prepararCopia({ pasta, id: 't1', dirCopias });
  assert.strictEqual(r.ramo, 'fila/t1');
  assert.ok(fs.existsSync(r.copia));
  assert.strictEqual(fs.readFileSync(path.join(r.copia, 'node_modules/x.txt'), 'utf8'), 'x');
  assert.strictEqual(fs.readFileSync(path.join(r.copia, 'app/node_modules/y.txt'), 'utf8'), 'y');
  assert.strictEqual(fs.readFileSync(path.join(r.copia, 'pk/a/node_modules/z.txt'), 'utf8'), 'z');
  assert.strictEqual(fs.readFileSync(path.join(r.copia, 'pk/b/node_modules/w.txt'), 'utf8'), 'w');
  assert.strictEqual(prepararCopia({ pasta, id: 't1', dirCopias }).copia, r.copia);
  assert.strictEqual(g(r.copia, 'status', '--porcelain'), '');

  assert.deepStrictEqual(alteracoes(r), { commits: 0, arquivos: [], diff: '' });
  w(path.join(r.copia, 'a.txt'), 'novo\n'); g(r.copia, 'commit', '-qam', 'muda');
  const al = alteracoes(r);
  assert.strictEqual(al.commits, 1);
  assert.deepStrictEqual(al.arquivos, [{ arq: 'a.txt', mais: 1, menos: 1 }]);
  assert.match(al.diff, /\+novo/);

  w(path.join(pasta, 'b.txt'), 'b');
  assert.match(aceitar({ pasta, ...r }).motivo, /sem commit/);
  fs.rmSync(path.join(pasta, 'b.txt'));
  assert.deepStrictEqual(aceitar({ pasta, ...r }), { ok: true });
  assert.strictEqual(fs.readFileSync(path.join(pasta, 'a.txt'), 'utf8').trim(), 'novo');
  assert.ok(!fs.existsSync(r.copia));
  assert.strictEqual(g(pasta, 'branch', '--list', r.ramo).trim(), '');
  assert.ok(fs.existsSync(path.join(pasta, 'node_modules/x.txt')));
  assert.ok(fs.existsSync(path.join(pasta, 'app/node_modules/y.txt')));

  // conflito
  const c = prepararCopia({ pasta, id: 't2', dirCopias });
  w(path.join(c.copia, 'a.txt'), 'da copia\n'); g(c.copia, 'commit', '-qam', 'copia');
  w(path.join(pasta, 'a.txt'), 'do sistema\n'); g(pasta, 'commit', '-qam', 'sistema');
  assert.match(aceitar({ pasta, ...c }).motivo, /conflito/);
  assert.strictEqual(g(pasta, 'status', '--porcelain'), '');

  // descartar
  descartar({ pasta, ...c });
  assert.ok(!fs.existsSync(c.copia));
  assert.strictEqual(g(pasta, 'branch', '--list', c.ramo).trim(), '');
  assert.ok(fs.existsSync(path.join(pasta, 'node_modules/x.txt')));
  assert.ok(fs.existsSync(path.join(pasta, 'pk/a/node_modules/z.txt')));
  assert.ok(fs.existsSync(path.join(pasta, 'pk/b/node_modules/w.txt')));
  console.log('ok git: cópia, alterações, aceitar, conflito e descartar');
} finally {
  if (fs.existsSync(dirCopias)) for (const d of fs.readdirSync(dirCopias)) solta(path.join(dirCopias, d));
  fs.rmSync(raiz, { recursive: true, force: true });
}
