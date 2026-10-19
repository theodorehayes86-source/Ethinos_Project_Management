// External client creative section: shared items, assigned decisions and client chat only.
// Server projects external data. Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ExternalLink, CheckCircle2, MessageSquare, Palette, RefreshCw } from 'lucide-react';
import { createStudioApi, peekStudioLink, writeStudioLink, isHttps, fmtInstant, tzShort, relativeDay, ASSET_KINDS, fmtStamp } from './core.js';
import { inputCls, btnPrimary, btnGhost, btnAccent, StageBadge, ErrorBanner, SkeletonList, EmptyState, ThreadPanel, Field } from './StudioUI.jsx';

export default function PortalStudio({ auth, apiBase, onRevoked }) {
  const api = useMemo(() => createStudioApi({ base: apiBase, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }), [auth, apiBase]);
  const [items, setItems] = useState(null);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [openId, setOpenIdRaw] = useState(() => peekStudioLink()?.item || null);
  const setOpenId = useCallback((id) => { setOpenIdRaw(id); }, []);
  useEffect(() => {
    if (!items) return;
    const it = items.find(i => i.id === openId);
    writeStudioLink(openId ? { item: openId, client: it?.clientId || peekStudioLink()?.client } : null);
  }, [openId, items]);
  const seq = useRef(0);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    const s = ++seq.current;
    try {
      const b = await api.bootstrap();
      const cl = b.clients || [];
      const lists = await Promise.all(cl.map(c => api.list(c.id).then(d => d.deliverables || [])));
      if (s !== seq.current) return;
      setClients(cl); setItems(lists.flat()); setError('');
    } catch (e) {
      if (s !== seq.current) return;
      setItems(null); setError(e.message);
      if (e.status === 401 || e.status === 403) onRevoked?.();
    }
  }, [api, onRevoked]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => { seq.current += 1; clearInterval(t); };
  }, [load]);

  const mine = (i) => ['reference', 'final'].some(p => i.approvals?.[p]?.status === 'pending' && i.approvals[p].approverUid === uid && i.stage === `awaiting_${p}`);
  const open = items?.find(i => i.id === openId);
  const name = (id) => clients.find(c => c.id === id)?.name || '';

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!items) return <SkeletonList rows={3} />;
  if (open) return <PortalDetail item={open} api={api} uid={uid} clientName={name(open.clientId)} onBack={() => setOpenId(null)} onChange={(d) => setItems(l => l.map(i => (i.id === d.id ? d : i)))} onReload={load} />;

  const waiting = items.filter(mine);
  const linkMissing = openId && !open;
  const rest = items.filter(i => !mine(i));
  return (
    <div className="cs-root space-y-5 text-left text-[#1f2440]">
      <div className="flex items-end justify-between gap-2">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b3d]">Creative</p><h2 className="cs-display text-3xl leading-none mt-1">Shared content</h2></div>
        <button data-testid="button-portal-studio-refresh" onClick={load} className={btnGhost}><RefreshCw size={13} /> Refresh</button>
      </div>
      {linkMissing && <ErrorBanner message="That item is not shared with you or is no longer available." onRetry={() => setOpenId(null)} />}
      {items.length === 0 ? (
        <EmptyState icon={<Palette size={20} />} title="Nothing shared yet" body="Your agency will share creative content here when it is ready for review." />
      ) : (
        <>
          <section>
            <h3 className="cs-display text-xl mb-2">Waiting on your decision <span className="text-sm text-stone-400">({waiting.length})</span></h3>
            {waiting.length === 0 ? <p className="text-xs text-stone-400">No approvals assigned to you right now.</p> : <List list={waiting} name={name} onOpen={setOpenId} accent />}
          </section>
          {rest.length > 0 && <section><h3 className="cs-display text-xl mb-2">All shared</h3><List list={rest} name={name} onOpen={setOpenId} /></section>}
        </>
      )}
    </div>
  );
}

