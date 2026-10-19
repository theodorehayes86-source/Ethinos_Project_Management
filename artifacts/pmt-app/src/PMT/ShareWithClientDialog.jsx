// Focused confirmation for sharing selected Clients-view tasks with the client portal.
// Pre-fills ONLY the existing clientDescription; the internal comment is never read.
import React, { useState } from 'react';
import { Eye, X, Lock, AlertTriangle, Loader2, Check, RotateCcw } from 'lucide-react';

export default function ShareWithClientDialog({ clientName, plan, saving = false, error = '', onConfirm, onCancel }) {
  const { eligible = [], skipped = [] } = plan || {};
  const [drafts, setDrafts] = useState(() => Object.fromEntries(eligible.map(e => [e.id, e.clientDescription || ''])));
  const newCount = eligible.filter(e => !e.alreadyShared).length;
  const close = () => { if (!saving) onCancel(); };

  return (
    <div className="fixed inset-0 z-[950] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Share with client">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={close} />
      <div data-testid="dialog-share-with-client" className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[90dvh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><Eye size={16} className="text-indigo-600" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900">Share with {clientName || 'client'}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {eligible.length === 0 ? 'None of the selected tasks can be shared.' : `${newCount} to share${eligible.length - newCount ? `, ${eligible.length - newCount} already shared` : ''}${skipped.length ? `, ${skipped.length} skipped` : ''}.`}
            </p>
          </div>
          <button type="button" onClick={close} disabled={saving} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center disabled:opacity-50"><X size={15} className="text-slate-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3.5 py-3 text-xs text-slate-600 space-y-1">
            <p><b className="text-slate-800">The client sees only:</b> title, category, status, due date and the client description below.</p>
            <p className="flex items-start gap-1.5"><Lock size={11} className="mt-0.5 shrink-0 text-slate-400" />Internal comments, assignees, time logs, QC and checklists stay private.</p>
            <p>Clients can update status (Pending, In Progress, Completed) unless a timer or QC review locks it. Only these selected tasks are shared, not future repeat occurrences.</p>
          </div>

          {eligible.length === 0 ? (
            <div data-testid="text-share-none-eligible" className="text-center py-6">
              <AlertTriangle size={22} className="text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">Nothing to share</p>
              <p className="text-xs text-slate-500 mt-1">Checklist items, grouped tasks, archived tasks, personal workspaces and tasks you cannot edit are never shared.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {eligible.map(({ id, task, alreadyShared }) => (
                <li key={id} data-testid={`share-row-${id}`} className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 flex-1 min-w-0 break-words">{task.name || task.title || 'Untitled task'}</p>
                    {alreadyShared && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">Already shared</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {task.category && <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold">{task.category}</span>}
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold">{task.status || 'Pending'}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{task.dueDate ? `Due ${task.dueDate}` : 'No due date'}</span>
                  </div>
                  <textarea
                    data-testid={`input-share-description-${id}`}
                    value={drafts[id] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [id]: e.target.value }))}
                    disabled={saving}
                    rows={2}
                    maxLength={4000}
                    placeholder={alreadyShared ? 'Leave blank to keep the current client description' : 'Client description (optional). Internal notes are never copied.'}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 ring-indigo-500/20 resize-none"
                  />
                </li>
              ))}
            </ul>
          )}

          {skipped.length > 0 && (
            <div data-testid="list-share-skipped" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Skipped ({skipped.length})</p>
              <ul className="space-y-1">
                {skipped.map(s => (
                  <li key={s.id} className="text-xs text-slate-600 flex gap-2"><span className="truncate flex-1">{s.title}</span><span className="text-slate-400 shrink-0">{s.label}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 space-y-2">
          {error && <p data-testid="text-share-error" role="alert" className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertTriangle size={12} /> {error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={saving} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            {eligible.length > 0 && (
              <button type="button" data-testid="button-share-confirm" onClick={() => onConfirm(drafts)} disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <Loader2 size={14} className="animate-spin" /> : error ? <RotateCcw size={14} /> : <Check size={14} />}
                {saving ? 'Sharing…' : error ? 'Retry' : `Share ${eligible.length} task${eligible.length > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
