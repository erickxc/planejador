import { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Plus, Search, Sparkles, X, Clock, CircleAlert, Trash2, Save, RefreshCw, PanelRightClose, PanelRightOpen, Pencil, Star, ArrowLeft } from 'lucide-react';
import Markdown from './Markdown.jsx';
import Revisao from './Revisao.jsx';

// Planejador de todos os sistemas: um quadro kanban só, com os cartões de todos os sistemas (projetos.json) juntos,
// filtros de sistema e categoria, e o rumo do agente planejador por sistema no painel da direita.
const AREAS = ['produto', 'dados', 'qualidade', 'producao', 'terceiros'];
const NOME_AREA = { produto: 'Produto', dados: 'Dados', qualidade: 'Qualidade', producao: 'Produção', terceiros: 'Terceiros' };
const CATEGORIAS = ['implementacao', 'melhoria', 'ideia', 'plano', 'bug', 'erro', 'problema', 'pesquisa', 'documentacao'];
const NOME_CAT = { implementacao: 'Implementação', melhoria: 'Melhoria', ideia: 'Ideia', plano: 'Plano', bug: 'Bug', erro: 'Erro', problema: 'Problema', pesquisa: 'Pesquisa', documentacao: 'Documentação' };
const NOME_PRIO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const DICA_COLUNA = {
  Entrada: 'Sugestões para revisar', Decidir: 'Esperando uma decisão sua', 'A fazer': 'Decidido, falta fazer',
  Fila: 'O agente faz, um por vez', Fazendo: 'Em andamento agora', Revisar: 'Pronto para você revisar', Postergar: 'Parado: o agente não pega',
  Terceiros: 'Depende de outras pessoas', Feito: 'Concluído',
};
const NOME_EXEC = { pronto: 'Pronto', falhou: 'Falhou', parado: 'Parado' };
const idExec = e => e && (e.projeto?.id || e.projeto); // o servidor manda o sistema (objeto ou id)
const hora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dur = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
const classeCol = nome => 'c-' + nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
// resumo do cartão: a 1ª linha de texto (tabelas ficam de fora: o cabeçalho não diz nada sozinho)
const primeiraLinha = c => (c.corpo || '').split('\n').filter(l => !l.trim().startsWith('|')).map(l => l.replace(/^[-*#>\s]+/, '').replace(/\*\*|`/g, '').trim()).find(Boolean) || '';
const semCrase = s => (s || '').replace(/`/g, '');
const lembrar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: só não lembra */ } };
const lido = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } };

async function chamar(url, corpo) {
  const r = await fetch(url, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || r.statusText);
  return j;
}

function Etiquetas({ c, longas = false }) {
  return (
    <div className="etiquetas">
      {c.projetoNome && <span className={'sistema' + (c.foco ? ' foco' : '')}>{c.projetoNome}</span>}
      {c.categoria && <span className={'cat k-' + c.categoria}>{NOME_CAT[c.categoria] || c.categoria}</span>}
      {c.prioridade && <span className={'prio ' + c.prioridade}><i />{NOME_PRIO[c.prioridade]}</span>}
      {c.area && <span className="area">{NOME_AREA[c.area] || c.area}</span>}
      {c.adiado && <span className="adiado"><Clock size={12} />Adiado</span>}
      {c.origem === 'planejador' && <span className="agente" title="Sugerido pelo planejador"><Sparkles size={12} />{longas ? 'Sugerido pelo planejador' : 'Planejador'}</span>}
    </div>
  );
}

// prévia: o texto completo do cartão ao lado dele, depois de um instante com o mouse parado em cima
function Previa({ c, pos }) {
  const ref = useRef(null), [y, setY] = useState(pos.top);
  useEffect(() => { const h = ref.current?.offsetHeight || 0; setY(Math.max(8, Math.min(pos.top, innerHeight - h - 8))); }, [pos.top]);
  return (
    <div ref={ref} className="previa" style={{ top: y, left: pos.left }}>
      <h3>{semCrase(c.titulo)}</h3>
      <Etiquetas c={c} />
      <Markdown texto={c.corpo || '_Sem descrição._'} />
    </div>
  );
}

function Cartao({ c, execucao, onAbrir, onSoltarAntes, onParar, onExcluir }) {
  const [sobre, setSobre] = useState(false), [previa, setPrevia] = useState(null), t = useRef(0);
  const resumo = primeiraLinha(c);
  const exec = c.outros?.exec, rodando = execucao && execucao.id === c.id && idExec(execucao) === c.projeto;
  const grav = c.prioridade === 'alta' || exec === 'falhou' ? ' grav-alta' : c.prioridade === 'media' ? ' grav-media' : '';
  const largura = 448; // 28rem
  const mostrar = e => {
    const r = e.currentTarget.getBoundingClientRect();
    clearTimeout(t.current);
    if (previa) return; // voltou do cartão para a prévia (ou vice-versa): continua aberta
    t.current = setTimeout(() => setPrevia({ top: r.top, left: r.right + 12 + largura < innerWidth ? r.right + 12 : Math.max(8, r.left - 12 - largura) }), 350);
  };
  const fechar = () => { clearTimeout(t.current); setPrevia(null); };
  // fecha com um pequeno atraso, para dar tempo de levar o mouse até a prévia e rolar o texto longo
  const esconder = () => { clearTimeout(t.current); t.current = setTimeout(() => setPrevia(null), 250); };
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <article className={'cartao' + grav + (rodando ? ' executando' : '') + (sobre ? ' alvo' : '')} draggable tabIndex={0} onMouseEnter={mostrar} onMouseLeave={esconder}
      onDragStart={e => { fechar(); e.dataTransfer.setData('text/plain', JSON.stringify({ id: c.id, projeto: c.projeto })); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSobre(true); }} onDragLeave={() => setSobre(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setSobre(false); onSoltarAntes(e.dataTransfer.getData('text/plain'), c); }}
      onClick={() => { fechar(); onAbrir(c); }} onKeyDown={e => e.key === 'Enter' && onAbrir(c)}>
      <h3>{semCrase(c.titulo)}</h3>
      {!rodando && <button className="ic lixo" title="Excluir" aria-label={`Excluir "${c.titulo}"`} onClick={e => { e.stopPropagation(); fechar(); onExcluir(c); }}><Trash2 size={14} /></button>}
      {resumo && <p>{resumo}</p>}
      <Etiquetas c={c} />
      {rodando && <div className="exec-info">
        <span className="selo rodando">executando há <Rodando inicio={execucao.inicio} /></span>
        <button className="sec mini-btn" onClick={e => { e.stopPropagation(); onParar(c); }}>Parar</button>
        {execucao.passo && <small>{execucao.passo}</small>}
      </div>}
      {!rodando && NOME_EXEC[exec] && <span className={'selo ' + exec}>{NOME_EXEC[exec]}</span>}
      {previa && <Previa c={c} pos={previa} />}
    </article>
  );
}

function Coluna({ col, cartoes, execucao, onAbrir, onSoltar, onNovo, onParar, onExcluir }) {
  const [sobre, setSobre] = useState(false);
  return (
    <section className={'coluna ' + classeCol(col.nome) + (sobre ? ' alvo' : '')}
      onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={e => !e.currentTarget.contains(e.relatedTarget) && setSobre(false)}
      onDrop={e => { e.preventDefault(); setSobre(false); onSoltar(e.dataTransfer.getData('text/plain'), col.nome, Infinity); }}>
      <header>
        <span className="ponto" />
        <div className="tit"><h2>{col.nome}</h2><small>{DICA_COLUNA[col.nome] || ''}</small></div>
        <span className="n">{cartoes.length}</span>
        <button className="ic mais" title={`Novo cartão em ${col.nome}`} onClick={() => onNovo(col.nome)}><Plus size={16} /></button>
      </header>
      <div className="lista">
        {cartoes.map(c => <Cartao key={(c.projeto || '') + c.id} c={c} execucao={execucao} onAbrir={onAbrir} onParar={onParar} onExcluir={onExcluir}
          onSoltarAntes={(dado, alvo) => onSoltar(dado, col.nome, col.cartoes.filter(x => x.projeto === alvo.projeto).findIndex(x => x.id === alvo.id))} />)}
        {!cartoes.length && <div className="vazia">Arraste um cartão para cá</div>}
      </div>
    </section>
  );
}

function Gaveta({ c, colunas, sistemas, onFechar, onSalvar, onExcluir }) {
  const novo = !c.id;
  const [ed, setEd] = useState(novo);
  const [f, setF] = useState(c);
  useEffect(() => { setF(c); setEd(!c.id); }, [c]);
  useEffect(() => { const esc = e => e.key === 'Escape' && onFechar(); addEventListener('keydown', esc); return () => removeEventListener('keydown', esc); }, [onFechar]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const nomeSistema = sistemas.find(s => s.id === f.projeto)?.nome;
  return (
    <div className="fundo" onClick={onFechar}>
      <aside className="gaveta" onClick={e => e.stopPropagation()} role="dialog" aria-label={c.titulo || 'Novo cartão'}>
        <header>
          <span className={'col-tag ' + classeCol(f.coluna)}><span className="ponto" />{f.coluna}{nomeSistema && <em> · {nomeSistema}</em>}</span>
          {!ed && <button className="ic" title="Excluir" aria-label="Excluir" onClick={() => onExcluir(c)}><Trash2 size={16} /></button>}
          {!ed && <button className="sec" onClick={() => setEd(true)}><Pencil size={14} />Editar</button>}
          <button className="ic" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </header>
        {ed ? (
          <form className="edicao" onSubmit={e => { e.preventDefault(); onSalvar(f); }}>
            <label>Título<input value={f.titulo || ''} onChange={set('titulo')} autoFocus required /></label>
            <div className="grade">
              {novo && <label>Sistema<select value={f.projeto} onChange={set('projeto')}>{sistemas.filter(s => s.existe).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>}
              <label>Coluna<select value={f.coluna} onChange={set('coluna')}>{colunas.map(n => <option key={n}>{n}</option>)}</select></label>
              <label>Categoria<select value={f.categoria || ''} onChange={set('categoria')}><option value="">Sem</option>{CATEGORIAS.map(k => <option key={k} value={k}>{NOME_CAT[k]}</option>)}</select></label>
              <label>Prioridade<select value={f.prioridade || ''} onChange={set('prioridade')}><option value="">Sem</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
              <label>Área<select value={f.area || ''} onChange={set('area')}><option value="">Sem</option>{AREAS.map(a => <option key={a} value={a}>{NOME_AREA[a]}</option>)}</select></label>
              <label className="chk"><input type="checkbox" checked={!!f.adiado} onChange={set('adiado')} />Adiado</label>
            </div>
            <label>Descrição <small>Markdown</small><textarea value={f.corpo || ''} onChange={set('corpo')} rows={18} /></label>
            <div className="acoes">
              {!novo && <button type="button" className="perigo" onClick={() => onExcluir(c)}><Trash2 size={15} />Excluir</button>}
              <span />
              <button type="button" className="sec" onClick={() => (novo ? onFechar() : (setF(c), setEd(false)))}>Cancelar</button>
              <button type="submit" className="pri"><Save size={15} />Salvar</button>
            </div>
          </form>
        ) : (
          <div className="leitura">
            <h2>{semCrase(c.titulo)}</h2>
            <Etiquetas c={c} longas />
            <Markdown texto={c.corpo} />
          </div>
        )}
      </aside>
    </div>
  );
}

function Rodando({ inicio }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  return <>{dur(agora - inicio)}</>;
}

// Rumo de um sistema: botão do agente, passos da rodada e o rumo escrito
function PainelRumo({ sistema, rumo, onPedir, onVoltar, onRecolher }) {
  const r = rumo?.rodada || {};
  const recente = r.passos?.length && r.fim && Date.now() - r.fim < 60e3;
  return (
    <aside className="rumo">
      <header>
        <div className="tit"><button className="ic" onClick={onVoltar} title="Todos os sistemas"><ArrowLeft size={16} /></button><h2>Rumo</h2><span className="de">{sistema?.nome}</span></div>
        <button className="ic" onClick={onRecolher} title="Recolher o painel"><PanelRightClose size={18} /></button>
      </header>
      <button className="pri largo" onClick={onPedir} disabled={r.rodando} title="Roda o planejador nos cartões da Fila deste sistema: completa cada um com o plano, ordena a Fila e atualiza o rumo. Enquanto ele roda, o executor espera.">
        {r.rodando ? <><RefreshCw size={15} className="gira" />Planejando… <Rodando inicio={r.inicio} /></> : <><Sparkles size={15} />Planejar a Fila</>}
      </button>
      {rumo?.mtime > 0 && !r.rodando && <p className="quando">Última rodada: {hora.format(rumo.mtime)}</p>}
      {(r.rodando || recente) ? <ol className="passos">{(r.passos || []).slice(-10).map((p, i) => <li key={i}>{p.txt}</li>)}</ol> : null}
      {r.ok === false && !r.rodando && <p className="erro"><CircleAlert size={14} />A última rodada terminou com erro. Rode de novo.</p>}
      <div className="rumo-corpo">
        {rumo?.md ? <Markdown texto={rumo.md.replace(/^# .*\n/, '')} />
          : !r.rodando && <p className="vazio">Ainda não há rumo para {sistema?.nome}. Coloque cartões na Fila e peça para planejar: o planejador completa cada um, ordena a Fila e diz a ordem.</p>}
      </div>
    </aside>
  );
}

// Visão "Todos": o próximo passo de cada sistema, com o foco primeiro
function PainelGeral({ sistemas, onAbrir, onPedir, onRecolher }) {
  const lista = [...sistemas].sort((a, b) => b.foco - a.foco || b.abertos - a.abertos);
  return (
    <aside className="rumo">
      <header>
        <div className="tit"><Compass size={18} /><h2>Rumo por sistema</h2></div>
        <button className="ic" onClick={onRecolher} title="Recolher o painel"><PanelRightClose size={18} /></button>
      </header>
      <ul className="geral">
        {lista.map(s => (
          <li key={s.id} className={(s.foco ? 'foco' : '') + (s.existe ? '' : ' sumiu')}>
            <button className="nome" onClick={() => onAbrir(s.id)}>{s.foco && <Star size={13} />}{s.nome}<span>{s.abertos} em aberto</span></button>
            {!s.existe ? <p className="sem">Pasta não encontrada</p>
              : s.proximo ? <p>{s.proximo}</p> : <p className="sem">Sem rumo ainda</p>}
            {s.existe && <button className="link-acao" onClick={() => onPedir(s.id)} disabled={s.rodando}>{s.rodando ? <><RefreshCw size={12} className="gira" />planejando…</> : <><Sparkles size={12} />Planejar a Fila</>}</button>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

// notificação do navegador + bip curto; clicar nela foca a janela e abre a revisão
function avisar(c, abrir) {
  try {
    const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.1; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15);
    o.onended = () => ctx.close();
  } catch { /* sem áudio: só não toca */ }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const ok = c.outros.exec === 'pronto', n = new Notification((ok ? '✓ ' : '✗ ') + semCrase(c.titulo), { body: ok ? 'pronto para revisar' : c.outros.exec });
  n.onclick = () => { focus(); abrir(c); n.close(); };
}

export default function App() {
  const [sistemas, setSistemas] = useState([]), [quadro, setQuadro] = useState(null), [rumo, setRumo] = useState(null), [erro, setErro] = useState('');
  // filtros: sistemas escondidos (vazio = todos aparecem) e categorias marcadas (vazio = todas)
  const [ocultos, setOcultos] = useState(() => lido('planejador:ocultos', []));
  const [cats, setCats] = useState(() => lido('planejador:categorias', []));
  const [busca, setBusca] = useState(''), [area, setArea] = useState('');
  const [aberto, setAberto] = useState(null);
  const [execucao, setExecucao] = useState(null); // o cartão que o agente da Fila está executando
  const [revisando, setRevisando] = useState(null); // cartão em Revisar aberto no painel de revisão
  const [vistos, setVistos] = useState(() => lido('planejador:vistos', [])); // revisões já abertas (projeto/id/início)
  const execAnt = useRef(null);
  const [painel, setPainel] = useState(() => lido('planejador:painel', true));
  const [rumoDe, setRumoDe] = useState(null); // sistema aberto no painel (null = lista de todos)
  useEffect(() => lembrar('planejador:painel', painel), [painel]);
  useEffect(() => lembrar('planejador:ocultos', ocultos), [ocultos]);
  useEffect(() => lembrar('planejador:categorias', cats), [cats]);

  const carregarSistemas = useCallback(async () => { try { setSistemas(await chamar('/api/projetos')); } catch (e) { setErro(e.message); } }, []);
  const carregar = useCallback(async () => {
    try { const q = await chamar('/api/quadro?p=todos'); setQuadro(v => (v?.mtime === q.mtime ? v : q)); setErro(''); } catch (e) { setErro(e.message); }
  }, []);
  const carregarRumo = useCallback(async () => {
    if (!rumoDe) return setRumo(null);
    try { setRumo(await chamar('/api/rumo?p=' + encodeURIComponent(rumoDe))); } catch { /* sem rumo ainda */ }
  }, [rumoDe]);
  useEffect(() => { carregarSistemas(); carregar(); }, [carregarSistemas, carregar]);
  useEffect(() => { carregarRumo(); }, [carregarRumo]);
  // os .md podem mudar por fora (agente, editor): relê o quadro a cada 4 s e a lista a cada 6 s; com o agente rodando, o rumo a cada 1,5 s
  useEffect(() => { const t = setInterval(carregar, 4000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { const t = setInterval(carregarSistemas, 6000); return () => clearInterval(t); }, [carregarSistemas]);
  useEffect(() => { const t = setInterval(carregarRumo, rumo?.rodada?.rodando ? 1500 : 6000); return () => clearInterval(t); }, [carregarRumo, rumo?.rodada?.rodando]);
  useEffect(() => { if (rumo?.rodada && !rumo.rodada.rodando) { carregar(); carregarSistemas(); } }, [rumo?.rodada?.rodando]); // eslint-disable-line react-hooks/exhaustive-deps

  // execução: a cada 2 s enquanto houver, senão a cada 4 s
  const lerExec = useCallback(async () => {
    try {
      const e = await chamar('/api/execucao'), ant = execAnt.current;
      execAnt.current = e; setExecucao(e);
      if (ant && !(e && e.id === ant.id && idExec(e) === idExec(ant))) carregar(); // terminou: o cartão já mudou de coluna
    } catch { /* o servidor reinicia: tenta de novo no próximo ciclo */ }
  }, [carregar]);
  useEffect(() => { lerExec(); const t = setInterval(lerExec, execucao ? 2000 : 4000); return () => clearInterval(t); }, [lerExec, !!execucao]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // a permissão só pode ser pedida num gesto do usuário: o primeiro clique na página
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    const pedir = () => Notification.requestPermission();
    addEventListener('click', pedir, { once: true }); return () => removeEventListener('click', pedir);
  }, []);
  const chave = c => `${c.projeto}/${c.id}/${c.outros?.inicio || ''}`;
  const naoVistos = (quadro?.colunas.find(x => x.nome === 'Revisar')?.cartoes || []).filter(c => c.outros?.exec && !vistos.includes(chave(c))).length;
  useEffect(() => { document.title = naoVistos ? `(${naoVistos}) Planejador` : 'Planejador · 2D TRANSFER'; }, [naoVistos]);
  const abrirRevisao = c => { setRevisando(c); const k = chave(c); setVistos(v => { const n = v.includes(k) ? v : [...v.slice(-99), k]; lembrar('planejador:vistos', n); return n; }); };
  // avisa de todo cartão novo em Revisar (de qualquer origem); o que já estava lá ao abrir a página não avisa
  const avisados = useRef(null);
  useEffect(() => {
    if (!quadro) return;
    const rev = (quadro.colunas.find(x => x.nome === 'Revisar')?.cartoes || []).filter(c => c.outros?.exec);
    if (!avisados.current) { avisados.current = new Set(rev.map(chave)); return; }
    for (const c of rev) if (!avisados.current.has(chave(c))) { avisados.current.add(chave(c)); avisar(c, abrirRevisao); }
  }, [quadro]); // eslint-disable-line react-hooks/exhaustive-deps
  const abrir = c => (c.coluna === 'Revisar' ? abrirRevisao(c) : setAberto(c));
  const excluir = async c => { if (confirm(`Excluir "${c.titulo}"?`) && await acao('/api/excluir', { id: c.id, projeto: c.projeto })) setAberto(null); };
  const parar = c => chamar('/api/execucao/parar', { projeto: c.projeto, id: c.id }).then(() => carregar(), e => setErro(e.message));

  const acao = async (url, corpo) => {
    try { setQuadro(await chamar(url + '?p=todos', corpo)); setErro(''); carregarSistemas(); return true; } catch (e) { setErro(e.message); return false; }
  };
  const pedir = async id => { try { await chamar('/api/rumo', { projeto: id }); setRumoDe(id); setPainel(true); carregarSistemas(); } catch (e) { setErro(e.message); } };
  const alternar = (lista, set, v) => set(lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);
  const filtra = c => !ocultos.includes(c.projeto) && (!cats.length || cats.includes(c.categoria)) && (!area || c.area === area)
    && (!busca || (c.titulo + ' ' + c.corpo).toLowerCase().includes(busca.toLowerCase()));
  const colunas = (quadro?.colunas || []).map(col => ({ ...col, visiveis: col.cartoes.filter(filtra) }));
  const total = colunas.filter(c => c.nome !== 'Feito').reduce((a, c) => a + c.visiveis.length, 0);
  const entrada = colunas.find(c => c.nome === 'Entrada')?.visiveis.length || 0;
  const rodandoAlgum = sistemas.some(s => s.rodando);
  const ordenados = sistemas.filter(s => s.existe).sort((a, b) => b.foco - a.foco);
  const visiveis = ordenados.filter(s => !ocultos.includes(s.id));
  const contaCat = k => (quadro?.colunas || []).reduce((a, col) => a + col.cartoes.filter(c => c.categoria === k && !ocultos.includes(c.projeto)).length, 0);
  const soltar = (dado, coluna, posicao) => {
    let d; try { d = JSON.parse(dado); } catch { return; }
    if (d?.id) acao('/api/mover', { id: d.id, projeto: d.projeto, coluna, posicao });
  };
  // cartão novo: no único sistema visível, senão no sistema em foco
  const padrao = () => (visiveis.length === 1 ? visiveis[0] : visiveis.find(s => s.foco) || visiveis[0] || ordenados[0])?.id;

  return (
    <div className={'app' + (painel ? ' com-painel' : '')}>
      <header className="topo">
        <div className="marca"><span className="logo">⇌</span><div><b>Planejador</b><small>TODOS OS SISTEMAS</small></div></div>
        <div className="numeros">
          <span><b>{total}</b> em aberto</span>
          {entrada > 0 && <span className="novas"><Sparkles size={13} /><b>{entrada}</b> para revisar</span>}
        </div>
        <div className="filtros">
          <label className="busca"><Search size={15} /><input placeholder="Buscar" value={busca} onChange={e => setBusca(e.target.value)} />
            {busca && <button className="ic mini" onClick={() => setBusca('')} aria-label="Limpar busca"><X size={13} /></button>}</label>
          <select className="sel-area" value={area} onChange={e => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas as áreas</option>{AREAS.map(a => <option key={a} value={a}>{NOME_AREA[a]}</option>)}
          </select>
        </div>
        <button className={'sec' + (painel ? ' on' : '')} onClick={() => setPainel(v => !v)} title={painel ? 'Recolher o rumo' : 'Mostrar o rumo'}>
          {painel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}Rumo{rodandoAlgum && <RefreshCw size={13} className="gira" />}
        </button>
      </header>
      <div className="barra-filtros">
        <div className="grupo" role="group" aria-label="Sistemas">
          <span className="rotulo">Sistemas</span>
          <button className={'chip' + (!ocultos.length ? ' on' : '')} onClick={() => setOcultos([])}>Todos</button>
          {ordenados.map(s => (
            <button key={s.id} className={'chip' + (!ocultos.includes(s.id) ? ' on' : '') + (s.foco ? ' foco' : '')} title={(s.proximo || 'Sem rumo ainda') + '\nCtrl+clique: só este sistema'}
              onClick={e => (e.ctrlKey || e.metaKey ? setOcultos(ordenados.filter(x => x.id !== s.id).map(x => x.id)) : alternar(ocultos, setOcultos, s.id))}>
              {s.foco && <Star size={12} />}{s.nome}<span className="n">{s.abertos}</span>{s.rodando && <RefreshCw size={11} className="gira" />}
            </button>
          ))}
        </div>
        <div className="grupo" role="group" aria-label="Categorias">
          <span className="rotulo">Categorias</span>
          <button className={'chip' + (!cats.length ? ' on' : '')} onClick={() => setCats([])}>Todas</button>
          {CATEGORIAS.map(k => (
            <button key={k} className={'chip cat-chip k-' + k + (cats.includes(k) ? ' on' : '')} onClick={() => alternar(cats, setCats, k)}>
              <i />{NOME_CAT[k]}<span className="n">{contaCat(k)}</span>
            </button>
          ))}
        </div>
      </div>
      {erro && <p className="erro faixa"><CircleAlert size={14} />{erro}</p>}
      <main>
        <div className="quadro">
          {colunas.map(col => (
            <Coluna key={col.nome} col={col} cartoes={col.visiveis} onAbrir={abrir} execucao={execucao} onParar={parar} onExcluir={excluir}
              onNovo={nome => setAberto({ coluna: nome, titulo: '', corpo: '', projeto: padrao(), categoria: cats.length === 1 ? cats[0] : '' })}
              onSoltar={soltar} />
          ))}
        </div>
        {painel ? (rumoDe
          ? <PainelRumo sistema={sistemas.find(s => s.id === rumoDe)} rumo={rumo} onPedir={() => pedir(rumoDe)} onVoltar={() => setRumoDe(null)} onRecolher={() => setPainel(false)} />
          : <PainelGeral sistemas={visiveis} onAbrir={setRumoDe} onPedir={pedir} onRecolher={() => setPainel(false)} />)
          : <button className="aba-rumo" onClick={() => setPainel(true)} title="Mostrar o rumo"><Compass size={16} /><span>Rumo</span>{rodandoAlgum && <RefreshCw size={13} className="gira" />}</button>}
      </main>
      {revisando && <Revisao c={revisando} chamar={chamar} onFechar={() => setRevisando(null)}
        onFeito={aviso => { setRevisando(null); setErro(aviso || ''); carregar(); carregarSistemas(); }} />}
      {aberto && <Gaveta c={aberto} colunas={colunas.map(c => c.nome)} sistemas={sistemas} onFechar={() => setAberto(null)}
        onSalvar={async f => { if (await acao('/api/salvar', f)) setAberto(null); }}
        onExcluir={excluir} />}
    </div>
  );
}