function List({ list, name, onOpen, accent }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map(i => (
        <button key={i.id} data-testid={`card-portal-deliverable-${i.id}`} onClick={() => onOpen(i.id)}
          className={`text-left rounded-2xl border p-3 transition-all hover:-translate-y-px ${accent ? 'border-[#ff6b3d] bg-[#fff4ea]' : 'border-[#ece3d5] bg-white/80'}`}>
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">{name(i.clientId)} · {i.type}</p>
          <p className="text-sm font-bold truncate mt-0.5">{i.title}</p>
          <div className="flex items-center justify-between mt-2 gap-2">
            <StageBadge stage={i.stage} />
            <span className="text-[11px] text-stone-500">{i.plannedAt ? relativeDay(i.plannedAt, i.timezone) : 'Date to be confirmed'}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function PortalDetail({ item, api, uid, clientName, onBack, onChange, onReload }) {
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const phase = ['reference', 'final'].find(p => item.approvals?.[p]?.status === 'pending' && item.approvals[p].approverUid === uid && item.stage === `awaiting_${p}`);
  const decide = async (decision) => {
    if (decision === 'changes_requested' && !feedback.trim()) { setError('Describe the changes you need.'); return; }
    setBusy(true); setError('');
    try {
      const d = await api.action(item.clientId, item.id, { revision: item.revision, action: 'decide', phase, decision, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) });
      onChange(d.deliverable); setFeedback('');
      setDone(`${decision === 'approved' ? 'Approved. Thank you.' : 'Change request sent.'}${d.emailError ? ' Your decision was saved; the team notification could not be queued.' : ''}`);
    } catch (e) { setError(e.message); if (e.status === 409) onReload(); } finally { setBusy(false); }
  };
  const snapshot = phase ? item.approvals[phase].snapshot : null;
  return (
    <div className="cs-root space-y-4 text-left text-[#1f2440]">
      <button data-testid="button-portal-studio-back" onClick={onBack} className={btnGhost}><ChevronLeft size={14} /> Shared content</button>
      <div className="rounded-3xl border border-[#e7dfd2] bg-[#fffdf9] p-4 sm:p-6 space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">{clientName} · {item.type} · revision {item.revision}</p>
          <h2 data-testid="text-portal-deliverable-title" className="cs-display text-3xl leading-tight break-words">{item.title}</h2>
          <div className="flex flex-wrap gap-2 items-center mt-2">
            <StageBadge stage={item.stage} />
            <span className="text-xs text-stone-500">{item.plannedAt ? `${fmtInstant(item.plannedAt, item.timezone, { weekday: 'short' })} ${tzShort(item.timezone)}` : 'Posting date to be confirmed'}</span>
            <span className="text-xs text-stone-500">{(item.platforms || []).join(', ')}</span>
          </div>
        </div>
        <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400 mb-1">Caption</p><p className="text-sm whitespace-pre-wrap break-words">{(snapshot?.caption ?? item.caption) || 'No caption.'}</p></div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400 mb-1">{snapshot ? 'Submitted assets' : 'Assets'}</p>
          <ul className="space-y-1.5">
            {(snapshot?.assets || item.assets || []).map((a, idx) => (
              <li key={a.id || idx} className="flex items-center gap-2 rounded-xl border border-[#ece3d5] bg-white px-3 py-2">
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#1f2440] text-[#fffaf3]">{ASSET_KINDS.find(k => k.id === a.kind)?.label || a.kind}</span>
                <span className="text-sm flex-1 truncate">{a.label}</span>
                {isHttps(a.url) && <a data-testid={`link-portal-asset-${a.id || idx}`} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold inline-flex items-center gap-1 underline">Open <ExternalLink size={11} /></a>}
              </li>
            ))}
            {!(snapshot?.assets || item.assets || []).length && <li className="text-xs text-stone-400">No assets shared.</li>}
          </ul>
          <p className="text-[11px] text-stone-400 mt-1">File access depends on the file's own sharing permissions.</p>
        </div>

        {phase ? (
          <div data-testid="panel-portal-decision" className="rounded-2xl bg-[#1f2440] text-[#fffaf3] p-4 space-y-3">
            <p className="cs-display text-xl">{phase === 'reference' ? 'Reference approval' : 'Final post approval'}</p>
            <p className="text-xs opacity-75">Requested {fmtStamp(item.approvals[phase].requestedAt)}. Your decision applies to this exact revision.</p>
            <Field label={<span className="text-[#fffaf3]/70">Feedback (required for changes)</span>}>
              <textarea data-testid="input-portal-feedback" rows={3} value={feedback} onChange={e => setFeedback(e.target.value)} className={inputCls} />
            </Field>
            {error && <ErrorBanner message={error} />}
            <div className="flex flex-wrap gap-2">
              <button data-testid="button-portal-approve" disabled={busy} onClick={() => decide('approved')} className={btnAccent}><CheckCircle2 size={13} /> Approve</button>
              <button data-testid="button-portal-request-changes" disabled={busy} onClick={() => decide('changes_requested')} className={`${btnPrimary} !bg-white/10 border border-white/30`}>Request changes</button>
            </div>
          </div>
        ) : (
          <>
            {done && <p data-testid="status-portal-decision" className="text-sm font-bold text-emerald-700">{done}</p>}
            {error && <ErrorBanner message={error} />}
          </>
        )}
      </div>
      <div>
        <p className="cs-display text-xl mb-2 flex items-center gap-2"><MessageSquare size={16} /> Conversation</p>
        <ThreadPanel api={api} clientId={item.clientId} itemId={item.id} thread="client" />
      </div>
    </div>
  );
}
