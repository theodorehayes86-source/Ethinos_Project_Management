import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check, User, Briefcase, FileText, Calendar, Tag, Loader2, Search, Plus, Trash2 } from 'lucide-react';
import { createTaskInFirebase, getSubtreeIds } from '../hooks/useFirebaseData.js';
import { sendNotification } from '../utils/notify.js';
import { checkLeaveConflict } from '../utils/taskUtils.js';
import LeaveConflictModal from './LeaveConflictModal.jsx';

const PINNED_CLIENT_NAMES = ['Personal', 'Ethinos Internal'];

const DEFAULT_CATEGORIES = [
  'Strategy & Planning','Campaign Setup','Campaign Optimization','Reporting & Analysis',
  'Client Communication','Content Creation','Creatives & Assets','Research',
  'Budget Management','Technical Setup','Training & Development','Other',
];

const FREQ_OPTIONS = ['Once','Daily','Weekly','Monthly'];

const WEEKDAY_SHORT = ['Mon','Tue','Wed','Thu','Fri'];
const WEEKDAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const WEEK_ORDINALS = ['1st','2nd','3rd','4th'];

function getNthWeekday(year, month, weekNum, dayIdx) {
  const jsDay = dayIdx + 1;
  let count = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === jsDay) {
      count++;
      if (count === weekNum) return new Date(year, month, d);
    }
  }
  return null;
}

