import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, XCircle, MinusCircle, Calendar, Tag, Clock, Play, Pause, Square, PlusCircle, Trash2 } from 'lucide-react';

const CADENCE_COLORS = {
  Daily:   'bg-emerald-100 text-emerald-700',
  Weekly:  'bg-blue-100 text-blue-700',
  Monthly: 'bg-purple-100 text-purple-700',
};

const ANSWER_CONFIG = {
  yes: { label: 'Yes', icon: CheckCircle,  bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-500', hover: 'hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700' },
  no:  { label: 'No',  icon: XCircle,      bg: 'bg-red-500',     text: 'text-white', border: 'border-red-500',     hover: 'hover:bg-red-50 hover:border-red-400 hover:text-red-700' },
  na:  { label: 'N/A', icon: MinusCircle,  bg: 'bg-slate-400',   text: 'text-white', border: 'border-slate-400',   hover: 'hover:bg-slate-50 hover:border-slate-300 hover:text-slate-600' },
};

function formatDuration(ms) {
  if (!ms) return '0:00:00';
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

const ChecklistGroupDetailPanel = ({
  group,
  childTasks,
  currentUser,
  users = [],
  taskCategories = [],
  onClose,
  onUpdateChildTask,
  onUpdateGroup,
  onOpenTask,
  onCreateTaskFromItem,
  onDeleteGroup,
}) => {
  const [localChildren, setLocalChildren] = useState(childTasks || []);
  const [noteTexts, setNoteTexts] = useState({});
  const [timerTick, setTimerTick] = useState(Date.now());

  // Inline task creation state — keyed by checklist item id
  const [createTaskOpen, setCreateTaskOpen] = useState({});
  const [createTaskForm, setCreateTaskForm] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLocalChildren(childTasks || []);
    const initialNotes = {};
    (childTasks || []).forEach(t => {
      if (t.checklistNote) initialNotes[t.id] = t.checklistNote;
    });
    setNoteTexts(initialNotes);
  }, [group.id]);

  useEffect(() => {
    const interval = setInterval(() => setTimerTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const checklistItems = localChildren.filter(t => t.taskType === 'checklist');
  const standardItems = localChildren.filter(t => t.taskType !== 'checklist');

  // Separate yes/no/na items from text-input-only items
  const ynItems   = checklistItems.filter(t => !t.requiresInput);
  const textItems = checklistItems.filter(t => t.requiresInput);

  const answeredCount = ynItems.filter(t => t.checklistAnswer != null).length;
  const yesCount  = ynItems.filter(t => t.checklistAnswer === 'yes').length;
  const noNaCount = ynItems.filter(t => t.checklistAnswer === 'no' || t.checklistAnswer === 'na').length;
  const totalQuestions = ynItems.length;

  const isReadyToSubmit = useCallback((children) => {
    const ci = children.filter(t => t.taskType === 'checklist');
    const si = children.filter(t => t.taskType !== 'checklist');
    const yn   = ci.filter(t => !t.requiresInput);
    const text = ci.filter(t => t.requiresInput);
    const allYnAnswered = yn.length === 0 || yn.every(t => t.checklistAnswer != null);
    const allTextFilled = text.length === 0 || text.every(t => t.checklistNote?.trim());
    const allSiDone     = si.length === 0   || si.every(t => t.status === 'Done');
    return allYnAnswered && allTextFilled && allSiDone;
  }, []);

  const getPendingCount = (children) => {
    const ci = children.filter(t => t.taskType === 'checklist');
    const si = children.filter(t => t.taskType !== 'checklist');
    const yn   = ci.filter(t => !t.requiresInput);
    const text = ci.filter(t => t.requiresInput);
    return (
      yn.filter(t => t.checklistAnswer == null).length +
      text.filter(t => !t.checklistNote?.trim()).length +
      si.filter(t => t.status !== 'Done').length
    );
  };

  // No-op — kept for call sites; auto-complete is intentionally removed
  const checkAutoComplete = useCallback(() => {}, []);

  const handleAnswer = (task, answer) => {
    const updated = localChildren.map(t =>
      t.id === task.id ? { ...t, checklistAnswer: answer } : t
    );
    setLocalChildren(updated);
    onUpdateChildTask({ ...task, checklistAnswer: answer });

    checkAutoComplete(updated);
  };

  const handleNoteChange = (taskId, value) => {
    setNoteTexts(prev => ({ ...prev, [taskId]: value }));
  };

  const handleNoteBlur = (task) => {
    const note = noteTexts[task.id] || '';
    const updated = localChildren.map(t =>
      t.id === task.id ? { ...t, checklistNote: note } : t
    );
    setLocalChildren(updated);
    onUpdateChildTask({ ...task, checklistNote: note });
  };

  const handleStandardStatusChange = (task, newStatus) => {
    let timerUpdate = {};
    if (newStatus === 'Done' && (task.timerState === 'running' || task.timerState === 'paused')) {
      const elapsedMs = task.timerState === 'running' && task.timerStartedAt
        ? (task.elapsedMs || 0) + (Date.now() - task.timerStartedAt)
        : (task.elapsedMs || 0);
      timerUpdate = { timerState: 'stopped', timerStartedAt: null, elapsedMs, timeTaken: formatDuration(elapsedMs) };
    }
    const updated = localChildren.map(t =>
      t.id === task.id ? { ...t, status: newStatus, ...timerUpdate } : t
    );
    setLocalChildren(updated);
    onUpdateChildTask({ ...task, status: newStatus, ...timerUpdate });
    checkAutoComplete(updated);
  };

  const handleStartTimer = (task) => {
    const changes = { status: 'WIP', timerState: 'running', timerStartedAt: Date.now() };
    const updated = localChildren.map(t => t.id === task.id ? { ...t, ...changes } : t);
    setLocalChildren(updated);
    onUpdateChildTask({ ...task, ...changes });
    checkAutoComplete(updated);
  };

  const handlePauseTimer = (task) => {
    if (task.timerState !== 'running' || !task.timerStartedAt) return;
    const elapsedMs = (task.elapsedMs || 0) + (Date.now() - task.timerStartedAt);
    const changes = { timerState: 'paused', timerStartedAt: null, elapsedMs, timeTaken: formatDuration(elapsedMs) };
    const updated = localChildren.map(t => t.id === task.id ? { ...t, ...changes } : t);
    setLocalChildren(updated);
    onUpdateChildTask({ ...task, ...changes });
  };

  const handleStopTimer = (task) => {
    const elapsedMs = task.timerState === 'running' && task.timerStartedAt
      ? (task.elapsedMs || 0) + (Date.now() - task.timerStartedAt)
      : (task.elapsedMs || 0);
    const changes = { timerState: 'stopped', timerStartedAt: null, elapsedMs, timeTaken: formatDuration(elapsedMs) };
    const updated = localChildren.map(t => t.id === task.id ? { ...t, ...changes } : t);
    setLocalChildren(updated);
    onUpdateChildTask({ ...task, ...changes });
  };

  const getElapsedMs = (task) => {
    const base = task.elapsedMs || 0;
    if (task.timerState === 'running' && task.timerStartedAt) {
      return base + Math.max(0, timerTick - task.timerStartedAt);
    }
    return base;
  };

  const toggleCreateTask = (taskId, questionText) => {
    setCreateTaskOpen(prev => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      return next;
    });
    setCreateTaskForm(prev => {
      if (!prev[taskId]) {
        return { ...prev, [taskId]: { name: questionText || '', category: '', dueDate: new Date().toISOString().split('T')[0], comment: '' } };
      }
      return prev;
    });
  };

  const handleCreateTaskSubmit = (e, task) => {
    e.preventDefault();
    const form = createTaskForm[task.id] || {};
    if (!form.name?.trim()) return;
    if (onCreateTaskFromItem) {
      onCreateTaskFromItem({
        questionText: task.questionText || task.name,
        taskName: form.name.trim(),
        category: form.category || '',
        dueDate: form.dueDate || null,
        comment: form.comment?.trim() || '',
        clientId: group.clientId,
        clientName: group.clientName || '',
        assigneeId: group.assigneeId,
        assigneeName: group.assigneeName,
      });
    }
    setCreateTaskOpen(prev => ({ ...prev, [task.id]: false }));
    setCreateTaskForm(prev => ({ ...prev, [task.id]: { name: '', category: '', dueDate: '', comment: '' } }));
  };

  const cadenceBadge = group.repeatFrequency && group.repeatFrequency !== 'Once'
    ? CADENCE_COLORS[group.repeatFrequency] || 'bg-slate-100 text-slate-600'
    : null;

  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const isDone = group.status === 'done';

  return (
    <div className="fixed inset-0 z-[800] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative flex flex-col bg-white shadow-2xl w-full max-w-lg h-full overflow-hidden animate-in slide-in-from-right duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 leading-snug">{group.name}</h2>
                {isDone && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Done</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {group.clientName && (
                  <span className="text-[11px] font-semibold text-slate-600">{group.clientName}</span>
                )}
                {cadenceBadge && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cadenceBadge}`}>
                    {group.repeatFrequency}
                  </span>
                )}
                {group.date && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                    <Calendar size={9} /> {group.date}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onDeleteGroup && !confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                  title="Delete group"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {confirmDelete && (
            <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3">
              <Trash2 size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-[12px] font-semibold text-red-700 flex-1">Delete this group and all its items?</p>
              <button
                onClick={() => { onDeleteGroup(group); onClose(); }}
                className="text-[11px] font-bold px-3 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Summary bar */}
          {totalQuestions > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                <span>{answeredCount} / {totalQuestions} answered</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle size={11} /> {yesCount} Yes
                  </span>
                  <span className="flex items-center gap-1 text-red-500">
                    <XCircle size={11} /> {noNaCount} No/N/A
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-emerald-400"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">

          {/* Checklist items */}
          {checklistItems.length > 0 && (
            <div className="space-y-2">
              {checklistItems.map((task, idx) => {
                const currentAnswer = task.checklistAnswer;
                const hasNote = !!(noteTexts[task.id] ?? task.checklistNote)?.trim();

                return (
                  <div
                    key={task.id}
                    className={`rounded-xl border p-3 transition-all ${
                      task.requiresInput
                        ? hasNote
                          ? 'border-indigo-200 bg-indigo-50/40'
                          : 'border-amber-200 bg-amber-50/30'
                        : currentAnswer === 'yes' ? 'border-emerald-200 bg-emerald-50/50' :
                          currentAnswer === 'no'  ? 'border-red-200 bg-red-50/50' :
                          currentAnswer === 'na'  ? 'border-slate-200 bg-slate-50/50' :
                          'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-slate-800 leading-snug mb-2">
                          {task.questionText || task.name}
                        </p>

                        {task.requiresInput ? (
                          /* ── Text-input-only question (no yes/no/na) ── */
                          <div>
                            <textarea
                              value={noteTexts[task.id] ?? (task.checklistNote || '')}
                              onChange={e => handleNoteChange(task.id, e.target.value)}
                              onBlur={() => handleNoteBlur(task)}
                              placeholder={task.inputLabel || 'Write your note for management…'}
                              rows={3}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs resize-none outline-none focus:ring-2 ring-indigo-500/20 bg-white"
                            />
                            {!hasNote && (
                              <p className="text-[10px] font-semibold text-amber-600 mt-1">Required — please fill this in</p>
                            )}
                          </div>
                        ) : (
                          /* ── Yes / No / NA question ── */
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {Object.entries(ANSWER_CONFIG).map(([key, cfg]) => {
                              const isSelected = currentAnswer === key;
                              const Icon = cfg.icon;
                              return (
                                <button
                                  key={key}
                                  onClick={() => handleAnswer(task, key)}
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${
                                    isSelected
                                      ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                                      : `bg-white border-slate-200 text-slate-500 ${cfg.hover}`
                                  }`}
                                  title={cfg.label}
                                >
                                  <Icon size={12} />
                                  {cfg.label}
                                </button>
                              );
                            })}
                            <div className="ml-auto flex items-center gap-1.5">
                              {onCreateTaskFromItem && (
                                <button
                                  onClick={() => toggleCreateTask(task.id, task.questionText || task.name)}
                                  className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-all ${
                                    createTaskOpen[task.id]
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                                  }`}
                                  title="Create task from this item"
                                >
                                  <PlusCircle size={11} />
                                  Task
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {createTaskOpen[task.id] && (
                          <form
                            onSubmit={e => handleCreateTaskSubmit(e, task)}
                            className="mt-3 pt-3 border-t border-slate-100 space-y-2"
                            onClick={e => e.stopPropagation()}
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">New task from this item</p>
                            <input
                              type="text"
                              value={createTaskForm[task.id]?.name ?? ''}
                              onChange={e => setCreateTaskForm(prev => ({ ...prev, [task.id]: { ...prev[task.id], name: e.target.value } }))}
                              placeholder="Task name"
                              required
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 ring-indigo-500/20 bg-white"
                            />
                            <select
                              value={createTaskForm[task.id]?.category ?? ''}
                              onChange={e => setCreateTaskForm(prev => ({ ...prev, [task.id]: { ...prev[task.id], category: e.target.value } }))}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 ring-indigo-500/20 bg-white text-slate-600"
                            >
                              <option value="">Category (optional)</option>
                              {taskCategories.map(c => (
                                <option key={c.name || c} value={c.name || c}>{c.name || c}</option>
                              ))}
                            </select>
                            <input
                              type="date"
                              value={createTaskForm[task.id]?.dueDate ?? ''}
                              onChange={e => setCreateTaskForm(prev => ({ ...prev, [task.id]: { ...prev[task.id], dueDate: e.target.value } }))}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 ring-indigo-500/20 bg-white text-slate-600"
                            />
                            <textarea
                              value={createTaskForm[task.id]?.comment ?? ''}
                              onChange={e => setCreateTaskForm(prev => ({ ...prev, [task.id]: { ...prev[task.id], comment: e.target.value } }))}
                              placeholder="Description (optional)"
                              rows={2}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs resize-none outline-none focus:ring-2 ring-indigo-500/20 bg-white"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="submit"
                                className="flex-1 bg-indigo-600 text-white text-[11px] font-bold py-1.5 rounded-lg hover:bg-indigo-700 transition-all"
                              >
                                Create Task
                              </button>
                              <button
                                type="button"
                                onClick={() => setCreateTaskOpen(prev => ({ ...prev, [task.id]: false }))}
                                className="px-3 py-1.5 border border-slate-200 text-slate-500 text-[11px] font-semibold rounded-lg hover:bg-slate-50 transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Standard task items inside group — full task-card UI matching HomeView */}
          {standardItems.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Standard Tasks</p>
              <div className="space-y-2">
                {standardItems.map(task => {
                  const elapsed = getElapsedMs(task);
                  const isRunning = task.timerState === 'running';
                  const isPaused = task.timerState === 'paused';
                  const showTimer = task.status !== 'Done';

                  return (
                    <div
                      key={task.id}
                      className={`bg-white rounded-xl border shadow-sm px-4 py-3 transition-all ${
                        isRunning ? 'border-blue-300 shadow-blue-100' : 'border-slate-100 hover:border-slate-200 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Status dot */}
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          task.status === 'Done' ? 'bg-emerald-400' :
                          task.status === 'WIP' ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]' : 'bg-orange-400'
                        }`} />

                        {/* Task name — clickable to open full detail panel */}
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => onOpenTask && onOpenTask(task)}
                        >
                          <p className="text-sm font-semibold text-slate-800 truncate">{task.name || task.comment}</p>
                          {task.name && task.comment && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{task.comment}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {task.category && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                                <Tag size={9} /> {task.category}
                              </span>
                            )}
                            {task.dueDate && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-500">
                                <Calendar size={9} /> {task.dueDate}
                              </span>
                            )}
                            {elapsed > 0 && (
                              <span className={`flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                                isRunning ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-500'
                              }`}>
                                <Clock size={9} /> {formatDuration(elapsed)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {/* Status dropdown */}
                          <select
                            className={`text-[10px] border-none rounded-md px-1.5 py-1 font-semibold outline-none cursor-pointer ${
                              task.status === 'Done' ? 'bg-emerald-100 text-emerald-700' :
                              task.status === 'WIP' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            }`}
                            value={task.status || 'Pending'}
                            onChange={e => handleStandardStatusChange(task, e.target.value)}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="Pending">Pending</option>
                            <option value="WIP">WIP</option>
                            <option value="Done">Done</option>
                          </select>

                          {/* Timer controls */}
                          {showTimer && (
                            <div className="flex items-center gap-1">
                              {(!task.timerState || task.timerState === 'idle' || task.timerState === 'stopped') && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleStartTimer(task); }}
                                  className="p-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all"
                                  title="Start timer"
                                >
                                  <Play size={11} />
                                </button>
                              )}
                              {isRunning && (
                                <>
                                  <button
                                    onClick={e => { e.stopPropagation(); handlePauseTimer(task); }}
                                    className="p-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all"
                                    title="Pause timer"
                                  >
                                    <Pause size={11} />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleStopTimer(task); }}
                                    className="p-1 rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all"
                                    title="Stop timer"
                                  >
                                    <Square size={11} />
                                  </button>
                                </>
                              )}
                              {isPaused && (
                                <>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleStartTimer(task); }}
                                    className="p-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all"
                                    title="Resume timer"
                                  >
                                    <Play size={11} />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleStopTimer(task); }}
                                    className="p-1 rounded border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all"
                                    title="Stop timer"
                                  >
                                    <Square size={11} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {localChildren.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Trash2 size={28} className="text-red-200 mb-3" />
              <p className="text-sm font-bold text-slate-500 mb-1">This group has no items</p>
              <p className="text-[11px] text-slate-400 mb-4">It was created from a template that had no questions at the time. You can delete it using the trash icon above.</p>
              {onDeleteGroup && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                >
                  <Trash2 size={13} /> Delete this group
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer — Submit / Done bar */}
        {localChildren.length > 0 && (
          <div className={`flex-shrink-0 border-t px-5 py-4 ${isDone ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100 bg-white'}`}>
            {isDone ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                  <p className="text-sm font-bold text-emerald-700">Checklist submitted — group is done!</p>
                </div>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
                >
                  Close
                </button>
              </div>
            ) : (() => {
              const ready = isReadyToSubmit(localChildren);
              const pending = getPendingCount(localChildren);
              return (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {ready
                      ? 'All items filled in — ready to submit.'
                      : `${pending} item${pending !== 1 ? 's' : ''} still need${pending === 1 ? 's' : ''} to be answered.`}
                  </p>
                  <button
                    onClick={() => {
                      if (!ready) return;
                      onUpdateGroup({ ...group, status: 'done' });
                    }}
                    disabled={!ready}
                    className={`flex-shrink-0 px-5 py-2 text-sm font-bold rounded-xl transition-all shadow-sm ${
                      ready
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Save & Submit
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChecklistGroupDetailPanel;
