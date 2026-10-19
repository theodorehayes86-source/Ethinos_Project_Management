// Client-facing task workspace: list + monthly calendar sharing one filter,
// one detail view and one status control. Only client-safe DTO fields are shown
// (title, category, description = clientDescription, status, dueDate).
// Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Clock, Activity, CheckCircle, AlertTriangle, Calendar, Plus, X,
  Loader2, RefreshCw, Building2, Search, List, CalendarDays, Lock, Tag, PauseCircle, RotateCcw,
} from 'lucide-react';
import {
  isRevocationError, portalStats, filterPortalTasks, portalStatusBucket, portalStatusValue,
  PORTAL_TASK_STATUSES, isPortalTaskStatus, statusEditState, validatePortalTask, PORTAL_CATEGORY_MAX,
  mergeTask, monthGrid, shiftMonth, groupTasksByDue, localDateKey, parseLooseDate,
} from './core.js';

const POLL_MS = 30000;
const inputCls = 'w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-300';
const primaryBtn = 'w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2';
const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  wip: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hold: 'bg-slate-100 text-slate-600 border-slate-200',
};
const DOT = { pending: 'bg-amber-400', wip: 'bg-blue-500', done: 'bg-emerald-500', hold: 'bg-slate-400' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmtDue = (raw) => {
  const d = parseLooseDate(raw);
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
};

export function CategoryChip({ category }) {
  if (!category) return null;
  return (
    <span data-testid="text-portal-task-category" className="inline-flex items-center gap-1 max-w-full text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
      <Tag size={10} className="shrink-0" /><span className="truncate">{category}</span>
    </span>
  );
}

/** Shared status dropdown (list rows + detail). Shows saving / error / retry / read-only reason. */
export function StatusControl({ task, saving, error, onChange, onRetry }) {
  const { editable, reason } = statusEditState(task);
  const value = portalStatusValue(task.status);
  const legacy = !isPortalTaskStatus(value);
  const bucket = portalStatusBucket(task.status);
  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <div className={`relative inline-flex items-center rounded-full border ${STATUS_STYLE[bucket]} ${saving ? 'opacity-70' : ''}`}>
          {!editable && <Lock size={10} className="ml-2 shrink-0" />}
          <select
            data-testid={`select-portal-task-status-${task.id}`}
            aria-label="Task status"
            title={editable ? 'Change status' : reason}
            value={value}
            disabled={!editable || saving}
            onClick={e => e.stopPropagation()}
            onChange={e => { const next = e.target.value; if (isPortalTaskStatus(next) && next !== value) onChange(task, next); }}
            className="appearance-none bg-transparent pl-2.5 pr-6 py-1 text-[11px] font-bold outline-none cursor-pointer disabled:cursor-not-allowed"
          >
            {legacy && <option value={value} disabled>{value}</option>}
            {PORTAL_TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronRight size={10} className="absolute right-2 rotate-90 pointer-events-none" />
        </div>
        {saving && <Loader2 data-testid={`status-saving-${task.id}`} size={13} className="text-indigo-500 animate-spin" />}
      </div>
      {!editable && <p data-testid={`text-status-locked-${task.id}`} className="text-[10px] text-slate-500 leading-snug">{reason}</p>}
      {error && (
        <p data-testid={`text-status-error-${task.id}`} role="alert" className="text-[10px] font-semibold text-red-600 flex items-center gap-1 flex-wrap">
          <AlertTriangle size={10} /> {error.message}
          {onRetry && error.next && (
            <button type="button" data-testid={`button-status-retry-${task.id}`} onClick={e => { e.stopPropagation(); onRetry(task, error.next); }} className="inline-flex items-center gap-0.5 text-indigo-600 underline">
              <RotateCcw size={9} /> Retry
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, tone }) {
  return (
    <div className={`bg-white border ${tone === 'red' ? 'border-red-100' : 'border-slate-100'} rounded-xl px-3.5 py-3 shadow-sm`}>
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${tone === 'red' ? 'text-red-500' : 'text-slate-500'}`}>{label}</span>
        {icon}
      </div>
      <p className={`text-xl font-black mt-1 ${tone === 'red' ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function AddTaskModal({ clientName, onClose, onSubmit }) {
  const [form, setForm] = useState({ title: '', category: '', description: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = validatePortalTask(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError('');
    try {
      await onSubmit({ title: form.title.trim(), category: form.category.trim() || undefined, description: form.description.trim(), dueDate: form.dueDate || undefined });
      onClose();
    } catch (err) { setError(err?.message || 'Could not add task.'); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Add a task</h3>
            <p className="text-xs text-slate-500">For {clientName}. Your agency team will pick it up.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X size={15} className="text-slate-600" /></button>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title <span className="text-red-500">*</span></span>
          <input data-testid="input-portal-task-title" autoFocus value={form.title} onChange={set('title')} maxLength={200} className={inputCls} />
          {errors.title && <span className="text-[11px] font-semibold text-red-600">{errors.title}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category <span className="text-slate-400 normal-case font-normal">(optional, e.g. Social, SEO, Website)</span></span>
          <input data-testid="input-portal-task-category" value={form.category} onChange={set('category')} maxLength={PORTAL_CATEGORY_MAX} className={inputCls} />
          {errors.category && <span className="text-[11px] font-semibold text-red-600">{errors.category}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
          <textarea data-testid="input-portal-task-description" value={form.description} onChange={set('description')} rows={4} maxLength={4000} placeholder="What do you need, and any links or context" className={`${inputCls} py-2.5 resize-none`} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date <span className="text-slate-400 normal-case font-normal">(optional)</span></span>
          <input data-testid="input-portal-task-due" type="date" value={form.dueDate} onChange={set('dueDate')} className={inputCls} />
        </label>
        {error && <p role="alert" className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <button data-testid="button-portal-task-submit" type="submit" disabled={busy} className={primaryBtn}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={15} />} Add task
        </button>
      </form>
    </div>
  );
}

function TaskDetail({ task, statusProps, onClose }) {
  const due = fmtDue(task.dueDate);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={task.title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div data-testid="panel-portal-task-detail" className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <CategoryChip category={task.category} />
            <h3 data-testid="text-portal-task-detail-title" className="text-lg font-bold text-slate-900 break-words leading-snug">{task.title}</h3>
          </div>
          <button type="button" data-testid="button-portal-task-detail-close" onClick={onClose} className="w-8 h-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center"><X size={15} className="text-slate-600" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
            <StatusControl task={task} {...statusProps} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Due date</p>
            <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Calendar size={13} className="text-slate-400" />{due || <span className="text-slate-400 font-normal">No due date</span>}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description</p>
          <div data-testid="text-portal-task-detail-description" className="text-sm text-slate-700 whitespace-pre-wrap break-words bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-3 min-h-[60px]">
            {task.description || <span className="text-slate-400">No description shared yet.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskList({ tasks, statusPropsFor, onOpen }) {
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map(t => {
        const due = fmtDue(t.dueDate);
        return (
          <li key={t.id} data-testid={`row-portal-task-${t.id}`} className="px-4 md:px-5 py-3.5 md:grid md:grid-cols-[3fr_1fr_1.3fr] md:gap-4 md:items-start space-y-2 md:space-y-0 hover:bg-slate-50/60">
            <button type="button" data-testid={`button-open-task-${t.id}`} onClick={() => onOpen(t.id)} className="text-left min-w-0 space-y-1 w-full">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900 break-words">{t.title}</span>
                <CategoryChip category={t.category} />
              </span>
              <span className="block text-xs text-slate-500 whitespace-pre-wrap break-words line-clamp-2">{t.description || <span className="text-slate-300">No description</span>}</span>
            </button>
            <p className="text-xs text-slate-600 flex items-center gap-1"><Calendar size={11} className="text-slate-400" />{due || <span className="text-slate-300">No due date</span>}</p>
            <StatusControl task={t} {...statusPropsFor(t)} />
          </li>
        );
      })}
    </ul>
  );
}

function CalendarView({ tasks, month, setMonth, onOpen, todayKey }) {
  const grid = useMemo(() => monthGrid(month.year, month.month), [month]);
  const { byDate, undated } = useMemo(() => groupTasksByDue(tasks), [tasks]);
  const label = new Date(month.year, month.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const monthDays = grid.filter(c => c.inMonth && byDate[c.key]);
  const goToday = () => { const n = new Date(); setMonth({ year: n.getFullYear(), month: n.getMonth() }); };
  const chip = (t) => (
    <button key={t.id} type="button" data-testid={`calendar-task-${t.id}`} onClick={() => onOpen(t.id)} title={t.title}
      className={`w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold truncate ${STATUS_STYLE[portalStatusBucket(t.status)]}`}>
      <span className="truncate">{t.title}</span>
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <h3 data-testid="text-calendar-month" className="text-sm font-bold text-slate-900 flex-1">{label}</h3>
          <button type="button" data-testid="button-calendar-prev" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"><ChevronLeft size={15} /></button>
          <button type="button" data-testid="button-calendar-today" onClick={goToday} className="px-3 h-8 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">Today</button>
          <button type="button" data-testid="button-calendar-next" aria-label="Next month" onClick={() => setMonth(m => shiftMonth(m, 1))} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"><ChevronRight size={15} /></button>
        </div>
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
          {WEEKDAYS.map(d => <div key={d} className="px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {grid.map(c => {
            const list = byDate[c.key] || [];
            const isToday = c.key === todayKey;
            return (
              <div key={c.key} data-testid={`calendar-day-${c.key}`} className={`min-h-[52px] md:min-h-[96px] border-b border-r border-slate-100 p-1 md:p-1.5 ${c.inMonth ? 'bg-white' : 'bg-slate-50/70'}`}>
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${isToday ? 'bg-indigo-600 text-white' : c.inMonth ? 'text-slate-700' : 'text-slate-300'}`}>{c.date.getDate()}</span>
                {list.length > 0 && (
                  <>
                    <div className="hidden md:block space-y-1 mt-1">
                      {list.slice(0, 3).map(chip)}
                      {list.length > 3 && <button type="button" onClick={() => onOpen(list[3].id)} className="text-[10px] font-semibold text-indigo-600">+{list.length - 3} more</button>}
                    </div>
                    <div className="md:hidden flex flex-wrap gap-0.5 mt-1 justify-center">
                      {list.slice(0, 4).map(t => <button key={t.id} type="button" aria-label={t.title} onClick={() => onOpen(t.id)} className={`w-2 h-2 rounded-full ${DOT[portalStatusBucket(t.status)]}`} />)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact agenda for narrow screens: same month, same tasks, same detail. */}
      <div className="md:hidden bg-white border border-slate-100 rounded-xl shadow-sm">
        <p className="px-4 py-2.5 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">This month</p>
        {monthDays.length === 0 ? <p className="p-4 text-xs text-slate-400">No dated tasks in {label}.</p> : (
          <ul className="divide-y divide-slate-100">
            {monthDays.map(c => (
              <li key={c.key} className="px-4 py-2.5 flex gap-3">
                <span className="w-10 shrink-0 text-center">
                  <span className="block text-[10px] font-bold uppercase text-slate-400">{c.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className={`block text-base font-black ${c.key === todayKey ? 'text-indigo-600' : 'text-slate-800'}`}>{c.date.getDate()}</span>
                </span>
                <div className="flex-1 min-w-0 space-y-1">{byDate[c.key].map(chip)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-testid="panel-calendar-undated" className="bg-white border border-slate-100 rounded-xl shadow-sm">
        <p className="px-4 py-2.5 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">No due date ({undated.length})</p>
        {undated.length === 0 ? <p className="p-4 text-xs text-slate-400">Every matching task has a due date.</p> : (
          <ul className="p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {undated.map(t => (
              <li key={t.id}>
                <button type="button" data-testid={`undated-task-${t.id}`} onClick={() => onOpen(t.id)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[portalStatusBucket(t.status)]}`} />
                  <span className="text-xs font-semibold text-slate-800 truncate flex-1">{t.title}</span>
                  {t.category && <span className="text-[10px] text-indigo-600 font-semibold truncate max-w-[40%]">{t.category}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}</div>;
}

export default function ClientTasks({ client, api, auth, onBack, onRevoked, initialView = 'list' }) {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState(initialView === 'calendar' ? 'calendar' : 'list');
  const [month, setMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState({});
  const [statusErrors, setStatusErrors] = useState({});
  const seqRef = useRef(0);       // list load sequence
  const epochRef = useRef(0);     // bumps on every mutation start/end; older loads are discarded
  const inflight = useRef(new Set());
  const opRef = useRef({});       // per-task status op sequence
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    const epoch = epochRef.current;
    const uid = auth.currentUser?.uid;
    const stale = () => seq !== seqRef.current || auth.currentUser?.uid !== uid;
    try {
      const data = await api.listTasks(client.id);
      if (stale()) return;
      // A status save started or finished meanwhile: this snapshot may predate it.
      if (epoch !== epochRef.current || inflight.current.size > 0) return;
      setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      setError('');
    } catch (err) {
      if (stale()) return;
      setTasks(null); // never keep stale private content after an error
      setError(err?.message || 'Could not load tasks.');
      if (isRevocationError(err)) onRevoked();
    }
  }, [api, auth, client.id, onRevoked]);

  useEffect(() => {
    setTasks(null);
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      seqRef.current += 1;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const changeStatus = useCallback(async (task, next) => {
    const id = String(task.id);
    if (!isPortalTaskStatus(next) || inflight.current.has(id) || !statusEditState(task).editable) return;
    const op = (opRef.current[id] || 0) + 1;
    opRef.current[id] = op;
    const uid = auth.currentUser?.uid;
    inflight.current.add(id);
    epochRef.current += 1;
    setSaving(s => ({ ...s, [id]: true }));
    setStatusErrors(e => { const n = { ...e }; delete n[id]; return n; });
    try {
      const res = await api.updateTaskStatus(client.id, task.id, next);
      if (!aliveRef.current || opRef.current[id] !== op || auth.currentUser?.uid !== uid) return;
      if (!res?.task) throw new Error('The server did not confirm this change. Refresh and try again.');
      setTasks(ts => mergeTask(ts, res.task)); // server result wins (canonical status)
    } catch (err) {
      if (!aliveRef.current || opRef.current[id] !== op) return;
      setStatusErrors(e => ({ ...e, [id]: { message: err?.message || 'Could not update status.', next } }));
      if (isRevocationError(err)) onRevoked();
    } finally {
      inflight.current.delete(id);
      epochRef.current += 1;
      if (aliveRef.current) setSaving(s => { const n = { ...s }; delete n[id]; return n; });
    }
  }, [api, auth, client.id, onRevoked]);

  const statusPropsFor = (t) => ({ saving: !!saving[String(t.id)], error: statusErrors[String(t.id)], onChange: changeStatus, onRetry: changeStatus });

  const all = tasks || [];
  const stats = portalStats(all);
  const visible = filterPortalTasks(all, { query, status: statusFilter });
  const openTask = openId !== null ? all.find(t => String(t.id) === String(openId)) : null;
  const todayKey = localDateKey(new Date());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button data-testid="button-portal-back" onClick={onBack} className="p-2 bg-white hover:bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
            <ChevronLeft size={18} className="text-slate-600" />
          </button>
          <h2 data-testid="text-portal-client-name" className="text-xl font-bold text-slate-900 tracking-tight truncate">{client.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="button-portal-refresh" onClick={load} className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg font-semibold text-xs hover:bg-slate-50 flex items-center gap-1.5">
            <RefreshCw size={13} /> Refresh
          </button>
          <button data-testid="button-portal-add-task" onClick={() => setShowAdd(true)} className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg font-bold text-xs hover:bg-indigo-700 flex items-center gap-1.5">
            <Plus size={13} /> Add task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <StatCard label="Pending" value={stats.pending} icon={<Clock size={13} className="text-amber-500" />} />
        <StatCard label="In progress" value={stats.wip} icon={<Activity size={13} className="text-blue-500" />} />
        <StatCard label="Completed" value={stats.done} icon={<CheckCircle size={13} className="text-emerald-500" />} />
        <StatCard label="On hold" value={stats.hold} icon={<PauseCircle size={13} className="text-slate-400" />} />
        <StatCard label="Overdue" value={stats.overdue} tone="red" icon={<AlertTriangle size={13} className="text-red-500" />} />
        <StatCard label="Due today" value={stats.dueToday} icon={<Calendar size={13} className="text-slate-500" />} />
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex p-0.5 rounded-lg bg-white border border-slate-200" role="tablist" aria-label="Task view">
          {[['list', 'List', List], ['calendar', 'Calendar', CalendarDays]].map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={view === id} data-testid={`tab-task-view-${id}`} onClick={() => setView(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 ${view === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="input-portal-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, category, description" className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-2 ring-indigo-500/20" />
        </div>
        <select data-testid="select-portal-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none">
          <option value="all">All tasks</option>
          <option value="pending">Pending</option>
          <option value="wip">In progress</option>
          <option value="done">Completed</option>
          {stats.hold > 0 && <option value="hold">On hold</option>}
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {error ? (
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-8 text-center">
          <AlertTriangle size={26} className="text-red-400 mx-auto mb-2" />
          <p data-testid="text-portal-tasks-error" className="text-sm font-semibold text-slate-700">{error}</p>
          <button onClick={load} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">Try again</button>
        </div>
      ) : tasks === null ? (
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm"><SkeletonRows /></div>
      ) : tasks.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3"><Building2 size={20} className="text-indigo-500" /></div>
          <p className="text-sm font-bold text-slate-800">Nothing shared yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Tasks your agency shares with you will appear here. You can also add a request.</p>
        </div>
      ) : view === 'calendar' ? (
        <CalendarView tasks={visible} month={month} setMonth={setMonth} onOpen={setOpenId} todayKey={todayKey} />
      ) : (
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[3fr_1fr_1.3fr] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>Task · category · description</span><span>Due date</span><span>Status</span>
          </div>
          {visible.length === 0
            ? <p className="p-8 text-center text-xs text-slate-400">No tasks match these filters.</p>
            : <TaskList tasks={visible} statusPropsFor={statusPropsFor} onOpen={setOpenId} />}
        </div>
      )}

      {openTask && <TaskDetail task={openTask} statusProps={statusPropsFor(openTask)} onClose={() => setOpenId(null)} />}

      {showAdd && (
        <AddTaskModal
          clientName={client.name}
          onClose={() => setShowAdd(false)}
          onSubmit={async (payload) => {
            let res;
            try { res = await api.createTask(client.id, payload); }
            catch (err) { if (isRevocationError(err)) onRevoked(); throw err; }
            if (res?.task) setTasks(ts => mergeTask(ts, res.task));
            await load();
          }}
        />
      )}
    </div>
  );
}
