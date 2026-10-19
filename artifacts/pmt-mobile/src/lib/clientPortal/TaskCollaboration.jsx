// "Shared with client" collaboration for one task: messages, notes, links and
// subtasks visible to BOTH the client and Ethinos staff. Internal staff
// messages/steps never flow through here. Used by the client portal, the
// desktop TaskDetailPanel and the mobile TaskDetailSheet. Duplicated in pmt-mobile.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquare, StickyNote, Link2, ListChecks, Send, Loader2, AlertTriangle, RotateCcw, ExternalLink, Check, Plus, Lock,
} from 'lucide-react';
import {
  COLLAB_LIMITS, safeExternalUrl, validateCollabEntry, validateCollabSubtask, requestIdFor,
  isCollabClosedError, sortCollab, mergeById, createMutationGate,
} from './core.js';

const POLL_MS = 20000;
const MODES = [
  { id: 'message', label: 'Message', Icon: MessageSquare },
  { id: 'note', label: 'Note', Icon: StickyNote },
  { id: 'link', label: 'Link', Icon: Link2 },
];
const fieldCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-300 disabled:opacity-60';
const fmtTime = (ms) => {
  const d = new Date(Number(ms));
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};

function Entry({ e }) {
  const href = e.type === 'link' ? safeExternalUrl(e.url) : null;
  const tone = e.type === 'note' ? 'bg-amber-50 border-amber-100' : e.type === 'link' ? 'bg-indigo-50/60 border-indigo-100' : 'bg-white border-slate-200';
  const Icon = e.type === 'note' ? StickyNote : e.type === 'link' ? Link2 : MessageSquare;
  return (
    <li data-testid={`collab-entry-${e.id}`} className={`rounded-xl border px-3 py-2.5 ${tone}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
        <Icon size={11} className="shrink-0" />
        <span className="font-bold text-slate-700 truncate">{e.authorName || 'Someone'}</span>
        <span className="uppercase tracking-wider font-semibold">{e.type}</span>
        <span className="ml-auto shrink-0">{fmtTime(e.createdAt)}</span>
      </div>
      {e.type === 'link' ? (
        href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-700 hover:underline break-all inline-flex items-start gap-1">
            {e.text || href}<ExternalLink size={11} className="mt-1 shrink-0" />
          </a>
        ) : <span className="text-sm text-slate-400">Link unavailable</span>
      ) : null}
      {e.type === 'link' && e.text && href && <p className="text-[11px] text-slate-400 break-all mt-0.5">{href}</p>}
      {e.type !== 'link' && <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{e.text}</p>}
    </li>
  );
}

/**
 * api: object with getTaskCollaboration / addCollaborationEntry / addCollaborationSubtask / setCollaborationSubtask.
 * onClosed(err): called once when the server says the parent task is no longer shared/accessible.
 */
// readOnly: staff client preview. Loads the real shared thread (GET only); every write path is blocked.
export default function TaskCollaboration({ api, clientId, taskId, onClosed, viewer = 'client', readOnly = false }) {
  const [data, setData] = useState(null); // { entries, subtasks }
  const [loadError, setLoadError] = useState('');
  const [closed, setClosed] = useState(false);
  const [mode, setMode] = useState('message');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState('');
  const [toggling, setToggling] = useState({});
  const [toggleError, setToggleError] = useState({});
  const seqRef = useRef(0);
  const aliveRef = useRef(true);
  const entrySlot = useRef(null);
  const subSlot = useRef(null);
  const busyRef = useRef({ entry: false, sub: false, toggle: new Set() });
  const closedRef = useRef(false);
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createMutationGate();
  const gate = gateRef.current;
  // Installs a mutation result only while mounted and still shared.
  const canApply = () => aliveRef.current && !closedRef.current;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const failClosed = useCallback((err) => {
    seqRef.current += 1;
    setData(null); // never keep content after the parent was unshared/revoked
    setClosed(true);
    if (!closedRef.current) { closedRef.current = true; onClosedRef.current?.(err); }
  }, []);

  const load = useCallback(async () => {
    if (closedRef.current) return;
    const seq = ++seqRef.current;
    const snap = gate.snapshot();
    try {
      const res = await api.getTaskCollaboration(clientId, taskId);
      if (!aliveRef.current || closedRef.current || seq !== seqRef.current) return;
      // A mutation overlapped this load: its snapshot may predate the change. Next poll refreshes.
      if (!gate.canInstall(snap)) return;
      setData({ entries: sortCollab(res?.entries), subtasks: sortCollab(res?.subtasks) });
      setLoadError('');
    } catch (err) {
      if (!aliveRef.current || closedRef.current || seq !== seqRef.current) return;
      if (isCollabClosedError(err)) { failClosed(err); return; }
      setLoadError(err?.message || 'Could not load the shared conversation.');
    }
  }, [api, clientId, taskId, failClosed, gate]);

  useEffect(() => {
    aliveRef.current = true;
    closedRef.current = false;
    setClosed(false);
    setData(null);
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      aliveRef.current = false;
      seqRef.current += 1;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const handleMutationError = (err, setErr, fallback) => {
    if (isCollabClosedError(err)) { failClosed(err); return; }
    setErr(err?.message || fallback);
  };

  const submitEntry = async (e) => {
    e?.preventDefault();
    if (busyRef.current.entry || closedRef.current) return;
    if (readOnly) return;
    const payload = { type: mode, text: text.trim(), url: mode === 'link' ? safeExternalUrl(url) : null };
    const errs = validateCollabEntry({ ...payload, url: mode === 'link' ? url : null });
    if (Object.keys(errs).length) { setEntryError(Object.values(errs)[0]); return; }
    entrySlot.current = requestIdFor(entrySlot.current, payload);
    busyRef.current.entry = true;
    gate.begin();
    setEntryBusy(true); setEntryError('');
    try {
      const res = await api.addCollaborationEntry(clientId, taskId, { ...payload, url: payload.url || undefined, requestId: entrySlot.current.id });
      if (!canApply()) return;
      if (!res?.entry) throw new Error('The server did not confirm this post. Try again.');
      setData(d => (d ? { ...d, entries: sortCollab(mergeById(d.entries, res.entry)) } : d));
      entrySlot.current = null;
      setText(''); setUrl('');
    } catch (err) {
      if (canApply()) handleMutationError(err, setEntryError, 'Could not post.');
    } finally {
      busyRef.current.entry = false;
      gate.end();
      if (aliveRef.current) setEntryBusy(false);
    }
  };

  const submitSubtask = async (e) => {
    e?.preventDefault();
    if (busyRef.current.sub || closedRef.current) return;
    if (readOnly) return;
    const payload = { title: subTitle.trim() };
    const errs = validateCollabSubtask(payload);
    if (errs.title) { setSubError(errs.title); return; }
    subSlot.current = requestIdFor(subSlot.current, payload);
    busyRef.current.sub = true;
    gate.begin();
    setSubBusy(true); setSubError('');
    try {
      const res = await api.addCollaborationSubtask(clientId, taskId, { ...payload, requestId: subSlot.current.id });
      if (!canApply()) return;
      if (!res?.subtask) throw new Error('The server did not confirm this subtask. Try again.');
      setData(d => (d ? { ...d, subtasks: sortCollab(mergeById(d.subtasks, res.subtask)) } : d));
      subSlot.current = null;
      setSubTitle('');
    } catch (err) {
      if (canApply()) handleMutationError(err, setSubError, 'Could not add subtask.');
    } finally {
      busyRef.current.sub = false;
      gate.end();
      if (aliveRef.current) setSubBusy(false);
    }
  };

  const toggleSubtask = async (st, completed) => {
    if (readOnly) return;
    const id = String(st.id);
    if (busyRef.current.toggle.has(id) || closedRef.current) return;
    busyRef.current.toggle.add(id);
    gate.begin();
    setToggling(t => ({ ...t, [id]: true }));
    setToggleError(t => { const n = { ...t }; delete n[id]; return n; });
    try {
      const res = await api.setCollaborationSubtask(clientId, taskId, st.id, { completed });
      if (!canApply()) return;
      if (!res?.subtask) throw new Error('Not confirmed. Try again.');
      setData(d => (d ? { ...d, subtasks: sortCollab(mergeById(d.subtasks, res.subtask)) } : d));
    } catch (err) {
      if (canApply()) handleMutationError(err, (m) => setToggleError(t => ({ ...t, [id]: { message: m, completed } })), 'Could not update.');
    } finally {
      busyRef.current.toggle.delete(id);
      gate.end();
      if (aliveRef.current) setToggling(t => { const n = { ...t }; delete n[id]; return n; });
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
        <MessageSquare size={10} /> Shared with client
      </span>
      <span className="text-[10px] text-slate-400">{readOnly ? 'Preview only. Replies and subtask changes are made in the portal by the client or internally by staff.' : viewer === 'staff' ? 'The client sees everything in this section. Internal chat stays private.' : 'Visible to you and your agency team.'}</span>
    </div>
  );

  if (closed) {
    return (
      <section data-testid="collab-closed" className="space-y-2">
        {header}
        <p className="text-xs text-slate-500 flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2"><Lock size={12} /> This task is no longer shared, so the conversation is hidden.</p>
      </section>
    );
  }

  const done = data ? data.subtasks.filter(s => s.completed).length : 0;

  return (
    <section data-testid="section-task-collaboration" className="space-y-4">
      {header}

      {data === null ? (
        loadError ? (
          <div className="text-center py-4">
            <AlertTriangle size={18} className="text-red-400 mx-auto mb-1" />
            <p data-testid="text-collab-load-error" className="text-xs font-semibold text-slate-600">{loadError}</p>
            <button type="button" onClick={load} className="mt-2 text-xs font-bold text-indigo-600 hover:underline">Try again</button>
          </div>
        ) : (
          <div className="space-y-2" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        )
      ) : (
        <>
          {/* Subtasks */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ListChecks size={12} /> Subtasks {data.subtasks.length > 0 && <span className="text-slate-500">{done}/{data.subtasks.length}</span>}
            </p>
            {data.subtasks.length > 0 && (
              <ul className="space-y-1">
                {data.subtasks.map(st => {
                  const id = String(st.id);
                  const busy = !!toggling[id];
                  const err = toggleError[id];
                  return (
                    <li key={id} data-testid={`collab-subtask-${id}`} className="rounded-lg hover:bg-slate-50 px-2 py-1.5">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" data-testid={`checkbox-collab-subtask-${id}`} checked={!!st.completed} disabled={busy || readOnly}
                          onChange={e => toggleSubtask(st, e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                        <span className={`text-sm flex-1 break-words ${st.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{st.title}</span>
                        {busy && <Loader2 size={12} className="animate-spin text-indigo-500 mt-1" />}
                        <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{st.authorName}</span>
                      </label>
                      {err && (
                        <p role="alert" className="text-[10px] font-semibold text-red-600 ml-6 flex items-center gap-1">
                          {err.message}
                          <button type="button" onClick={() => toggleSubtask(st, err.completed)} className="underline text-indigo-600 inline-flex items-center gap-0.5"><RotateCcw size={9} /> Retry</button>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!readOnly && <form onSubmit={submitSubtask} className="flex gap-2">
              <input data-testid="input-collab-subtask" value={subTitle} onChange={e => { setSubTitle(e.target.value); setSubError(''); }} maxLength={COLLAB_LIMITS.title}
                disabled={subBusy} placeholder="Add a subtask" className={fieldCls} />
              <button type="submit" data-testid="button-collab-subtask-add" disabled={subBusy || !subTitle.trim()}
                className="shrink-0 px-3 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1">
                {subBusy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
              </button>
            </form>}
            {subError && <p role="alert" data-testid="text-collab-subtask-error" className="text-[11px] font-semibold text-red-600">{subError}{subSlot.current && <> · <button type="button" onClick={submitSubtask} className="underline text-indigo-600">Retry</button></>}</p>}
          </div>

          {/* Discussion */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><MessageSquare size={12} /> Discussion, notes and links</p>
            {data.entries.length === 0
              ? <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-3 text-center">{readOnly ? 'No messages yet.' : 'No messages yet. Start the conversation below.'}</p>
              : <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">{data.entries.map(e => <Entry key={e.id} e={e} />)}</ul>}

            {!readOnly && <form onSubmit={submitEntry} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
              <div className="flex gap-1" role="tablist" aria-label="Post type">
                {MODES.map(({ id, label, Icon }) => (
                  <button key={id} type="button" role="tab" aria-selected={mode === id} data-testid={`button-collab-mode-${id}`} disabled={entryBusy}
                    onClick={() => { setMode(id); setEntryError(''); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 ${mode === id ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Icon size={11} /> {label}
                  </button>
                ))}
              </div>
              {mode === 'link' && (
                <input data-testid="input-collab-url" type="url" value={url} onChange={e => { setUrl(e.target.value); setEntryError(''); }} maxLength={COLLAB_LIMITS.url}
                  disabled={entryBusy} placeholder="https://" className={fieldCls} />
              )}
              <textarea data-testid="input-collab-text" value={text} onChange={e => { setText(e.target.value); setEntryError(''); }} maxLength={COLLAB_LIMITS.text}
                disabled={entryBusy} rows={mode === 'link' ? 1 : 2}
                placeholder={mode === 'link' ? 'Label (optional)' : mode === 'note' ? 'Leave a note for the task' : 'Write a message'}
                className={`${fieldCls} resize-none`} />
              <div className="flex items-center gap-2">
                {entryError
                  ? <p role="alert" data-testid="text-collab-entry-error" className="text-[11px] font-semibold text-red-600 flex-1">{entryError}</p>
                  : <span className="flex-1" />}
                <button type="submit" data-testid="button-collab-post" disabled={entryBusy}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                  {entryBusy ? <Loader2 size={12} className="animate-spin" /> : entryError && entrySlot.current ? <RotateCcw size={12} /> : mode === 'note' ? <Check size={12} /> : <Send size={12} />}
                  {entryBusy ? 'Posting…' : entryError && entrySlot.current ? 'Retry' : mode === 'note' ? 'Add note' : mode === 'link' ? 'Add link' : 'Send'}
                </button>
              </div>
            </form>}
          </div>
        </>
      )}
    </section>
  );
}