function generateRecurringDates(startDate, endDate, freq, rDays, rWeek, rDay) {
  if (!endDate || !startDate) return startDate ? [startDate] : [];
  const end = new Date(endDate); end.setHours(23, 59, 59, 999);
  const dates = [];
  if (freq === 'Daily') {
    const d = new Date(startDate);
    while (d <= end) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
  } else if (freq === 'Weekly') {
    const days = (rDays && rDays.length > 0) ? rDays : [0];
    const d = new Date(startDate);
    while (d <= end) {
      const dow = d.getDay();
      const mapped = dow === 0 ? -1 : dow - 1;
      if (days.includes(mapped)) dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
  } else if (freq === 'Monthly') {
    const wk = rWeek || 1;
    const di = rDay !== undefined ? rDay : 0;
    let yr = startDate.getFullYear(), mo = startDate.getMonth();
    const endYr = end.getFullYear(), endMo = end.getMonth();
    while (yr < endYr || (yr === endYr && mo <= endMo)) {
      const dt = getNthWeekday(yr, mo, wk, di);
      if (dt && dt >= startDate && dt <= end) dates.push(dt);
      mo++; if (mo > 11) { mo = 0; yr++; }
    }
  }
  return dates;
}

const MANAGER_STEPS = [
  { id: 'who',      label: 'Assignee',   icon: User },
  { id: 'client',   label: 'Client',     icon: Briefcase },
  { id: 'task',     label: 'Task',       icon: FileText },
  { id: 'details',  label: 'Details',    icon: Calendar },
  { id: 'confirm',  label: 'Confirm',    icon: Check },
];

const PERSONAL_STEPS = [
  { id: 'client',   label: 'Client',     icon: Briefcase },
  { id: 'task',     label: 'Task',       icon: FileText },
  { id: 'details',  label: 'Details',    icon: Calendar },
  { id: 'confirm',  label: 'Confirm',    icon: Check },
];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.getDate();
  const suffix = ['th','st','nd','rd'][((day % 100 - 10) < 0 || (day % 100 - 10) > 2) ? Math.min(day % 10, 3) : day % 10] || 'th';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function Breadcrumb({ step, steps }) {
  return (
    <div className="flex items-center justify-center gap-1 py-3">
      {steps.map((s, i) => {
        const current = s.id === step;
        const done = steps.findIndex(x => x.id === step) > i;
        return (
          <React.Fragment key={s.id}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
              done ? 'bg-indigo-600 text-white' : current ? 'bg-indigo-600 text-white scale-110' : 'bg-slate-200 text-slate-400'
            }`}>
              {done ? <Check size={11} /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-5 h-0.5 rounded-full ${done ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SearchList({ items, onSelect, selected, labelKey = 'name', subKey, emptyMsg = 'No results' }) {
  const [q, setQ] = useState('');
  const filtered = items.filter(it => (it[labelKey] || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
        />
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{emptyMsg}</p>}
        {filtered.map((it, idx) => {
          const isSelected = selected && String(selected.id || selected.name) === String(it.id || it.name);
          return (
            <button
              key={idx}
              onClick={() => onSelect(it)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all min-h-[48px] ${
                isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {it[labelKey]}
                </p>
                {subKey && it[subKey] && (
                  <p className="text-xs text-slate-400 truncate">{it[subKey]}</p>
                )}
              </div>
              {isSelected && <Check size={16} className="text-indigo-600 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PinnedClientList({ items, selected, onSelect }) {
  const [q, setQ] = useState('');
  const filtered = items.filter(it => (it.name || '').toLowerCase().includes(q.toLowerCase()));
  const pinned = PINNED_CLIENT_NAMES
    .map(name => filtered.find(it => it.name === name))
    .filter(Boolean);
  const rest = filtered
    .filter(it => !PINNED_CLIENT_NAMES.includes(it.name))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const renderItem = (it) => {
    const isSelected = selected && String(selected.id || selected.name) === String(it.id || it.name);
    return (
      <button
        key={it.id || it.name}
        onClick={() => onSelect(it)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all min-h-[48px] ${
          isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
            {it.name}
          </p>
        </div>
        {isSelected && <Check size={16} className="text-indigo-600 flex-shrink-0" />}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
        />
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No clients found</p>}
        {pinned.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider px-1 pt-1">Suggested</p>
            {pinned.map(renderItem)}
          </>
        )}
        {rest.length > 0 && (
          <>
            {pinned.length > 0 && <div className="border-t border-slate-100 my-1" />}
            {rest.map(renderItem)}
          </>
        )}
      </div>
    </div>
  );
}

export default function AddTaskSheet({ currentUser, users, clients, clientLogs, categories, onClose, onCreated, personalMode = false }) {
  const STEPS = personalMode ? PERSONAL_STEPS : MANAGER_STEPS;
  const firstStep = STEPS[0].id;

  const [step, setStep] = useState(firstStep);
  const [assignee, setAssignee] = useState(personalMode ? currentUser : null);
  const [client, setClient] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState('Once');
  const [repeatDays, setRepeatDays] = useState([]);
  const [repeatMonthlyWeek, setRepeatMonthlyWeek] = useState(1);
  const [repeatMonthlyDay, setRepeatMonthlyDay] = useState(0);
  const [repeatEnd, setRepeatEnd] = useState('');
  const [steps, setSteps] = useState([]);
  const [stepInput, setStepInput] = useState('');
  const stepInputRef = useRef(null);
  const [dueDateMode, setDueDateMode] = useState('pick');
  const [relDays, setRelDays] = useState(1);
  const [reminderOffsets, setReminderOffsets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [leaveConflict, setLeaveConflict] = useState(null);
  const acknowledgedLeaveRef = useRef(null);

  useEffect(() => {
    const uid = String(assignee?.id || '');
    if (!uid || !dueDate) { setLeaveConflict(null); return; }
    const comboKey = `${uid}__${dueDate}`;
    if (acknowledgedLeaveRef.current === comboKey) return;
    let cancelled = false;
    checkLeaveConflict(uid, dueDate).then(conflict => {
      if (!cancelled) setLeaveConflict(conflict);
    });
    return () => { cancelled = true; };
  }, [assignee?.id, dueDate]);

  const teamIds = !personalMode ? getSubtreeIds(currentUser.id, users) : new Set();
  if (!personalMode) teamIds.delete(String(currentUser.id));
  const teamMembers = !personalMode ? users.filter(u => teamIds.has(String(u.id))) : [];

  const cats = categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  const stepIdx = STEPS.findIndex(s => s.id === step);
  const canNext = () => {
    if (step === 'who')     return !!assignee;
    if (step === 'client')  return !!client;
    if (step === 'task')    return name.trim().length > 0;
    if (step === 'details') return !!dueDate && !!category;
    return true;
  };

  const goNext = () => {
    const nextStep = STEPS[stepIdx + 1]?.id;
    if (nextStep) setStep(nextStep);
  };
  const goBack = () => {
    const prevStep = STEPS[stepIdx - 1]?.id;
    if (prevStep) setStep(prevStep);
  };

  const addStep = () => {
    const label = stepInput.trim();
    if (!label) return;
    setSteps(prev => [...prev, { id: `step-${Date.now()}`, label, done: false }]);
    setStepInput('');
    stepInputRef.current?.focus();
  };

  const removeStep = (id) => setSteps(prev => prev.filter(s => s.id !== id));

  const handleCreate = async () => {
    setError('');
    setSaving(true);
    try {
      const baseTask = {
        name: name.trim(),
        comment: description.trim(),
        assigneeId: assignee.id,
        dueDate: formatDate(dueDate),
        category,
        repeatFrequency: frequency,
        repeatEnd: frequency !== 'Once' && repeatEnd ? formatDate(repeatEnd) : null,
        repeatDays: frequency === 'Weekly' ? (repeatDays.length > 0 ? repeatDays : [0,1,2,3,4]) : null,
        repeatMonthlyWeek: frequency === 'Monthly' ? repeatMonthlyWeek : null,
        repeatMonthlyDay: frequency === 'Monthly' ? repeatMonthlyDay : null,
        steps: steps.length > 0 ? steps : [],
        reminderOffsets: reminderOffsets.length > 0 ? reminderOffsets : null,
      };
      if (frequency !== 'Once' && repeatEnd && dueDate) {
        const startDate = new Date(dueDate);
        const endDate = new Date(repeatEnd);
        const dates = generateRecurringDates(
          startDate, endDate, frequency,
          frequency === 'Weekly' ? (repeatDays.length > 0 ? repeatDays : [0,1,2,3,4]) : repeatDays,
          repeatMonthlyWeek, repeatMonthlyDay
        );
        const occurrences = dates.length > 0 ? dates : [startDate];
        const existing = Array.isArray(clientLogs[String(client.id)]) ? clientLogs[String(client.id)] : [];
        const newTasks = occurrences.map((dt, i) => ({
          id: Date.now() + i,
          status: 'Pending',
          createdAt: Date.now(),
          elapsedMs: 0,
          timerState: 'stopped',
          ...baseTask,
          dueDate: formatDate(dt.toISOString().split('T')[0]),
        }));
        const { set, ref } = await import('firebase/database');
        const { db } = await import('../firebase.js');
        await set(ref(db, `clientLogs/${String(client.id)}`), [...existing, ...newTasks]);
      } else {
        await createTaskInFirebase(String(client.id), baseTask, clientLogs);
      }
      if (!personalMode && assignee?.email && String(assignee.id) !== String(currentUser?.id)) {
        sendNotification('task-assigned', {
          assigneeEmail: assignee.email,
          assigneeName: assignee.name,
          taskName: name.trim(),
          taskDescription: description.trim(),
          clientName: client?.name || '',
          dueDate: formatDate(dueDate) || null,
          creatorName: currentUser?.name,
          steps: steps.length > 0 ? steps : [],
        });
      }
      onCreated?.();
      onClose();
    } catch (e) {
      setError('Failed to create task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="px-5 pt-4 pb-0 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            {personalMode ? 'Add Personal Task' : 'Add Task'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
            <X size={16} className="text-slate-600" />
          </button>
        </div>
        <Breadcrumb step={step} steps={STEPS} />

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {step === 'who' && (
            <div>
              <p className="text-sm font-bold text-slate-700 mb-3">Who should this task be assigned to?</p>
              <SearchList
                items={teamMembers}
                selected={assignee}
                onSelect={setAssignee}
                labelKey="name"
                subKey="role"
                emptyMsg="No team members found"
              />
            </div>
          )}

          {step === 'client' && (
            <div>
              <p className="text-sm font-bold text-slate-700 mb-3">Which client is this for?</p>
              {personalMode ? (
                <PinnedClientList
                  items={clients}
                  selected={client}
                  onSelect={setClient}
                />
              ) : (
                <SearchList
                  items={clients}
                  selected={client}
                  onSelect={setClient}
                  labelKey="name"
                  emptyMsg="No clients found"
                />
              )}
            </div>
          )}

          {step === 'task' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Task title <span className="text-red-400">*</span></p>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Prepare monthly report"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
                  autoFocus
                />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Description <span className="text-slate-400 font-normal">(optional)</span></p>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add any notes or context…"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50 resize-none"
                />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Checklist <span className="text-slate-400 font-normal">(optional)</span></p>
                {steps.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {steps.map(s => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="w-4 h-4 rounded border-2 border-slate-300 flex-shrink-0" />
                        <span className="flex-1 text-sm text-slate-700 truncate">{s.label}</span>
                        <button onClick={() => removeStep(s.id)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={stepInputRef}
                    type="text"
                    value={stepInput}
                    onChange={e => setStepInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addStep()}
                    placeholder="Add a checklist item…"
                    className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
                  />
                  <button
                    onClick={addStep}
                    disabled={!stepInput.trim()}
                    className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center disabled:opacity-30 transition-opacity flex-shrink-0"
                  >
                    <Plus size={16} className="text-white" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Due date <span className="text-red-400">*</span></p>
                <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded-xl mb-3 w-fit flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setDueDateMode('same-day');
                      setDueDate(new Date().toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dueDateMode === 'same-day' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    Same day
                  </button>
                  <button
                    type="button"
                    onClick={() => setDueDateMode('pick')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dueDateMode === 'pick' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                  >
                    Pick date
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      let days = relDays;
                      if (dueDate) {
                        const diff = Math.round((new Date(dueDate) - new Date(todayStr)) / 86400000);
                        if (diff > 0) days = Math.min(60, diff);
                      }
                      setRelDays(days);
                      setDueDateMode('relative');
                      const base = new Date(todayStr);
                      base.setDate(base.getDate() + days);
                      setDueDate(base.toISOString().split('T')[0]);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dueDateMode === 'relative' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    Days from start
                  </button>
                </div>
                {dueDateMode === 'same-day' && (
                  <p className="text-xs font-semibold text-emerald-600">Due: same day as task date ({formatDate(new Date().toISOString().split('T')[0])})</p>
                )}
                {dueDateMode === 'pick' && (
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
                  />
                )}
                {dueDateMode === 'relative' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={relDays}
                        onChange={e => {
                          const d = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1));
                          setRelDays(d);
                          const base = new Date(new Date().toISOString().split('T')[0]);
                          base.setDate(base.getDate() + d);
                          setDueDate(base.toISOString().split('T')[0]);
                        }}
                        className="w-20 px-3 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
                      />
                      <span className="text-sm text-slate-500 font-medium">days from start</span>
                    </div>
                    {dueDate && (
                      <p className="text-xs font-semibold text-indigo-600">Due: {formatDate(dueDate)}</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Category <span className="text-red-400">*</span></p>
                <div className="flex flex-wrap gap-2">
                  {cats.map(c => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        category === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Repeat</p>
                <div className="flex gap-2">
                  {FREQ_OPTIONS.map(f => (
                    <button
                      key={f}
                      onClick={() => { setFrequency(f); if (f === 'Once') { setRepeatEnd(''); setRepeatDays([]); }}}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        frequency === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                {frequency === 'Weekly' && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Repeat on Days</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {WEEKDAY_SHORT.map((d, i) => (
                        <button key={i} type="button"
                          onClick={() => setRepeatDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${repeatDays.includes(i) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}
                        >{d}</button>
                      ))}
                    </div>
                    {repeatDays.length === 0 && <p className="text-[11px] text-slate-400 mt-1">No days selected — defaults to Mon–Fri</p>}
                  </div>
                )}
                {frequency === 'Monthly' && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Repeat on</p>
                    <div className="flex gap-2">
                      <select value={repeatMonthlyWeek} onChange={e => setRepeatMonthlyWeek(Number(e.target.value))}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-slate-50">
                        {WEEK_ORDINALS.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
                      </select>
                      <select value={repeatMonthlyDay} onChange={e => setRepeatMonthlyDay(Number(e.target.value))}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-slate-50">
                        {WEEKDAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <p className="text-[11px] text-indigo-500 font-medium mt-1">{WEEK_ORDINALS[repeatMonthlyWeek - 1]} {WEEKDAY_FULL[repeatMonthlyDay]} of each month</p>
                  </div>
                )}
                {frequency !== 'Once' && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Repeat Until <span className="font-normal text-slate-400">(contract / end date)</span></p>
                    <input
                      type="date"
                      value={repeatEnd}
                      onChange={e => setRepeatEnd(e.target.value)}
                      min={dueDate || new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
                    />
                    {repeatEnd && dueDate && (() => {
                      const cnt = generateRecurringDates(
                        new Date(dueDate), new Date(repeatEnd), frequency,
                        frequency === 'Weekly' ? (repeatDays.length > 0 ? repeatDays : [0,1,2,3,4]) : repeatDays,
                        repeatMonthlyWeek, repeatMonthlyDay
                      ).length;
                      return cnt > 0 ? (
                        <p className="text-xs font-semibold text-indigo-600 mt-1">{cnt} task{cnt !== 1 ? 's' : ''} will be created</p>
                      ) : null;
                    })()}
                  </div>
                )}
                {dueDate && (
                  <div className="mt-4">
                    <p className="text-sm font-bold text-slate-700 mb-2">Email Reminders</p>
                    <p className="text-xs text-slate-400 mb-2">Relative to due date — "after" reminders also alert the QC reviewer</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: '-7', label: '7d before' },
                        { value: '-3', label: '3d before' },
                        { value: '-2', label: '2d before' },
                        { value: '-1', label: '1d before' },
                        { value: '0',  label: 'On day' },
                        { value: '+1', label: '1d after', overdue: true },
                        { value: '+2', label: '2d after', overdue: true },
                        { value: '+3', label: '3d after', overdue: true },
                      ].map(opt => {
                        const active = reminderOffsets.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setReminderOffsets(prev =>
                              prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                            )}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                              active
                                ? opt.overdue
                                  ? 'bg-red-100 border-red-400 text-red-700'
                                  : 'bg-indigo-100 border-indigo-400 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-500'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-700">Review & create</p>
              {[
                !personalMode && { label: 'Assigned to', value: `${assignee?.name} (${assignee?.role})` },
                personalMode && { label: 'Assigned to', value: `${currentUser?.name} (you)` },
                { label: 'Client',      value: client?.name },
                { label: 'Task',        value: name },
                { label: 'Description', value: description || '—' },
                { label: 'Due date',    value: dueDate ? formatDate(dueDate) : '—' },
                { label: 'Category',    value: category },
                { label: 'Repeat', value: frequency === 'Weekly' && repeatDays.length > 0
                    ? `Weekly (${repeatDays.map(i => WEEKDAY_SHORT[i]).join(', ')})`
                    : frequency === 'Monthly'
                    ? `Monthly (${WEEK_ORDINALS[repeatMonthlyWeek - 1]} ${WEEKDAY_FULL[repeatMonthlyDay]})`
                    : frequency },
                frequency !== 'Once' && repeatEnd && { label: 'Repeat Until', value: formatDate(repeatEnd) },
                reminderOffsets.length > 0 && { label: 'Reminders', value: reminderOffsets.join(', ') + ' days vs due date' },
                steps.length > 0 && { label: 'Checklist', value: `${steps.length} item${steps.length !== 1 ? 's' : ''}` },
              ].filter(Boolean).map(({ label, value }) => (
                <div key={label} className="flex gap-3 py-3 border-b border-slate-100 last:border-0">
                  <span className="text-xs font-bold text-slate-400 w-28 flex-shrink-0 pt-0.5">{label}</span>
                  <span className="text-sm text-slate-800 font-medium flex-1">{value}</span>
                </div>
              ))}
              {error && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          {stepIdx > 0 && (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold min-h-[48px]"
            >
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {step !== 'confirm' ? (
            <button
              onClick={goNext}
              disabled={!canNext()}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold min-h-[48px] disabled:opacity-40 transition-opacity"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold min-h-[48px] disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          )}
        </div>
      </div>

      {leaveConflict && (
        <LeaveConflictModal
          conflict={leaveConflict}
          userName={assignee?.name || 'Assignee'}
          onProceed={() => {
            acknowledgedLeaveRef.current = `${assignee?.id}__${dueDate}`;
            setLeaveConflict(null);
          }}
          onCancel={() => {
            setLeaveConflict(null);
            setDueDate('');
          }}
        />
      )}
    </div>
  );
}
