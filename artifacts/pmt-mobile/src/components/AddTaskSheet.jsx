import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, User, Briefcase, FileText, Calendar, Tag, Loader2, Search } from 'lucide-react';
import { createTaskInFirebase, getSubtreeIds } from '../hooks/useFirebaseData.js';

const PINNED_CLIENT_NAMES = ['Personal', 'Ethinos Internal'];

const DEFAULT_CATEGORIES = [
  'Strategy & Planning','Campaign Setup','Campaign Optimization','Reporting & Analysis',
  'Client Communication','Content Creation','Creatives & Assets','Research',
  'Budget Management','Technical Setup','Training & Development','Other',
];

const FREQ_OPTIONS = ['Once','Daily','Weekly','Monthly'];

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const handleCreate = async () => {
    setError('');
    setSaving(true);
    try {
      await createTaskInFirebase(String(client.id), {
        name: name.trim(),
        comment: description.trim(),
        assigneeId: assignee.id,
        dueDate: formatDate(dueDate),
        category,
        repeatFrequency: frequency,
      }, clientLogs);
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
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50 resize-none"
                />
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Due date <span className="text-red-400">*</span></p>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-slate-50"
                />
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
                      onClick={() => setFrequency(f)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        frequency === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
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
                { label: 'Repeat',      value: frequency },
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
    </div>
  );
}
