import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { temGit, prepararCopia, alteracoes, aceitar, descartar, soltarJuncoes } from './git.mjs';

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'plan fila '));
const pasta = path.join(raiz, 'sis'), dirCopias = path.join(raiz, 'copias');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
try {
  fs.mkdirSync(pasta, { recursive: true });
  g(pasta, 'init', '-q'); g(pasta, 'config', 'user.name', 't'); g(pasta, 'config', 'user.email', 't@t');
  w(path.join(pasta, '.gitignore'), 'node_modules/\n');
  w(path.join(pasta, 'package.json'), JSON.stringify({ workspaces: ['app', 'pk/*', '!x'] }));
  w(path.join(pasta, 'node_modules/lib/x.txt'), 'x'); w(path.join(pasta, 'app/node_modules/y.txt'), 'y');
  w(path.join(pasta, 'pk/a/node_modules/z.txt'), 'z'); w(path.join(pasta, 'pk/b/node_modules/w.txt'), 'w'); w(path.join(pasta, 'pk/a/q.txt'), 'q'); w(path.join(pasta, 'pk/b/q.txt'), 'q');
  w(path.join(pasta, 'app/p.txt'), 'p'); w(path.join(pasta, 'a.txt'), 'velho\n');
  g(pasta, 'add', '.'); g(pasta, 'commit', '-qm', 'inicial');
  assert.strictEqual(temGit(pasta), true);
  assert.strictEqual(temGit(raiz), false);

  const r = prepararCopia({ pasta, id: 't1', dirCopias });
  assert.strictEqual(r.ramo, 'fila/t1');
  assert.ok(fs.existsSync(r.copia));
  assert.strictEqual(fs.readFileSync(path.join(r.copia, 'node_modules/lib/x.txt'), 'utf8'), 'x');
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
  w(path.join(pasta, 'app/p.txt'), 'mudou'); // modificado bloqueia
  assert.match(aceitar({ pasta, ...r }).motivo, /sem commit/);
  g(pasta, 'checkout', 'app/p.txt');
  w(path.join(pasta, 'b.txt'), 'b'); // não rastreado não bloqueia
  const nb = aceitar({ pasta, ...r });
  fs.rmSync(path.join(pasta, 'b.txt'));
  assert.deepStrictEqual(nb, { ok: true });
  assert.strictEqual(fs.readFileSync(path.join(pasta, 'a.txt'), 'utf8').trim(), 'novo');
  assert.ok(!fs.existsSync(r.copia));
  assert.strictEqual(g(pasta, 'branch', '--list', r.ramo).trim(), '');
  assert.ok(fs.existsSync(path.join(pasta, 'node_modules/lib/x.txt')));
  assert.ok(fs.existsSync(path.join(pasta, 'app/node_modules/y.txt')));

  // quadro versionado e modificado: não bloqueia o aceitar
  w(path.join(pasta, 'quadro.md'), 'v1\n'); g(pasta, 'add', 'quadro.md'); g(pasta, 'commit', '-qm', 'quadro');
  const qd = prepararCopia({ pasta, id: 'tq', dirCopias });
  w(path.join(qd.copia, 'novo.txt'), 'n\n'); g(qd.copia, 'add', '-A'); g(qd.copia, 'commit', '-qm', 'copia');
  w(path.join(pasta, 'quadro.md'), 'v2 movido\n');
  assert.match(aceitar({ pasta, ...qd }).motivo, /sem commit/);
  assert.deepStrictEqual(aceitar({ pasta, ...qd, ignorar: 'quadro.md' }), { ok: true });
  assert.strictEqual(fs.readFileSync(path.join(pasta, 'quadro.md'), 'utf8'), 'v2 movido\n');
  g(pasta, 'commit', '-qam', 'quadro movido');

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
  assert.ok(fs.existsSync(path.join(pasta, 'node_modules/lib/x.txt')));
  assert.ok(fs.existsSync(path.join(pasta, 'pk/a/node_modules/z.txt')));
  assert.ok(fs.existsSync(path.join(pasta, 'pk/b/node_modules/w.txt')));
  // aceitar sem commits novos
  const z = prepararCopia({ pasta, id: 'z', dirCopias });
  assert.match(aceitar({ pasta, ...z }).motivo, /nada para juntar/);
  descartar({ pasta, ...z });

  // monorepo: link de workspace no node_modules da raiz aponta para a CÓPIA; o resto, para o original
  w(path.join(pasta, 'pk/a/package.json'), JSON.stringify({ name: '@t/a' })); g(pasta, 'add', '.'); g(pasta, 'commit', '-qm', 'pk a');
  fs.mkdirSync(path.join(pasta, 'node_modules/@t'), { recursive: true });
  execFileSync('cmd', ['/c', 'mklink', '/J', path.join(pasta, 'node_modules/@t/a'), path.join(pasta, 'pk/a')], { stdio: 'pipe' });
  const m = prepararCopia({ pasta, id: 'm', dirCopias });
  assert.ok(!fs.lstatSync(path.join(m.copia, 'node_modules')).isSymbolicLink());
  assert.strictEqual(fs.realpathSync(path.join(m.copia, 'node_modules/@t/a')).toLowerCase(), fs.realpathSync(path.join(m.copia, 'pk/a')).toLowerCase());
  assert.notStrictEqual(fs.realpathSync(path.join(m.copia, 'node_modules/@t/a')).toLowerCase(), fs.realpathSync(path.join(pasta, 'pk/a')).toLowerCase());
  assert.strictEqual(fs.readFileSync(path.join(m.copia, 'node_modules/lib/x.txt'), 'utf8'), 'x');
  assert.strictEqual(prepararCopia({ pasta, id: 'm', dirCopias }).copia, m.copia); // repetir não quebra
  descartar({ pasta, ...m });
  assert.ok(!fs.existsSync(m.copia));
  assert.ok(fs.existsSync(path.join(pasta, 'node_modules/lib/x.txt')));
  assert.ok(fs.existsSync(path.join(pasta, 'pk/a/package.json')));
  assert.ok(fs.existsSync(path.join(pasta, 'node_modules/@t/a/package.json')));
  console.log('ok git: cópia, alterações, aceitar, conflito e descartar');
} finally {
  if (fs.existsSync(dirCopias)) for (const d of fs.readdirSync(dirCopias)) soltarJuncoes(path.join(dirCopias, d));
  fs.rmSync(raiz, { recursive: true, force: true });
}
