import assert from 'node:assert';
import { ler } from './quadro.mjs';
import { podeExecutar, proximo, marcar, comandoTestes } from './fila.mjs';
const c = (meta) => ler(`## Fila\n\n### X\n<!-- id: x · ${meta} -->\n`).colunas.find(k => k.nome === 'Fila').cartoes[0];
assert.deepStrictEqual(podeExecutar(c('categoria: bug'), { temGit: true }), { ok: true });
for (const [meta, motivo] of [['area: producao', /produção/], ['area: terceiros', /terceiros/], ['adiado', /adiado/], ['categoria: ideia', /ideia/]])
  assert.match(podeExecutar(c(meta), { temGit: true }).motivo, motivo);
assert.match(podeExecutar(c('categoria: bug'), { temGit: false }).motivo, /git/);
const q = ler('## Fila\n\n### Ideia\n<!-- id: i · categoria: ideia -->\n\n### Bom\n<!-- id: b -->\n');
assert.strictEqual(proximo([{ projeto: { id: 's', temGit: true }, quadro: q }]).cartao.id, 'b', 'pula o recusado');
assert.strictEqual(proximo([{ projeto: { id: 's', temGit: true }, quadro: ler('## A fazer\n\n### A\n') }]), null);
const m = marcar(q, 'b', { exec: 'rodando', ramo: 'fila/b' }), b = m.colunas.find(k => k.nome === 'Fila').cartoes[1];
assert.deepStrictEqual(b.outros, { exec: 'rodando', ramo: 'fila/b' });
assert.deepStrictEqual(marcar(m, 'b', { exec: null }).colunas.find(k => k.nome === 'Fila').cartoes[1].outros, { ramo: 'fila/b' });
assert.strictEqual(comandoTestes('**Regras:**\n- Testes: `npm test` (motor, carga e backend).'), 'npm test');
assert.strictEqual(comandoTestes('sem linha'), 'npm test');
console.log('ok regras da Fila');
