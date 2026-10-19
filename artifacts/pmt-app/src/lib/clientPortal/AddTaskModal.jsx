// Client Add Task dialog: title/category/description/due date, optional reminder, subtasks and links.
// One submit -> one POST. Duplicated in pmt-mobile; keep in sync.
import React, { useRef, useState } from 'react';
import { Plus, X, Loader2, Trash2 } from 'lucide-react';
import {
  validatePortalTask, buildCreateTaskPayload, PORTAL_CATEGORY_MAX, PORTAL_TIMEZONES,
  DEFAULT_REMINDER_TIME, DEFAULT_REMINDER_TZ, TASK_CREATE_LIMITS,
} from './core.js';

const inputCls = 'w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-300';
const primaryBtn = 'w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2';
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
const ghostBtn = 'min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5';
const errCls = 'text-[11px] font-semibold text-red-600';

export default function AddTaskModal({ clientName, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: '', category: '', description: '', dueDate: '',
    reminderDate: '', reminderTime: DEFAULT_REMINDER_TIME, reminderTimezone: DEFAULT_REMINDER_TZ,
    subtasks: [], links: [],
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const keyRef = useRef(0);
  const [keys, setKeys] = useState({ subtasks: [], links: [] });
  const nextKey = () => ++keyRef.current;
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const addRow = (kind, row) => {
    setForm(f => ({ ...f, [kind]: [...f[kind], row] }));
    setKeys(k => ({ ...k, [kind]: [...k[kind], nextKey()] }));
  };
  const removeRow = (kind, i) => {
    setForm(f => ({ ...f, [kind]: f[kind].filter((_, x) => x !== i) }));
    setKeys(k => ({ ...k, [kind]: k[kind].filter((_, x) => x !== i) }));
    setErrors(e => { const n = { ...e }; delete n[kind]; return n; });
  };
  const setSub = (i, v) => setForm(f => ({ ...f, subtasks: f.subtasks.map((s, x) => (x === i ? v : s)) }));
  const setLink = (i, k, v) => setForm(f => ({ ...f, links: f.links.map((l, x) => (x === i ? { ...l, [k]: v } : l)) }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = validatePortalTask(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError('');
    try {
      await onSubmit(buildCreateTaskPayload(form));
      onClose();
    } catch (err) { setError(err?.message || 'Could not add task.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="add-task-heading">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <form onSubmit={submit} noValidate aria-busy={busy} className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 id="add-task-heading" className="text-base font-bold text-slate-900">Add a task</h3>
            <p className="text-xs text-slate-500">For {clientName}. Your agency team will pick it up.</p>
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="w-11 h-11 -mr-2 rounded-full bg-slate-100 flex items-center justify-center disabled:opacity-50"><X size={15} className="text-slate-600" /></button>
        </div>
        <label className="block space-y-1.5">
          <span className={labelCls}>Title <span className="text-red-500">*</span></span>
          <input data-testid="input-portal-task-title" autoFocus value={form.title} onChange={set('title')} maxLength={200} aria-invalid={!!errors.title} className={inputCls} />
          {errors.title && <span role="alert" className={errCls}>{errors.title}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className={labelCls}>Category <span className="text-slate-400 normal-case font-normal">(optional, e.g. Social, SEO, Website)</span></span>
          <input data-testid="input-portal-task-category" value={form.category} onChange={set('category')} maxLength={PORTAL_CATEGORY_MAX} className={inputCls} />
          {errors.category && <span role="alert" className={errCls}>{errors.category}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className={labelCls}>Description</span>
          <textarea data-testid="input-portal-task-description" value={form.description} onChange={set('description')} rows={4} maxLength={4000} placeholder="What do you need, and any context" className={`${inputCls} py-2.5 resize-none`} />
        </label>
        <label className="block space-y-1.5">
          <span className={labelCls}>Due date <span className="text-slate-400 normal-case font-normal">(optional)</span></span>
          <input data-testid="input-portal-task-due" type="date" value={form.dueDate} onChange={set('dueDate')} className={inputCls} />
          {errors.dueDate && <span role="alert" className={errCls}>{errors.dueDate}</span>}
        </label>

        <fieldset className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-2.5">
          <legend className={`${labelCls} px-1`}>Reminder <span className="text-slate-400 normal-case font-normal">(optional, needs a due date)</span></legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Date</span>
              <input data-testid="input-portal-task-reminder-date" type="date" value={form.reminderDate} max={form.dueDate || undefined} onChange={set('reminderDate')} aria-invalid={!!errors.reminderDate} className={inputCls} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Time</span>
              <input data-testid="input-portal-task-reminder-time" type="time" value={form.reminderTime} onChange={set('reminderTime')} className={inputCls} />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Timezone</span>
            <select data-testid="select-portal-task-reminder-tz" value={form.reminderTimezone} onChange={set('reminderTimezone')} className={inputCls}>
              {PORTAL_TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <p data-testid="text-portal-task-reminder-help" className="text-[11px] text-slate-500 leading-snug">Reminders go to the assigned agency team once the task is assigned. Unassigned tasks do not send reminders.</p>
          {(errors.reminderDate || errors.reminderTime || errors.reminderTimezone) && <p role="alert" data-testid="text-portal-task-reminder-error" className={errCls}>{errors.reminderDate || errors.reminderTime || errors.reminderTimezone}</p>}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelCls}>Subtasks <span className="text-slate-400 normal-case font-normal">(optional)</span></legend>
          {form.subtasks.map((s, i) => (
            <div key={keys.subtasks[i]}>
              <div className="flex gap-2">
                <input data-testid={`input-portal-task-subtask-${i}`} aria-label={`Subtask ${i + 1}`} value={s} onChange={e => setSub(i, e.target.value)} maxLength={TASK_CREATE_LIMITS.subtaskText} placeholder="Subtask" className={inputCls} />
                <button type="button" data-testid={`button-portal-task-subtask-remove-${i}`} aria-label={`Remove subtask ${i + 1}`} onClick={() => removeRow('subtasks', i)} className={`${ghostBtn} px-3`}><Trash2 size={14} /></button>
              </div>
              {errors.subtasks?.[i] && <span role="alert" className={errCls}>{errors.subtasks[i]}</span>}
            </div>
          ))}
          {errors.subtasksTotal && <p role="alert" className={errCls}>{errors.subtasksTotal}</p>}
          <button type="button" data-testid="button-portal-task-subtask-add" disabled={form.subtasks.length >= TASK_CREATE_LIMITS.subtasks} onClick={() => addRow('subtasks', '')} className={`${ghostBtn} disabled:opacity-50`}><Plus size={13} /> Add subtask</button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelCls}>Links <span className="text-slate-400 normal-case font-normal">(optional)</span></legend>
          {form.links.map((l, i) => (
            <div key={keys.links[i]} className="rounded-xl border border-slate-100 p-2 space-y-2">
              <div className="flex gap-2">
                <input data-testid={`input-portal-task-link-url-${i}`} aria-label={`Link ${i + 1} URL`} type="url" value={l.url} onChange={e => setLink(i, 'url', e.target.value)} maxLength={TASK_CREATE_LIMITS.linkUrl} placeholder="https://" className={inputCls} />
                <button type="button" data-testid={`button-portal-task-link-remove-${i}`} aria-label={`Remove link ${i + 1}`} onClick={() => removeRow('links', i)} className={`${ghostBtn} px-3`}><Trash2 size={14} /></button>
              </div>
              <input data-testid={`input-portal-task-link-text-${i}`} aria-label={`Link ${i + 1} label`} value={l.text} onChange={e => setLink(i, 'text', e.target.value)} maxLength={TASK_CREATE_LIMITS.linkText} placeholder="Label (optional, defaults to the URL)" className={inputCls} />
              {errors.links?.[i]?.url && <span role="alert" className={errCls}>{errors.links[i].url}</span>}
              {errors.links?.[i]?.text && <span role="alert" className={errCls}>{errors.links[i].text}</span>}
            </div>
          ))}
          {errors.linksTotal && <p role="alert" className={errCls}>{errors.linksTotal}</p>}
          <button type="button" data-testid="button-portal-task-link-add" disabled={form.links.length >= TASK_CREATE_LIMITS.links} onClick={() => addRow('links', { text: '', url: '' })} className={`${ghostBtn} disabled:opacity-50`}><Plus size={13} /> Add link</button>
        </fieldset>

        {error && <p role="alert" className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <button data-testid="button-portal-task-submit" type="submit" disabled={busy} className={primaryBtn}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={15} />} Add task
        </button>
      </form>
    </div>
  );
}
