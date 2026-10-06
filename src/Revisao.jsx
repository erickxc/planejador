import { useEffect, useState } from 'react';
import { X, Check, Undo2, Trash2, MessageSquarePlus } from 'lucide-react';

const hora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dur = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
// o diff vem de código do sistema: sempre como texto (o React escapa), nunca como HTML
const porArquivo = diff => (diff || '').split(/^(?=diff --git )/m).filter(Boolean).map(t => ({ nome: /^diff --git a\/(.+?) b\//.exec(t)?.[1] || '?', linhas: t.split('\n') }));
const classeLinha = l => (l.startsWith('@@') ? 'h' : l.startsWith('+') && !l.startsWith('+++') ? 'a' : l.startsWith('-') && !l.startsWith('---') ? 'r' : '');

export default function Revisao({ c, chamar, onFechar, onFeito }) {
  const [h, setH] = useState(null), [erro, setErro] = useState(''), [ajuste, setAjuste] = useState(null), [tudo, setTudo] = useState(false), [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    chamar(`/api/execucao/historico?p=${encodeURIComponent(c.projeto)}&id=${encodeURIComponent(c.id)}`).then(j => vivo && setH(j), e => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [c.projeto, c.id, chamar]);
  useEffect(() => { const esc = e => e.key === 'Escape' && onFechar(); addEventListener('keydown', esc); return () => removeEventListener('keydown', esc); }, [onFechar]);

  const enviar = async (acao, texto) => {
    setOcupado(true); setErro('');
    try {
      const r = await chamar('/api/execucao/' + acao, { projeto: c.projeto, id: c.id, texto });
      if (r.ok === false) setErro(r.motivo || 'não foi possível concluir'); else onFeito(r.aviso);
    } catch (e) { setErro(e.message); }
    setOcupado(false);
  };

  const r = h?.rodadas.at(-1), saida = (r?.testes?.saida || '').split('\n'), arqs = porArquivo(r?.diff);
  return (
    <div className="fundo" onClick={onFechar}>
      <aside className="gaveta revisao" onClick={e => e.stopPropagation()} role="dialog" aria-label={'Revisar ' + c.titulo}>
        <header>
          <span className="col-tag c-revisar"><span className="ponto" />Revisar</span>
          <button className="ic" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </header>
        <h2>{c.titulo.replace(/`/g, '')}</h2>
        {h?.ramo && <p className="rev-meta">Ramo <code>{h.ramo}</code></p>}
        {erro && <p className="erro">{erro}</p>}
        {!h && !erro && <p className="rev-meta">Carregando…</p>}
        {r && <>
          <p className={'rev-status ' + r.status}>{r.status}</p>
          <p className="rev-resumo">{r.resumo || 'Sem resumo.'}</p>
          <p className="rev-meta">{dur(r.fim - r.inicio)} · {r.passos?.length || 0} passos</p>
          <h4>Testes: <span className={r.testes?.ok ? 'ok' : 'falha'}>{r.testes?.ok ? 'passaram' : 'falharam'}</span></h4>
          {r.testes?.saida && <>
            <pre className="rev-saida">{(tudo ? saida : saida.slice(-20)).join('\n')}</pre>
            {saida.length > 20 && <button className="link-acao" onClick={() => setTudo(v => !v)}>{tudo ? 'ver menos' : 'ver tudo'}</button>}
          </>}
          <h4>Arquivos ({r.arquivos?.length || 0})</h4>
          <ul className="rev-arqs">{(r.arquivos || []).map(a => <li key={a.arq}><span>{a.arq}</span><b className="a">+{a.mais}</b><b className="r">−{a.menos}</b></li>)}</ul>
          {arqs.map(a => (
            <details key={a.nome} className="rev-diff">
              <summary>{a.nome}</summary>
              <pre>{a.linhas.map((l, i) => <span key={i} className={classeLinha(l)}>{l + '\n'}</span>)}</pre>
            </details>
          ))}
          {h.rodadas.length > 1 && <>
            <h4>Rodadas anteriores</h4>
            <ul className="rev-ant">{h.rodadas.slice(0, -1).reverse().map((x, i) => <li key={i}><b className={x.status}>{x.status}</b> {hora.format(x.inicio)}{x.ajuste ? ` · ajuste: ${x.ajuste}` : ''}</li>)}</ul>
          </>}
        </>}
        {ajuste === null ? (
          <div className="acoes rev-acoes">
            <button className="perigo" disabled={ocupado} onClick={() => confirm(`Descartar "${c.titulo}"? O trabalho do agente será apagado.`) && enviar('descartar')}><Trash2 size={15} />Descartar</button>
            <span />
            <button className="sec" disabled={ocupado} onClick={() => setAjuste('')}><MessageSquarePlus size={15} />Pedir ajuste</button>
            <button className="pri" disabled={ocupado} onClick={() => enviar('aceitar')}><Check size={15} />Aceitar</button>
          </div>
        ) : (
          <form className="edicao" onSubmit={e => { e.preventDefault(); enviar('ajustar', ajuste.trim()); }}>
            <label>O que ajustar<textarea value={ajuste} onChange={e => setAjuste(e.target.value)} rows={4} required autoFocus /></label>
            <div className="acoes">
              <span />
              <button type="button" className="sec" onClick={() => setAjuste(null)}><Undo2 size={15} />Cancelar</button>
              <button type="submit" className="pri" disabled={ocupado || !ajuste.trim()}>Enviar à Fila</button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
