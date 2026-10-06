import { useEffect, useState } from 'react';
import {
  Bar, BusyIndicator, Button, Dialog, Label, Link, MessageStrip, ObjectStatus, Panel, Table, TableCell, TableHeaderCell, TableHeaderRow, TableRow, Text, TextArea, Title,
} from '@ui5/webcomponents-react';

const hora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dur = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
const ESTADO = { pronto: 'Positive', falhou: 'Negative', parado: 'None' };
// o diff vem de código do sistema: sempre como texto (o React escapa), nunca como HTML
const porArquivo = diff => (diff || '').split(/^(?=diff --git )/m).filter(Boolean).map(t => ({ nome: /^diff --git a\/(.+?) b\//.exec(t)?.[1] || '?', linhas: t.split('\n') }));
const classeLinha = l => (l.startsWith('@@') ? 'h' : l.startsWith('+') && !l.startsWith('+++') ? 'a' : l.startsWith('-') && !l.startsWith('---') ? 'r' : '');

export default function Revisao({ c, chamar, confirmar, onFechar, onFeito }) {
  const [h, setH] = useState(null), [erro, setErro] = useState(''), [ajuste, setAjuste] = useState(null), [tudo, setTudo] = useState(false), [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    chamar(`/api/execucao/historico?p=${encodeURIComponent(c.projeto)}&id=${encodeURIComponent(c.id)}`).then(j => vivo && setH(j), e => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [c.projeto, c.id, chamar]);

  const enviar = async (acao, texto) => {
    setOcupado(true); setErro('');
    try {
      const r = await chamar('/api/execucao/' + acao, { projeto: c.projeto, id: c.id, texto });
      if (r.ok === false) setErro(r.motivo || 'não foi possível concluir'); else onFeito(r.aviso);
    } catch (e) { setErro(e.message); }
    setOcupado(false);
  };

  const r = h?.rodadas?.at(-1), saida = (r?.testes?.saida || '').split('\n'), arqs = porArquivo(r?.diff);
  const titulo = c.titulo.replace(/`/g, '');
  return (
    <Dialog open className="revisao" onClose={onFechar} accessibleName={'Revisar ' + titulo} resizable
      header={<Bar startContent={<Title level="H5">Revisar</Title>}
        endContent={<Button design="Transparent" icon="decline" tooltip="Fechar" accessibleName="Fechar" onClick={onFechar} />} />}
      footer={<Bar design="Footer"
        startContent={<Button design="Negative" icon="delete" disabled={ocupado}
          onClick={() => confirmar({ texto: `Descartar "${titulo}"? O trabalho do agente será apagado.`, botao: 'Descartar', sim: () => enviar('descartar') })}>Descartar</Button>}
        endContent={<>
          <Button icon="comment" disabled={ocupado} onClick={() => setAjuste('')}>Pedir ajuste</Button>
          {r && r.commits !== 0 && <Button design="Emphasized" icon="accept" disabled={ocupado} onClick={() => enviar('aceitar')}>Aceitar</Button>}
        </>} />}>
      <div className="rev-cab">
        <Title level="H3" wrappingType="Normal">{titulo}</Title>
        <div className="rev-meta">
          {r && <ObjectStatus state={ESTADO[r.status] || 'None'} showDefaultIcon large>{r.status}</ObjectStatus>}
          {r && <Label>{r.fim ? dur(r.fim - r.inicio) + ' · ' : ''}{r.passos?.length || 0} passos</Label>}
          {h?.ramo && <Label>Ramo <code>{h.ramo}</code></Label>}
        </div>
      </div>
      {erro && <MessageStrip design="Negative" hideCloseButton>{erro}</MessageStrip>}
      {!h && !erro && <BusyIndicator active size="M" text="Carregando…" />}
      {h && !r && <Text>Sem rodada registrada.</Text>}
      {r && <>
        <Title level="H5">Resumo</Title>
        <Text className="rev-resumo">{r.resumo || 'Sem resumo.'}</Text>
        <Panel collapsed={r.testes?.ok} header={<div className="rev-painel">
          <Title level="H5">Testes</Title>
          <ObjectStatus state={r.testes?.ok ? 'Positive' : 'Negative'} showDefaultIcon>{r.testes?.ok ? 'passaram' : 'falharam'}</ObjectStatus>
        </div>}>
          {r.testes?.saida ? <>
            <pre className="codigo">{(tudo ? saida : saida.slice(-20)).join('\n')}</pre>
            {saida.length > 20 && <Link onClick={() => setTudo(v => !v)}>{tudo ? 'ver menos' : 'ver tudo'}</Link>}
          </> : <Text>Sem saída.</Text>}
        </Panel>
        <Title level="H5">Arquivos ({r.arquivos?.length || 0})</Title>
        <Table className="rev-arqs" noDataText="Nenhum arquivo alterado."
          headerRow={<TableHeaderRow><TableHeaderCell>Arquivo</TableHeaderCell><TableHeaderCell width="6rem" horizontalAlign="End">Adições</TableHeaderCell>
            <TableHeaderCell width="6rem" horizontalAlign="End">Remoções</TableHeaderCell></TableHeaderRow>}>
          {(r.arquivos || []).map(a => <TableRow key={a.arq} rowKey={a.arq}>
            <TableCell><Text>{a.arq}</Text></TableCell>
            <TableCell horizontalAlign="End"><ObjectStatus state="Positive">+{a.mais}</ObjectStatus></TableCell>
            <TableCell horizontalAlign="End"><ObjectStatus state="Negative">−{a.menos}</ObjectStatus></TableCell>
          </TableRow>)}
        </Table>
        {arqs.length > 0 && <Title level="H5">Alterações</Title>}
        {arqs.map(a => (
          <Panel key={a.nome} headerText={a.nome} collapsed className="rev-diff">
            <pre className="codigo">{a.linhas.map((l, i) => <span key={i} className={classeLinha(l)}>{l}</span>)}</pre>
          </Panel>
        ))}
        {h.rodadas?.length > 1 && <>
          <Title level="H5">Rodadas anteriores</Title>
          <ul className="rev-ant">{h.rodadas.slice(0, -1).reverse().map((x, i) => <li key={i}>
            <ObjectStatus state={ESTADO[x.status] || 'None'}>{x.status}</ObjectStatus> <Text>{hora.format(x.inicio)}{x.ajuste ? ` · ajuste: ${x.ajuste}` : ''}</Text>
          </li>)}</ul>
        </>}
      </>}
      {ajuste !== null && (
        <Dialog open headerText="Pedir ajuste" className="ajuste" onClose={() => setAjuste(null)}
          footer={<Bar design="Footer" endContent={<>
            <Button design="Emphasized" disabled={ocupado || !ajuste.trim()} onClick={() => enviar('ajustar', ajuste.trim())}>Enviar à Fila</Button>
            <Button design="Transparent" icon="undo" onClick={() => setAjuste(null)}>Cancelar</Button>
          </>} />}>
          {erro && <MessageStrip design="Negative" hideCloseButton>{erro}</MessageStrip>}
          <Label for="texto-ajuste" required>O que ajustar</Label>
          <TextArea id="texto-ajuste" value={ajuste} onInput={e => setAjuste(e.target.value)} rows={5} required growing />
        </Dialog>
      )}
    </Dialog>
  );
}
