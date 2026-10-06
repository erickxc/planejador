// Agente falso dos testes: node teste/agente-falso.mjs <copia> <ok|nada|sujo|lento>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [copia, modo] = process.argv.slice(2);
if (modo === 'lento') setTimeout(() => {}, 60_000);
else if (modo === 'ok' || modo === 'sujo') {
  fs.appendFileSync(path.join(copia, 'a.txt'), `linha ${Date.now()}\n`);
  execFileSync('git', ['add', '-A'], { cwd: copia });
  execFileSync('git', ['commit', '-qm', 'agente falso'], { cwd: copia });
}
if (modo === 'sujo') fs.appendFileSync(path.join(copia, 'a.txt'), 'sem commit\n');
