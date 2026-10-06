// Markdown mínimo para os cartões e o rumo: títulos, listas (com subitens), tabelas, negrito, itálico, código e links.
// Sem HTML cru: tudo vira elemento React (nada de innerHTML).
const inline = (txt, k = 0) => {
  const out = [], re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|_([^_]+)_)/g;
  let ult = 0, m;
  while ((m = re.exec(txt))) {
    if (m.index > ult) out.push(txt.slice(ult, m.index));
    const ch = `${k}-${m.index}`;
    if (m[2]) out.push(<b key={ch}>{m[2]}</b>);
    else if (m[3]) out.push(<code key={ch}>{m[3]}</code>);
    else if (m[4]) out.push(<a key={ch} href={m[5]} target="_blank" rel="noreferrer">{m[4]}</a>);
    else if (m[6]) out.push(<i key={ch}>{m[6]}</i>);
    ult = m.index + m[0].length;
  }
  if (ult < txt.length) out.push(txt.slice(ult));
  return out;
};

function lista(linhas, i0) {
  // itens "- " ou "1. "; subitens com 2+ espaços de recuo
  const itens = []; let i = i0;
  const nivel = l => l.match(/^(\s*)/)[1].length;
  const base = nivel(linhas[i0]), ordenada = /^\s*\d+\.\s/.test(linhas[i0]);
  while (i < linhas.length && /^\s*([-*]|\d+\.)\s/.test(linhas[i]) && nivel(linhas[i]) >= base) {
    if (nivel(linhas[i]) > base) { const [sub, j] = lista(linhas, i); itens.at(-1)?.sub.push(sub); i = j; continue; }
    itens.push({ txt: linhas[i].replace(/^\s*([-*]|\d+\.)\s/, ''), sub: [] }); i++;
  }
  const Tag = ordenada ? 'ol' : 'ul';
  return [<Tag key={i0}>{itens.map((x, n) => <li key={n}>{inline(x.txt, n)}{x.sub}</li>)}</Tag>, i];
}

export default function Markdown({ texto = '' }) {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n'), out = [];
  for (let i = 0; i < linhas.length;) {
    const l = linhas[i];
    if (!l.trim() || /^<!--.*-->$/.test(l.trim())) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)/.exec(l);
    if (h) { const T = `h${Math.min(6, h[1].length + 2)}`; out.push(<T key={i}>{inline(h[2], i)}</T>); i++; continue; }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) { const [el, j] = lista(linhas, i); out.push(el); i = j; continue; }
    if (/^\s*\|/.test(l)) {
      const tab = []; while (i < linhas.length && /^\s*\|/.test(linhas[i])) tab.push(linhas[i++]);
      const cel = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const [cab, , ...corpo] = tab;
      out.push(<div key={i} className="md-tab"><table><thead><tr>{cel(cab).map((c, n) => <th key={n}>{inline(c, n)}</th>)}</tr></thead>
        <tbody>{corpo.map((r, n) => <tr key={n}>{cel(r).map((c, m) => <td key={m}>{inline(c, m)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^```/.test(l)) { const bloco = []; i++; while (i < linhas.length && !/^```/.test(linhas[i])) bloco.push(linhas[i++]); i++; out.push(<pre key={i}>{bloco.join('\n')}</pre>); continue; }
    if (/^---+$/.test(l.trim())) { out.push(<hr key={i} />); i++; continue; }
    const par = []; while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|\s*([-*]|\d+\.)\s|\s*\||```)/.test(linhas[i])) par.push(linhas[i++]);
    out.push(<p key={i}>{inline(par.join(' '), i)}</p>);
  }
  return <div className="md">{out}</div>;
}
