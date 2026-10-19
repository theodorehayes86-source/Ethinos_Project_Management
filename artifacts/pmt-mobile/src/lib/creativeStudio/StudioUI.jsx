// Shared Creative Studio presentation atoms. Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, RefreshCw, Send, Loader2, RotateCcw, Lock } from 'lucide-react';
import { STAGES, stageLabel, newKey, fmtStamp } from './core.js';

export const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-600 placeholder:text-slate-400';
export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors';
export const btnAccent = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl border border-slate-200 bg-white/80 text-slate-900 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-50 transition-colors';

export function StageBadge({ stage, testid }) {
  return (
    <span data-testid={testid} className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${STAGES[stage]?.tone || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {stageLabel(stage)}
    </span>
  );
}

export function UrgencyTag({ u }) {
  if (u === 'overdue') return <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Overdue</span>;
  if (u === 'soon') return <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Close to post</span>;
  return null;
}

export function Field({ label, hint, children, error }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
      {error && <span className="block text-[11px] text-rose-600 mt-1 font-semibold">{error}</span>}
    </label>
  );
}

export function Sheet({ title, onClose, children, footer, wide, testid }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[2px] cs-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} data-testid={testid} className={`cs-rise bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="cs-display text-xl text-slate-900">{title}</h3>
          <button data-testid="button-sheet-close" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div data-testid="status-studio-error" role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span className="flex-1 font-semibold">{message}</span>
      {onRetry && <button data-testid="button-studio-retry" onClick={onRetry} className="inline-flex items-center gap-1 font-bold hover:underline"><RefreshCw size={12} /> Retry</button>}
    </div>
  );
}

export function SkeletonList({ rows = 5 }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="text-center py-12 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-3">{icon}</div>
      <p className="cs-display text-lg text-slate-900">{title}</p>
      {body && <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Thread with pending/failed states and idempotent retries.
export function ThreadPanel({ api, clientId, itemId, thread, readOnly, myName }) {
  const [messages, setMessages] = useState(null);
  const [outbox, setOutbox] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const s = ++seq.current;
    try {
      const d = await api.messages(clientId, itemId, thread);
      if (s !== seq.current) return;
      setMessages(Array.isArray(d?.messages) ? d.messages : []);
      setError('');
    } catch (e) { if (s === seq.current) setError(e.message); }
  }, [api, clientId, itemId, thread]);

  useEffect(() => {
    setMessages(null); setOutbox([]);
    load();
    const t = setInterval(load, 20000);
    return () => { seq.current += 1; clearInterval(t); };
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages, outbox]);

  const deliver = async (entry) => {
    setOutbox(o => o.map(m => (m.key === entry.key ? { ...m, state: 'pending' } : m)));
    try {
      const d = await api.send(clientId, itemId, thread, { idempotencyKey: entry.key, text: entry.text });
      setOutbox(o => o.filter(m => m.key !== entry.key));
      setMessages(ms => {
        const list = ms || [];
        return list.some(m => m.id === d.message?.id) ? list : [...list, d.message];
      });
    } catch (e) {
      setOutbox(o => o.map(m => (m.key === entry.key ? { ...m, state: 'failed', error: e.message } : m)));
    }
  };
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const entry = { key: newKey(), text: t, state: 'pending' };
    setOutbox(o => [...o, entry]);
    setText('');
    deliver(entry);
  };

  const internal = thread === 'internal';
  return (
    <div className={`rounded-2xl border ${internal ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white/70'} flex flex-col`}>
      <div className="px-3 py-2 border-b border-inherit flex items-center gap-2">
        {internal && <Lock size={12} className="text-slate-900" />}
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-900">{internal ? 'Internal team' : 'Client chat'}</span>
        <span className="text-[10px] text-slate-400 ml-auto">{internal ? 'Never visible to clients' : 'Visible to client members'}</span>
      </div>
      <div className="p-3 space-y-2 max-h-72 overflow-y-auto min-h-[96px]" data-testid={`list-messages-${thread}`}>
        {error && <ErrorBanner message={error} onRetry={load} />}
        {messages === null && !error && <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />}
        {messages?.length === 0 && outbox.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No messages yet.</p>}
        {(messages || []).map(m => (
          <div key={m.id} data-testid={`message-${m.id}`} className="max-w-[88%]">
            <div className="flex items-baseline gap-2"><span className="text-[11px] font-bold text-slate-900">{m.author}</span><span className="text-[10px] text-slate-400">{fmtStamp(m.at)}</span></div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{m.text}</p>
          </div>
        ))}
        {outbox.map(m => (
          <div key={m.key} className="max-w-[88%] ml-auto text-right">
            <div className="flex items-baseline gap-2 justify-end">
              <span className="text-[11px] font-bold text-slate-900">{myName || 'You'}</span>
              {m.state === 'pending' ? <span className="text-[10px] text-slate-400 inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Sending</span>
                : <button data-testid={`button-retry-message-${m.key}`} onClick={() => deliver(m)} className="text-[10px] font-bold text-rose-600 inline-flex items-center gap-1"><RotateCcw size={10} /> Failed, retry</button>}
            </div>
            <p className={`text-sm whitespace-pre-wrap break-words ${m.state === 'failed' ? 'text-rose-600' : 'text-slate-500'}`}>{m.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {!readOnly && (
        <form onSubmit={submit} className="p-2 border-t border-inherit flex gap-2">
          <input data-testid={`input-message-${thread}`} value={text} maxLength={5000} onChange={e => setText(e.target.value)} placeholder={internal ? 'Note for the team' : 'Message the client'} className={inputCls} aria-label="Message" />
          <button data-testid={`button-send-${thread}`} type="submit" disabled={!text.trim()} className={btnPrimary} aria-label="Send"><Send size={14} /></button>
        </form>
      )}
    </div>
  );
}
