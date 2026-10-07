import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
import {
  Bar, BusyIndicator, Button, Card, CardHeader, CheckBox, Dialog, Form, FormItem, Icon, IllustratedMessage, Input, Label, Link, List, ListItemCustom,
  MessageStrip, ObjectStatus, Option, SegmentedButton, SegmentedButtonItem, Select, ShellBar, ShellBarItem, ShellBarSearch, SideNavigation,
  SideNavigationGroup, SideNavigationItem, Tag, Text, TextArea, Timeline, TimelineItem, Title, Toast, Toolbar, ToolbarButton, ToolbarItem, ToolbarSelect,
  ToolbarSelectOption, ToolbarSpacer,
} from '@ui5/webcomponents-react';
import Markdown from './Markdown.jsx';
import Revisao from './Revisao.jsx';
import Confirmar from './Confirmar.jsx';

// Planejador de todos os sistemas: um quadro kanban só, com os cartões de todos os sistemas (projetos.json) juntos,
// filtros de sistema e categoria, e o rumo do agente planejador por sistema no painel da direita.
const AREAS = ['produto', 'dados', 'qualidade', 'producao', 'terceiros'];
const NOME_AREA = { produto: 'Produto', dados: 'Dados', qualidade: 'Qualidade', producao: 'Produção', terceiros: 'Terceiros' };
const CATEGORIAS = ['implementacao', 'melhoria', 'ideia', 'plano', 'bug', 'erro', 'problema', 'pesquisa', 'documentacao'];
const NOME_CAT = { implementacao: 'Implementação', melhoria: 'Melhoria', ideia: 'Ideia', plano: 'Plano', bug: 'Bug', erro: 'Erro', problema: 'Problema', pesquisa: 'Pesquisa', documentacao: 'Documentação' };
const NOME_PRIO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const ESTADO_PRIO = { alta: 'Negative', media: 'Critical', baixa: 'None' };
const DICA_COLUNA = {
  Entrada: 'Sugestões para revisar', Decidir: 'Esperando uma decisão sua', 'A fazer': 'Decidido, falta fazer',
  Fila: 'O agente faz, um por vez', Fazendo: 'Em andamento agora', Revisar: 'Pronto para você revisar', Postergar: 'Parado: o agente não pega',
  Terceiros: 'Depende de outras pessoas', Feito: 'Concluído',
};
const NOME_EXEC = { pronto: 'Pronto', falhou: 'Falhou', parado: 'Parado' };
const ESTADO_EXEC = { pronto: 'Positive', falhou: 'Negative', parado: 'None' };
const idExec = e => e && (e.projeto?.id || e.projeto); // o servidor manda o sistema (objeto ou id)
const hora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const relogio = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' });
const dur = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
const classeCol = nome => 'c-' + nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
// resumo do cartão: a 1ª linha de texto (tabelas ficam de fora: o cabeçalho não diz nada sozinho)
const primeiraLinha = c => (c.corpo || '').split('\n').filter(l => !l.trim().startsWith('|')).map(l => l.replace(/^[-*#>\s]+/, '').replace(/\*\*|`/g, '').trim()).find(Boolean) || '';
const semCrase = s => (s || '').replace(/`/g, '');
const lembrar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: só não lembra */ } };
const lido = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } };
export const temaGuardado = () => (lido('planejador:tema', 'sap_horizon') === 'sap_horizon_dark' ? 'sap_horizon_dark' : 'sap_horizon');

async function chamar(url, corpo) {
  const r = await fetch(url, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : undefined);
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || r.statusText);
  return j;
}

function Etiquetas({ c, longas = false }) {
  return (
    <div className="etiquetas">
      {c.projetoNome && <Tag design="Set1" colorScheme={c.foco ? '2' : '6'} hideStateIcon>{c.projetoNome}</Tag>}
      {c.categoria && <Tag design="Set2" colorScheme={String(CATEGORIAS.indexOf(c.categoria) + 1 || 10)} hideStateIcon>{NOME_CAT[c.categoria] || c.categoria}</Tag>}
      {c.prioridade && <ObjectStatus state={ESTADO_PRIO[c.prioridade] || 'None'} showDefaultIcon={c.prioridade !== 'baixa'}>{NOME_PRIO[c.prioridade] || c.prioridade}</ObjectStatus>}
      {c.area && <Tag design="Neutral" hideStateIcon>{NOME_AREA[c.area] || c.area}</Tag>}
      {c.adiado && <Tag design="Neutral" icon={<Icon name="history" />}>Adiado</Tag>}
      {c.origem === 'planejador' && <Tag design="Information" icon={<Icon name="ai" />} title="Sugerido pelo planejador">{longas ? 'Sugerido pelo planejador' : 'Planejador'}</Tag>}
    </div>
  );
}

// prévia: o texto completo do cartão ao lado dele, depois de um instante com o mouse parado em cima.
// Fica no <body> (portal), fora do cartão: senão o mouse, a rolagem e o arrastar na prévia contam como no cartão.
function Previa({ c, pos, onEntrar, onSair }) {
  const ref = useRef(null), [y, setY] = useState(pos.top);
  useEffect(() => { const h = ref.current?.offsetHeight || 0; setY(Math.max(8, Math.min(pos.top, innerHeight - h - 8))); }, [pos.top]);
  return createPortal(
    <div ref={ref} className="previa" style={{ top: y, left: pos.left }} onMouseEnter={onEntrar} onMouseLeave={onSair}>
      <Title level="H5" wrappingType="Normal">{semCrase(c.titulo)}</Title>
      <Etiquetas c={c} />
      <Markdown texto={c.corpo || '_Sem descrição._'} />
    </div>, document.body);
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
      onClick={() => { fechar(); onAbrir(c); }} onKeyDown={e => e.key === 'Enter' && e.target === e.currentTarget && onAbrir(c)}>
      <div className="cab">
        <Title level="H6" wrappingType="Normal">{semCrase(c.titulo)}</Title>
        {!rodando && <Button className="lixo" design="Transparent" icon="delete" tooltip="Excluir" accessibleName={`Excluir "${c.titulo}"`}
          onClick={e => { e.stopPropagation(); fechar(); onExcluir(c); }} />}
      </div>
      {resumo && <Text maxLines={c.coluna === 'Feito' ? 1 : 2} className="resumo">{resumo}</Text>}
      <Etiquetas c={c} />
      {rodando && <div className="exec-info">
        <BusyIndicator active size="S" />
        <Tag design="Information" hideStateIcon>executando há <Rodando inicio={execucao.inicio} /></Tag>
        <Button design="Transparent" icon="stop" onClick={e => { e.stopPropagation(); onParar(c); }}>Parar</Button>
        {execucao.passo && <Text maxLines={2} className="passo">{execucao.passo}</Text>}
      </div>}
      {!rodando && NOME_EXEC[exec] && <ObjectStatus state={ESTADO_EXEC[exec]} showDefaultIcon>{NOME_EXEC[exec]}</ObjectStatus>}
      {previa && <Previa c={c} pos={previa} onEntrar={() => clearTimeout(t.current)} onSair={esconder} />}
    </article>
  );
}

// clicar no cabeçalho recolhe a coluna numa faixa estreita (nome na vertical e a contagem); clicar na faixa abre de novo.
// Recolhida, continua recebendo cartões arrastados. O "+" fica no slot de ação, fora da área clicável do cabeçalho.
function Coluna({ col, cartoes, recolhida, onAlternar, execucao, onAbrir, onSoltar, onNovo, onParar, onExcluir }) {
  const [sobre, setSobre] = useState(false);
  const n = col.nome === 'Fazendo' ? `${cartoes.length}/1` : String(cartoes.length); // o executor faz um por vez
  return (
    <section className={'coluna ' + classeCol(col.nome) + (recolhida ? ' recolhida' : '') + (sobre ? ' alvo' : '')}
      onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={e => !e.currentTarget.contains(e.relatedTarget) && setSobre(false)}
      onDrop={e => { e.preventDefault(); setSobre(false); onSoltar(e.dataTransfer.getData('text/plain'), col.nome, Infinity); }}>
      {recolhida ? (
        <button type="button" className="faixa-col" onClick={onAlternar} aria-expanded="false" title={`${col.nome}: ${DICA_COLUNA[col.nome] || ''}. Clique para mostrar`}>
          <span className="n">{n}</span><span className="nome">{col.nome}</span>
        </button>
      ) : (
        <Card header={<CardHeader interactive onClick={onAlternar} title="Clique para recolher a coluna" titleText={col.nome} subtitleText={DICA_COLUNA[col.nome] || ''} additionalText={n}
          action={<Button design="Transparent" icon="add" tooltip={`Novo cartão em ${col.nome}`} onClick={() => onNovo(col.nome)} />} />}>
          <div className="lista">
            {cartoes.map(c => <Cartao key={(c.projeto || '') + c.id} c={c} execucao={execucao} onAbrir={onAbrir} onParar={onParar} onExcluir={onExcluir}
              onSoltarAntes={(dado, alvo) => onSoltar(dado, col.nome, col.cartoes.filter(x => x.projeto === alvo.projeto).findIndex(x => x.id === alvo.id))} />)}
            {!cartoes.length && <IllustratedMessage name="EmptyList" design="Dot" titleText="Arraste um cartão para cá" />}
          </div>
        </Card>
      )}
    </section>
  );
}

function Gaveta({ c, colunas, sistemas, onFechar, onSalvar, onExcluir, confirmar }) {
  const novo = !c.id;
  const [ed, setEd] = useState(novo), [faltaTitulo, setFaltaTitulo] = useState(false), [ver, setVer] = useState(false);
  const [f, setF] = useState(c);
  useEffect(() => { setF(c); setEd(!c.id); setVer(false); }, [c]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.tagName === 'UI5-CHECKBOX' ? e.target.checked : e.target.value }));
  const nomeSistema = sistemas.find(s => s.id === f.projeto)?.nome;
  const sujo = ed && ['titulo', 'corpo', 'projeto', 'coluna', 'categoria', 'prioridade', 'area', 'adiado'].some(k => (f[k] || '') !== (c[k] || ''));
  const salvar = e => { e?.preventDefault(); if (!f.titulo?.trim()) return setFaltaTitulo(true); onSalvar(f); };
  // com alteração não salva, fechar (X, Esc ou Cancelar) pergunta antes de descartar
  const sair = acao => (sujo ? confirmar({ texto: 'Descartar as alterações deste cartão?', botao: 'Descartar', sim: acao }) : acao());
  const cancelar = () => sair(() => (novo ? onFechar() : (setF(c), setEd(false))));
  const opcoes = (lista, nomes) => [<Option key="" value="">Sem</Option>, ...lista.map(k => <Option key={k} value={k}>{nomes[k]}</Option>)];
  return (
    <Dialog open preventFocusRestore className="gaveta" accessibleName={c.titulo || 'Novo cartão'} resizable initialFocus={novo ? 'titulo-cartao' : undefined}
      onBeforeClose={e => { if (sujo && e.detail.escPressed) { e.preventDefault(); sair(onFechar); } }} onClose={onFechar}
      onKeyDown={e => { if (ed && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvar(e); }}
      header={<Bar startContent={<><Tag design="Set2" colorScheme="8" hideStateIcon>{f.coluna}</Tag>{nomeSistema && <Text>{nomeSistema}</Text>}</>}
        endContent={<>
          {!ed && <Button design="Transparent" icon="delete" tooltip="Excluir" accessibleName="Excluir" onClick={() => onExcluir(c)} />}
          {!ed && <Button icon="edit" onClick={() => setEd(true)}>Editar</Button>}
          <Button design="Transparent" icon="decline" tooltip="Fechar" accessibleName="Fechar" onClick={() => sair(onFechar)} />
        </>} />}
      footer={ed ? <Bar design="Footer"
        startContent={!novo ? <Button design="Negative" icon="delete" onClick={() => onExcluir(c)}>Excluir</Button> : <Label className="atalho">Ctrl+Enter salva</Label>}
        endContent={<>
          <Button design="Transparent" onClick={cancelar}>Cancelar</Button>
          <Button design="Emphasized" icon="save" type="Submit" form="form-cartao">Salvar</Button>
        </>} /> : undefined}>
      {ed ? (
        <form id="form-cartao" className="edicao" onSubmit={salvar}>
          <Form labelSpan="S12 M12 L12 XL12">
            <FormItem labelContent={<Label required>Título</Label>}>
              <Input id="titulo-cartao" className="titulo-campo" value={f.titulo || ''} onInput={e => { set('titulo')(e); setFaltaTitulo(false); }} required
                placeholder="O que precisa acontecer, como você diria a alguém. Ex.: Atualizar o CI antes de 19/10"
                valueState={faltaTitulo ? 'Negative' : 'None'} valueStateMessage={<div>Dê um título ao cartão</div>} />
            </FormItem>
          </Form>
          <Form layout="S1 M3 L3 XL3" labelSpan="S12 M12 L12 XL12">
            {novo && <FormItem labelContent={<Label>Sistema</Label>}>
              <Select value={f.projeto} onChange={set('projeto')}>{sistemas.filter(s => s.existe).map(s => <Option key={s.id} value={s.id}>{s.nome}</Option>)}</Select>
            </FormItem>}
            <FormItem labelContent={<Label>Coluna</Label>}>
              <Select value={f.coluna} onChange={set('coluna')}>{colunas.map(n => <Option key={n} value={n}>{n}</Option>)}</Select>
            </FormItem>
            <FormItem labelContent={<Label>Categoria</Label>}><Select value={f.categoria || ''} onChange={set('categoria')}>{opcoes(CATEGORIAS, NOME_CAT)}</Select></FormItem>
            <FormItem labelContent={<Label>Prioridade</Label>}><Select value={f.prioridade || ''} onChange={set('prioridade')}>{opcoes(['alta', 'media', 'baixa'], NOME_PRIO)}</Select></FormItem>
            <FormItem labelContent={<Label>Área</Label>}><Select value={f.area || ''} onChange={set('area')}>{opcoes(AREAS, NOME_AREA)}</Select></FormItem>
            <FormItem labelContent={<Label>Adiado</Label>}><CheckBox text="Esperar para fazer" checked={!!f.adiado} onChange={set('adiado')} /></FormItem>
          </Form>
          <div className="descricao">
            <div className="descricao-cab">
              <Label>Descrição</Label>
              <SegmentedButton accessibleName="Modo da descrição" onSelectionChange={e => setVer(e.detail.selectedItems[0]?.dataset.k === 'ver')}>
                <SegmentedButtonItem data-k="escrever" selected={!ver}>Escrever</SegmentedButtonItem>
                <SegmentedButtonItem data-k="ver" selected={ver}>Ver como fica</SegmentedButtonItem>
              </SegmentedButton>
            </div>
            {ver ? <div className="descricao-previa"><Markdown texto={f.corpo || '_Sem descrição._'} /></div>
              : <TextArea value={f.corpo || ''} onInput={set('corpo')} rows={16} className="mono" accessibleName="Descrição"
                placeholder={'Por quê, onde e o que fazer. Aceita Markdown: **negrito**, - listas, `código`.'} />}
          </div>
        </form>
      ) : (
        <div className="leitura">
          <Title level="H3" wrappingType="Normal">{semCrase(c.titulo)}</Title>
          <Etiquetas c={c} longas />
          <Markdown texto={c.corpo} />
        </div>
      )}
    </Dialog>
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
      <Bar startContent={<><Button design="Transparent" icon="navigation-left-arrow" tooltip="Todos os sistemas" onClick={onVoltar} />
        <Title level="H5">Rumo</Title>{sistema && <Tag design="Neutral" hideStateIcon>{sistema.nome}</Tag>}</>}
        endContent={<Button design="Transparent" icon="close-command-field" tooltip="Recolher o painel" onClick={onRecolher} />} />
      <div className="rumo-conteudo">
        {r.rodando ? <div className="rodando"><BusyIndicator active size="S" /><Text>Planejando… <Rodando inicio={r.inicio} /></Text></div>
          : <Button design="Emphasized" icon="ai" className="largo" onClick={onPedir}
            tooltip="Roda o planejador nos cartões da Fila deste sistema: completa cada um com o plano, ordena a Fila e atualiza o rumo. Enquanto ele roda, o executor espera.">Planejar a Fila</Button>}
        {rumo?.mtime > 0 && !r.rodando && <Label className="quando">Última rodada: {hora.format(rumo.mtime)}</Label>}
        {(r.rodando || recente) ? <Timeline className="passos">
          {(r.passos || []).slice(-10).map((p, i, a) => <TimelineItem key={i} titleText={p.txt} subtitleText={p.t ? relogio.format(p.t) : undefined}
            state={r.rodando && i === a.length - 1 ? 'Information' : 'None'} />)}
        </Timeline> : null}
        {r.ok === false && !r.rodando && <MessageStrip design="Negative" hideCloseButton>A última rodada terminou com erro. Rode de novo.</MessageStrip>}
        <div className="rumo-corpo">
          {rumo?.md ? <Markdown texto={rumo.md.replace(/^# .*\n/, '')} />
            : !r.rodando && <Text>Ainda não há rumo para {sistema?.nome}. Coloque cartões na Fila e peça para planejar: o planejador completa cada um, ordena a Fila e diz a ordem.</Text>}
        </div>
      </div>
    </aside>
  );
}

// Visão "Todos": o próximo passo de cada sistema, com o foco primeiro
function PainelGeral({ sistemas, onAbrir, onPedir, onRecolher }) {
  const lista = [...sistemas].sort((a, b) => b.foco - a.foco || b.abertos - a.abertos);
  return (
    <aside className="rumo">
      <Bar startContent={<Title level="H5">Rumo por sistema</Title>}
        endContent={<Button design="Transparent" icon="close-command-field" tooltip="Recolher o painel" onClick={onRecolher} />} />
      <List className="geral" separators="Inner">
        {lista.map(s => (
          <ListItemCustom key={s.id} type="Inactive" highlight={s.foco ? 'Critical' : 'None'} className={s.existe ? '' : 'sumiu'}>
            <div className="sist">
              <div className="linha">
                {s.foco && <Icon name="favorite" className="estrela" />}
                <Link onClick={() => onAbrir(s.id)}>{s.nome}</Link>
                <Label>{s.abertos} em aberto</Label>
              </div>
              <Text maxLines={3}>{!s.existe ? 'Pasta não encontrada' : s.proximo || 'Sem rumo ainda'}</Text>
              {s.existe && (s.rodando ? <ObjectStatus state="Information" showDefaultIcon>planejando…</ObjectStatus>
                : <Link icon="ai" onClick={() => onPedir(s.id)}>Planejar a Fila</Link>)}
            </div>
          </ListItemCustom>
        ))}
      </List>
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
  const [pergunta, setPergunta] = useState(null), [toast, setToast] = useState('');
  const execAnt = useRef(null);
  // o rumo começa recolhido: o quadro fica com a largura (a lista de sistemas já está na lateral)
  const [painel, setPainel] = useState(() => lido('planejador:rumo-aberto', false));
  const [recolhidas, setRecolhidas] = useState(() => lido('planejador:recolhidas', [])); // colunas recolhidas (pelo nome)
  const [nav, setNav] = useState(() => lido('planejador:nav', true)); // lista de sistemas aberta (ou só os ícones)
  const [tema, setTema] = useState(temaGuardado);
  const [rumoDe, setRumoDe] = useState(null); // sistema aberto no painel (null = lista de todos)
  useEffect(() => lembrar('planejador:rumo-aberto', painel), [painel]);
  useEffect(() => lembrar('planejador:nav', nav), [nav]);
  useEffect(() => lembrar('planejador:recolhidas', recolhidas), [recolhidas]);
  useEffect(() => lembrar('planejador:ocultos', ocultos), [ocultos]);
  useEffect(() => lembrar('planejador:categorias', cats), [cats]);
  useEffect(() => { setTheme(tema); lembrar('planejador:tema', tema); }, [tema]);

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
  const excluir = c => setPergunta({ texto: `Excluir "${semCrase(c.titulo)}"?`, botao: 'Excluir',
    sim: async () => { if (await acao('/api/excluir', { id: c.id, projeto: c.projeto })) { setAberto(null); setToast('Cartão excluído'); } } });
  const parar = c => chamar('/api/execucao/parar', { projeto: c.projeto, id: c.id }).then(() => carregar(), e => setErro(e.message));

  const acao = async (url, corpo) => {
    try { setQuadro(await chamar(url + '?p=todos', corpo)); setErro(''); carregarSistemas(); return true; } catch (e) { setErro(e.message); return false; }
  };
  const pedir = async id => { try { await chamar('/api/rumo', { projeto: id }); setRumoDe(id); setPainel(true); carregarSistemas(); setToast('Planejador iniciado'); } catch (e) { setErro(e.message); } };
  const filtra = c => !ocultos.includes(c.projeto) && (!cats.length || cats.includes(c.categoria)) && (!area || c.area === area)
    && (!busca || (c.titulo + ' ' + c.corpo).toLowerCase().includes(busca.toLowerCase()));
  const colunas = (quadro?.colunas || []).map(col => ({ ...col, visiveis: col.cartoes.filter(filtra) }));
  const total = colunas.filter(c => c.nome !== 'Feito').reduce((a, c) => a + c.visiveis.length, 0);
  const entrada = colunas.find(c => c.nome === 'Entrada')?.visiveis.length || 0;
  const ordenados = sistemas.filter(s => s.existe).sort((a, b) => b.foco - a.foco);
  const visiveis = ordenados.filter(s => !ocultos.includes(s.id));
  const contaCat = k => (quadro?.colunas || []).reduce((a, col) => a + col.cartoes.filter(c => c.categoria === k && !ocultos.includes(c.projeto)).length, 0);
  const soltar = (dado, coluna, posicao) => {
    let d; try { d = JSON.parse(dado); } catch { return; }
    if (d?.id) acao('/api/mover', { id: d.id, projeto: d.projeto, coluna, posicao });
  };
  // cartão novo e "Planejar a Fila" do topo: no sistema aberto no rumo, senão no único visível, senão no sistema em foco
  const padrao = () => (visiveis.length === 1 ? visiveis[0] : visiveis.find(s => s.foco) || visiveis[0] || ordenados[0])?.id;
  const alvo = sistemas.find(s => s.id === (rumoDe || padrao()));
  // clique mostra só o sistema (fica selecionado e o rumo dele vai para o painel); Ctrl+clique soma ou tira sistemas
  const unico = ocultos.length && visiveis.length === 1 ? visiveis[0].id : null;
  const clicarSistema = (s, e) => {
    if (e.detail?.ctrlKey || e.detail?.metaKey) return setOcultos(o => (o.includes(s.id) ? o.filter(x => x !== s.id) : [...o, s.id]));
    setOcultos(ordenados.filter(x => x.id !== s.id).map(x => x.id)); setRumoDe(s.id);
  };
  const itemSistema = s => (
    <SideNavigationItem key={s.id} text={s.nome} icon={s.foco ? 'favorite' : 'it-system'} selected={unico === s.id} onClick={e => clicarSistema(s, e)}
      tooltip={(s.proximo || 'Sem rumo ainda') + '\nCtrl+clique: soma ou tira este sistema'} className={ocultos.includes(s.id) && !unico ? 'oculto' : ''}
      tag={s.rodando ? <Tag design="Information" hideStateIcon>planejando</Tag> : s.abertos ? <Tag design="Neutral" hideStateIcon>{s.abertos}</Tag> : undefined} />
  );
  const comCartoes = ordenados.filter(s => !s.foco && s.abertos), semCartoes = ordenados.filter(s => !s.foco && !s.abertos);

  return (
    <div className="app">
      <ShellBar primaryTitle="Planejador" secondaryTitle={`${total} em aberto` + (entrada ? ` · ${entrada} para revisar` : '')} showSearchField
        startButton={<Button design="Transparent" icon="menu2" tooltip={nav ? 'Recolher os sistemas' : 'Mostrar os sistemas'} onClick={() => setNav(v => !v)} />}
        searchField={<ShellBarSearch placeholder="Buscar" value={busca} showClearIcon onInput={e => setBusca(e.target.value)} />}
        content={alvo && <Button design="Emphasized" icon="ai" disabled={alvo.rodando} onClick={() => pedir(alvo.id)}
          tooltip={`Roda o planejador na Fila de ${alvo.nome}`}>{alvo.rodando ? 'Planejando…' : 'Planejar a Fila'} · {alvo.nome}</Button>}>
        <ShellBarItem icon={painel ? 'close-command-field' : 'open-command-field'} text={painel ? 'Recolher o rumo' : 'Mostrar o rumo'} onClick={() => setPainel(v => !v)} />
        <ShellBarItem icon={tema === 'sap_horizon_dark' ? 'light-mode' : 'dark-mode'} text={tema === 'sap_horizon_dark' ? 'Tema claro' : 'Tema escuro'}
          onClick={() => setTema(t => (t === 'sap_horizon_dark' ? 'sap_horizon' : 'sap_horizon_dark'))} />
      </ShellBar>
      <Toolbar className="filtros" accessibleName="Filtros">
        <ToolbarItem>
          <SegmentedButton selectionMode="Multiple" itemsFitContent accessibleName="Categorias" onSelectionChange={e => setCats(e.detail.selectedItems.map(i => i.dataset.k))}>
            {CATEGORIAS.map(k => <SegmentedButtonItem key={k} data-k={k} selected={cats.includes(k)}>{NOME_CAT[k]} {contaCat(k)}</SegmentedButtonItem>)}
          </SegmentedButton>
        </ToolbarItem>
        {cats.length > 0 && <ToolbarButton icon="clear-filter" text="Todas as categorias" design="Transparent" onClick={() => setCats([])} />}
        <ToolbarSpacer />
        <ToolbarSelect accessibleName="Área" onChange={e => setArea(e.detail.selectedOption.value)}>
          <ToolbarSelectOption value="" selected={!area}>Todas as áreas</ToolbarSelectOption>
          {AREAS.map(a => <ToolbarSelectOption key={a} value={a} selected={area === a}>{NOME_AREA[a]}</ToolbarSelectOption>)}
        </ToolbarSelect>
      </Toolbar>
      <main>
        <div className="lateral">
          <SideNavigation collapsed={!nav} accessibleName="Sistemas">
            <SideNavigationItem text="Todos os sistemas" icon="grid" selected={!ocultos.length} onClick={() => { setOcultos([]); setRumoDe(null); }}
              tooltip="Mostra os cartões de todos os sistemas" tag={<Tag design="Neutral" hideStateIcon>{ordenados.reduce((a, s) => a + (s.abertos || 0), 0)}</Tag>} />
            {ordenados.some(s => s.foco) && <SideNavigationGroup text="Em foco" expanded>{ordenados.filter(s => s.foco).map(itemSistema)}</SideNavigationGroup>}
            {comCartoes.length > 0 && <SideNavigationGroup text="Sistemas" expanded>{comCartoes.map(itemSistema)}</SideNavigationGroup>}
            {semCartoes.length > 0 && <SideNavigationGroup text={`Sem cartões (${semCartoes.length})`}>{semCartoes.map(itemSistema)}</SideNavigationGroup>}
          </SideNavigation>
          {nav && <div className={'agente' + (execucao ? ' ativo' : '')}>
            <Label>Executor da Fila</Label>
            {execucao ? <>
              <ObjectStatus state="Information" showDefaultIcon>Executando há <Rodando inicio={execucao.inicio} /></ObjectStatus>
              <Text maxLines={2}>{semCrase(execucao.titulo)}{execucao.projeto?.nome ? ` · ${execucao.projeto.nome}` : ''}</Text>
              {execucao.passo && <Text maxLines={1} className="passo">{execucao.passo}</Text>}
            </> : <ObjectStatus state="None">Livre</ObjectStatus>}
          </div>}
        </div>
        <div className="centro">
          {erro && <MessageStrip design="Negative" className="faixa" onClose={() => setErro('')}>{erro}</MessageStrip>}
          <div className="quadro">
            {colunas.map(col => (
              <Coluna key={col.nome} col={col} cartoes={col.visiveis} onAbrir={abrir} recolhida={recolhidas.includes(col.nome)}
                onAlternar={() => setRecolhidas(r => (r.includes(col.nome) ? r.filter(x => x !== col.nome) : [...r, col.nome]))} execucao={execucao} onParar={parar} onExcluir={excluir}
                onNovo={nome => setAberto({ coluna: nome, titulo: '', corpo: '', projeto: padrao(), categoria: cats.length === 1 ? cats[0] : '' })}
                onSoltar={soltar} />
            ))}
          </div>
        </div>
        {painel && (rumoDe
          ? <PainelRumo sistema={sistemas.find(s => s.id === rumoDe)} rumo={rumo} onPedir={() => pedir(rumoDe)} onVoltar={() => setRumoDe(null)} onRecolher={() => setPainel(false)} />
          : <PainelGeral sistemas={visiveis} onAbrir={setRumoDe} onPedir={pedir} onRecolher={() => setPainel(false)} />)}
      </main>
      {revisando && <Revisao c={revisando} chamar={chamar} confirmar={setPergunta} onFechar={() => setRevisando(null)}
        onFeito={aviso => { setRevisando(null); setErro(aviso || ''); if (!aviso) setToast('Feito'); carregar(); carregarSistemas(); }} />}
      {aberto && <Gaveta c={aberto} colunas={colunas.map(c => c.nome)} sistemas={sistemas} onFechar={() => setAberto(null)} confirmar={setPergunta}
        onSalvar={async f => { if (await acao('/api/salvar', f)) { setAberto(null); setToast('Cartão salvo'); } }}
        onExcluir={excluir} />}
      <Confirmar pergunta={pergunta} onFechar={() => setPergunta(null)} />
      <Toast open={!!toast} onClose={() => setToast('')}>{toast}</Toast>
    </div>
  );
}
