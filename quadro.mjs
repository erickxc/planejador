// Quadro kanban guardado em Markdown (docs/PENDENCIAS.md): a fonte de verdade do quadro e do agente planejador.
//   ## <coluna>          uma das COLUNAS (outra ## vira coluna extra, no fim)
//   ### <título>         um cartão
//   <!-- id: x · categoria: bug · prioridade: alta · area: produto · adiado · origem: planejador -->   (opcional, logo abaixo do título)
//   corpo em Markdown    até o próximo ### ou ##
// O que vem antes da primeira ## é o cabeçalho; texto entre a ## e o 1º ### é a introdução da coluna. ler() + escrever()
// devolvem o mesmo arquivo (fora espaços em branco nas pontas), então editar pelo quadro não estraga o que foi escrito à mão.
export const COLUNAS = ['Entrada', 'Decidir', 'A fazer', 'Fila', 'Fazendo', 'Revisar', 'Postergar', 'Terceiros', 'Feito'];
export const NOVAS = ['Fila', 'Revisar', 'Postergar'];
export const PRIORIDADES = ['alta', 'media', 'baixa'];
export const CATEGORIAS = ['implementacao', 'melhoria', 'ideia', 'plano', 'bug', 'erro', 'problema', 'pesquisa', 'documentacao'];

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'cartao';
const META = /^<!--\s*(.*?)\s*-->\s*$/;
// tira linhas vazias das pontas e o separador '---' do fim (escrever() põe um antes de cada coluna)
const aparar = ls => { const a = [...ls]; while (a.length && !a[0].trim()) a.shift(); while (a.length && (!a.at(-1).trim() || a.at(-1).trim() === '---')) a.pop(); return a; };

function lerMeta(txt) {
  const m = {};
  for (const parte of txt.split('·').map(s => s.trim()).filter(Boolean)) {
    const i = parte.indexOf(':');
    if (i < 0) m[parte] = true; else m[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  return m;
}
const escreverMeta = c => [`id: ${c.id}`, c.categoria && `categoria: ${c.categoria}`, c.prioridade && `prioridade: ${c.prioridade}`, c.area && `area: ${c.area}`, c.adiado && 'adiado',
  c.origem && `origem: ${c.origem}`, ...Object.entries(c.outros || {}).map(([k, v]) => (v === true ? k : `${k}: ${v}`))].filter(Boolean).join(' · ');

export function ler(md) {
  const cabecalho = [], colunas = COLUNAS.map(nome => ({ nome, intro: [], cartoes: [] }));
  let col = null, card = null;
  for (const l of md.replace(/\r\n/g, '\n').split('\n')) {
    const h2 = /^## (.+?)\s*$/.exec(l), h3 = /^### (.+?)\s*$/.exec(l);
    if (h2) {
      col = colunas.find(c => c.nome.toLowerCase() === h2[1].toLowerCase());
      if (!col) colunas.push(col = { nome: h2[1], intro: [], cartoes: [] });
      card = null; continue;
    }
    if (!col) { cabecalho.push(l); continue; }
    if (h3) { col.cartoes.push(card = { titulo: h3[1], meta: null, corpo: [] }); continue; }
    if (!card) { col.intro.push(l); continue; }
    if (card.meta == null && !card.corpo.some(x => x.trim()) && META.test(l)) { card.meta = lerMeta(META.exec(l)[1]); continue; }
    card.corpo.push(l);
  }
  const usados = new Set();
  for (const c of colunas) {
    c.intro = aparar(c.intro).join('\n');
    c.cartoes = c.cartoes.map(x => {
      const { id, categoria, prioridade, area, adiado, origem, ...outros } = x.meta || {};
      let i = id || slug(x.titulo), n = 2;
      while (usados.has(i)) i = `${id || slug(x.titulo)}-${n++}`;
      usados.add(i);
      return { id: i, titulo: x.titulo, categoria: categoria || '', prioridade: prioridade || '', area: area || '', adiado: !!adiado, origem: origem || '', outros, corpo: aparar(x.corpo).join('\n'), coluna: c.nome };
    });
  }
  return { cabecalho: aparar(cabecalho).join('\n'), colunas };
}

export function escrever(q) {
  const out = [q.cabecalho.trim(), ''];
  for (const c of q.colunas) {
    if (NOVAS.includes(c.nome) && !c.cartoes.length) continue;
    out.push('---', '', `## ${c.nome}`, '');
    if (c.intro?.trim()) out.push(c.intro.trim(), '');
    for (const x of c.cartoes) {
      out.push(`### ${x.titulo}`, `<!-- ${escreverMeta(x)} -->`);
      if (x.corpo?.trim()) out.push(x.corpo.trim());
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// operações do quadro (devolvem um quadro novo; quem chama grava com escrever())
const achar = (q, id) => { for (const c of q.colunas) { const i = c.cartoes.findIndex(x => x.id === id); if (i >= 0) return { c, i }; } return null; };
const clonar = q => JSON.parse(JSON.stringify(q));

export function mover(q0, id, coluna, posicao = Infinity) {
  const q = clonar(q0), a = achar(q, id), destino = q.colunas.find(c => c.nome === coluna);
  if (!a || !destino) throw new Error(`cartão ${id} ou coluna ${coluna} não existe`);
  const [x] = a.c.cartoes.splice(a.i, 1);
  x.coluna = coluna;
  destino.cartoes.splice(Math.max(0, Math.min(posicao, destino.cartoes.length)), 0, x);
  return q;
}
export function salvar(q0, dados) {
  const q = clonar(q0), titulo = String(dados.titulo || '').trim();
  if (!titulo) throw new Error('o cartão precisa de título');
  if (dados.categoria && !CATEGORIAS.includes(dados.categoria)) throw new Error('categoria inválida');
  if (dados.prioridade && !PRIORIDADES.includes(dados.prioridade)) throw new Error('prioridade inválida');
  const a = dados.id && achar(q, dados.id);
  if (a) { Object.assign(a.c.cartoes[a.i], { ...dados, titulo }); return q; }
  const col = q.colunas.find(c => c.nome === (dados.coluna || 'Entrada'));
  if (!col) throw new Error('coluna inexistente');
  const ids = new Set(q.colunas.flatMap(c => c.cartoes.map(x => x.id)));
  let id = slug(titulo), n = 2; while (ids.has(id)) id = `${slug(titulo)}-${n++}`;
  col.cartoes.push({ id, titulo, categoria: dados.categoria || '', prioridade: dados.prioridade || '', area: dados.area || '', adiado: !!dados.adiado, origem: dados.origem || '', outros: {}, corpo: dados.corpo || '', coluna: col.nome });
  return q;
}
export function excluir(q0, id) {
  const q = clonar(q0), a = achar(q, id);
  if (!a) throw new Error(`cartão ${id} não existe`);
  a.c.cartoes.splice(a.i, 1);
  return q;
}
