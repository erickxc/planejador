// node quadro.check.mjs — leitura/escrita do quadro em Markdown e os quadros dos sistemas do projetos.json
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ler, escrever, mover, salvar, excluir } from './quadro.mjs';

const md = `# Quadro

Texto do cabeçalho.

---

## Decidir

### Tela admin
<!-- id: admin · categoria: ideia · prioridade: baixa · area: produto · adiado -->
- **Onde:** outra porta.

| a | b |
|---|---|
| 1 | 2 |

## A fazer

### Sem meta
Corpo simples.

## Inventada

### Cartão numa coluna extra
<!-- id: extra -->
`;
const q = ler(md);
assert.deepStrictEqual(q.colunas.map(c => c.nome), ['Entrada', 'Decidir', 'A fazer', 'Fila', 'Fazendo', 'Revisar', 'Postergar', 'Terceiros', 'Feito', 'Inventada']);
const admin = q.colunas[1].cartoes[0];
assert(admin.id === 'admin' && admin.categoria === 'ideia' && admin.prioridade === 'baixa' && admin.area === 'produto' && admin.adiado && admin.corpo.includes('| 1 | 2 |'), 'cartão com meta');
assert.strictEqual(q.colunas[2].cartoes[0].id, 'sem-meta', 'id pelo título');
const md2 = escrever(q);
assert.strictEqual(escrever(ler(md2)), md2, 'ler → escrever é estável');
let q2 = mover(q, 'admin', 'A fazer', 0);
assert(q2.colunas[2].cartoes[0].id === 'admin' && !q2.colunas[1].cartoes.length, 'mover');
q2 = salvar(q2, { titulo: 'Novo item', coluna: 'Entrada', prioridade: 'alta', origem: 'planejador', corpo: 'x' });
assert(q2.colunas[0].cartoes[0].id === 'novo-item' && q2.colunas[0].cartoes[0].origem === 'planejador', 'criar');
q2 = salvar(q2, { id: 'novo-item', titulo: 'Novo item editado', prioridade: 'media' });
assert(q2.colunas[0].cartoes[0].titulo === 'Novo item editado', 'editar');
assert(!excluir(q2, 'novo-item').colunas[0].cartoes.length, 'excluir');
assert.throws(() => salvar(q2, { titulo: ' ' }), /título/);
assert.throws(() => salvar(q2, { titulo: 'x', categoria: 'coisa' }), /categoria/);
// modelo de quadro novo: as 9 colunas, sem cartões
const modelo = ler(readFileSync(new URL('./modelo.md', import.meta.url), 'utf8'));
assert(modelo.colunas.length === 9 && modelo.colunas.every(c => !c.cartoes.length), 'modelo');
// quadros dos sistemas: cada um lê e regrava sem perder cartões
const projetos = JSON.parse(readFileSync(new URL('./projetos.json', import.meta.url), 'utf8'));
let n = 0;
for (const p of projetos) {
  const f = p.quadro ? (isAbsolute(p.quadro) ? p.quadro : join(p.pasta, p.quadro)) : new URL(`./quadros/${p.id}.md`, import.meta.url);
  if (!existsSync(f)) continue;
  const qp = ler(readFileSync(f, 'utf8')), k = qp.colunas.reduce((a, c) => a + c.cartoes.length, 0);
  assert.strictEqual(ler(escrever(qp)).colunas.reduce((a, c) => a + c.cartoes.length, 0), k, `ida e volta de ${p.nome}`);
  n += k;
}
console.log(`ok quadro em Markdown (ida e volta, mover, criar, editar, excluir, modelo; ${n} cartões nos quadros dos sistemas)`);

{
  const q = ler(md); // o md do topo do arquivo, sem as colunas novas
  assert.deepStrictEqual(q.colunas.slice(0, 9).map(c => c.nome), ['Entrada', 'Decidir', 'A fazer', 'Fila', 'Fazendo', 'Revisar', 'Postergar', 'Terceiros', 'Feito']);
  assert(!/## (Fila|Revisar|Postergar)/.test(escrever(q)), 'colunas novas vazias não vão para o arquivo');
  const q2 = mover(q, ler(md).colunas.flatMap(c => c.cartoes)[0].id, 'Fila');
  assert(/## Fila/.test(escrever(q2)), 'Fila com cartão vai para o arquivo');
  const c = ler('## Fazendo\n\n### T\n<!-- id: t · exec: rodando · ramo: fila/t · inicio: 2026-10-06T10:00 -->\n').colunas.find(x => x.nome === 'Fazendo').cartoes[0];
  assert.deepStrictEqual(c.outros, { exec: 'rodando', ramo: 'fila/t', inicio: '2026-10-06T10:00' });
  assert(escrever(ler('## Fazendo\n\n### T\n<!-- id: t · exec: rodando · ramo: fila/t · inicio: 2026-10-06T10:00 -->\n')).includes('exec: rodando · ramo: fila/t · inicio: 2026-10-06T10:00'));
}
console.log('ok colunas Fila, Revisar e Postergar');
