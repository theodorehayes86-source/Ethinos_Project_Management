import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Users, ChevronRight, ChevronLeft, Plus, X, Search, Star, ArrowUp, ArrowDown, Filter, CalendarClock, CalendarCheck2, CalendarX2, AlertTriangle, BarChart2, ClipboardCheck, Clock, Link2, Link2Off, MessageSquare, CheckCircle, LayoutTemplate } from 'lucide-react';
import { format, isBefore, isAfter, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse, addDays, differenceInCalendarDays } from 'date-fns';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import TaskDetailPanel from './TaskDetailPanel';
import ChecklistGroupDetailPanel from './ChecklistGroupDetailPanel';
import { sendNotification } from '../utils/notify';
import { formatOrdinal, generateRecurringDates, WEEKDAY_FULL, WEEK_ORDINALS } from '../utils/recurrence';
import DueDateInput from './DueDateInput';
import { getUserLeaveStatus, getUserLeaveData, getUserLeaveAndHolidayData, checkLeaveConflict, toDateKey, isFullDayLeaveOrHoliday, getUpcomingHolidays, getTodayAttendanceMap } from '../utils/leaveConflict';
import LeaveConflictModal from './LeaveConflictModal';
import TeamsChatModal from './TeamsChatModal';
import { getDirectReports, TEAM_ADMIN_ROLES } from './shared/reportingTree';

const DEFAULT_STANDARD_TRACK = ['Director', 'Snr Manager', 'Manager', 'Asst Manager', 'Snr Executive', 'Executive', 'Employee', 'Intern'];
const CS_REPORT_ROLES = new Set(['CSM', 'Project Manager', 'PM/CSM']);
const REPEAT_OPTIONS = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Yearly', 'One-time'];

const STATUS_COLORS = {
  Done: 'bg-emerald-100 text-emerald-700',
  WIP: 'bg-blue-100 text-blue-700',
  Pending: 'bg-orange-100 text-orange-700',
};

const fmtMs = (ms) => {
  if (!ms || ms <= 0) return '—';
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const LiveElapsed = React.memo(function LiveElapsed({ startedAt, elapsedMs }) {
  const [tick, setTick] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{fmtMs(elapsedMs + Math.max(0, tick - startedAt))}</>;
});

const getElapsed = (task, now = Date.now()) => {
  let ms = task.elapsedMs || 0;
  if (task.timerState === 'running' && task.timerStartedAt) ms += now - task.timerStartedAt;
  return ms;
};

const parseDueDate = (str) => {
  if (!str) return null;
  try { return parse(str, 'do MMM yyyy', new Date()); } catch { return null; }
};

const parseTimestamp = (val) => {
  if (!val) return null;
  try {
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string') {
      const asNum = Number(val);
      if (!isNaN(asNum) && val.length > 8) return new Date(asNum);
      const iso = new Date(val);
      if (!isNaN(iso.getTime())) return iso;
      return parseDueDate(val);
    }
    return null;
  } catch { return null; }
};

const initials = (name) => {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
};

const avatarColor = (name) => {
  const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500'];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getLevelsToShow = (parentRole, effectiveHierarchyOrder) => {
  const idx = effectiveHierarchyOrder.indexOf(parentRole);
  if (idx < 0) return effectiveHierarchyOrder;
  return effectiveHierarchyOrder.slice(idx + 1);
};

const AddTaskModal = ({ prefilledAssignee, clients, syntheticClients, taskCategories, currentUser, clientLogs, setClientLogs, persistTaskCreate = null, taskTemplates = [], onClose }) => {
  const allClients = [...(clients || []), ...(syntheticClients || [])];
  const [mode, setMode] = useState('manual'); // 'manual' | 'template'
  const [selectedClientId, setSelectedClientId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskComment, setTaskComment] = useState('');
  const [taskCategory, setTaskCategory] = useState('');
  const [taskDate] = useState(new Date());
  const [taskDueDate, setTaskDueDate] = useState(null);
  const [taskBillable, setTaskBillable] = useState(true);
  const [taskRepeat, setTaskRepeat] = useState('Once');
  const [taskRepeatEnd, setTaskRepeatEnd] = useState(null);
  const [repeatMonthlyMode, setRepeatMonthlyMode] = useState('nth-weekday'); // 'nth-weekday' | 'specific-date'
  const [repeatMonthlyWeek, setRepeatMonthlyWeek] = useState(1);
  const [repeatMonthlyDay, setRepeatMonthlyDay] = useState(0);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState('');
  const [repeatWeekendRule, setRepeatWeekendRule] = useState('none');
  const [estimatedHrs, setEstimatedHrs] = useState('');
  const [estimatedMins, setEstimatedMins] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [leaveConflict, setLeaveConflict] = useState(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const acknowledgedLeaveRef = useRef(null);

  // Template picker state
  const [templateFilter, setTemplateFilter] = useState('All');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState('');

  // Templates filtered to the assignee's role
  const assigneeRoleTemplates = useMemo(() => {
    return (taskTemplates || []).filter(t => {
      if (!t.isHomeTemplate) return false;
      if (!t.targetRoles || t.targetRoles.length === 0) return true;
      return t.targetRoles.includes(prefilledAssignee?.role);
    });
  }, [taskTemplates, prefilledAssignee?.role]);

  const filteredTemplates = useMemo(() => {
    if (templateFilter === 'All') return assigneeRoleTemplates;
    return assigneeRoleTemplates.filter(t =>
      (t.tasks || []).some(task => task.repeatFrequency === templateFilter)
    );
  }, [assigneeRoleTemplates, templateFilter]);

  const handleApplyTemplate = async () => {
    const tpl = assigneeRoleTemplates.find(t => t.id === selectedTemplateId);
    if (!tpl || !persistTaskCreate) { setTemplateError('Template not found or creation service unavailable.'); return; }
    setSubmittingTemplate(true);
    setTemplateError('');
    const today = format(new Date(), 'do MMM yyyy');
    try {
      for (const taskItem of (tpl.tasks || [])) {
        await persistTaskCreate('__ethinos__', {
          name: taskItem.name || taskItem.comment,
          comment: taskItem.comment || '',
          date: today,
          dueDate: null,
          status: 'Pending',
          assigneeId: prefilledAssignee?.id || null,
          assigneeName: prefilledAssignee?.name || null,
          creatorId: currentUser?.id || null,
          creatorName: currentUser?.name || 'Unassigned',
          creatorRole: currentUser?.role || '',
          category: taskItem.category || 'Other',
          repeatFrequency: taskItem.repeatFrequency || 'Once',
          billable: false,
          departments: prefilledAssignee?.department ? [prefilledAssignee.department] : null,
          timerState: 'idle', timerStartedAt: null, elapsedMs: 0, timeTaken: null,
          result: '',
          qcEnabled: false, qcAssigneeId: null, qcAssigneeName: null,
          qcStatus: null, qcRating: null, qcFeedback: null, qcReviewedAt: null,
        });
      }
      onClose();
    } catch (err) {
      console.error('[PMT] Template apply failed:', err);
      setTemplateError('Could not save tasks — check your connection and try again.');
    } finally {
      setSubmittingTemplate(false);
    }
  };

  useEffect(() => {
    const id = prefilledAssignee?.id ? String(prefilledAssignee.id) : null;
    if (!id || !taskDueDate) { setLeaveConflict(null); setLeaveModalOpen(false); return; }
    const dateKey = toDateKey(taskDueDate);
    if (!dateKey) return;
    const comboKey = `${id}__${dateKey}`;
    let cancelled = false;
    checkLeaveConflict(id, taskDueDate).then(conflict => {
      if (!cancelled) {
        setLeaveConflict(conflict);
        if (conflict && acknowledgedLeaveRef.current !== comboKey) {
          setLeaveModalOpen(true);
        }
      }
    });
    return () => { cancelled = true; };
  }, [prefilledAssignee?.id, taskDueDate]);

  const filteredClients = allClients.filter(c => !clientSearch.trim() || (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()));
  const selectedClient = allClients.find(c => String(c.id) === String(selectedClientId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientId || !taskName.trim() || !taskCategory || !taskComment.trim()) {
      setError('Client, name, category and description are required.'); return;
    }
    if (taskRepeat === 'Monthly' && repeatMonthlyMode === 'specific-date' && !repeatDayOfMonth) {
      setError('Please enter a day of month (1–28) for the Specific date monthly schedule.'); return;
    }
    const supportsRecurrence = ['Daily', 'Weekly', 'Monthly'].includes(taskRepeat);
    if (supportsRecurrence && taskRepeatEnd && isBefore(taskRepeatEnd, taskDate)) {
      setError('Repeat end date must be on or after the task start date.'); return;
    }
    const estHrs = parseInt(estimatedHrs || '0', 10) || 0;
    const estMins = parseInt(estimatedMins || '0', 10) || 0;
    const estimatedMs = (estHrs * 60 + estMins) > 0 ? (estHrs * 3600000 + estMins * 60000) : null;
    const baseTaskData = {
      name: taskName.trim(),
      date: format(taskDate, 'do MMM yyyy'),
      comment: taskComment.trim(),
      result: '',
      status: 'Pending',
      assigneeId: prefilledAssignee?.id || null,
      assigneeName: prefilledAssignee?.name || null,
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || '',
      category: taskCategory,
      repeatFrequency: taskRepeat,
      repeatEnd: supportsRecurrence && taskRepeatEnd ? format(taskRepeatEnd, 'do MMM yyyy') : null,
      repeatDays: taskRepeat === 'Weekly' ? [0, 1, 2, 3, 4] : null,
      repeatMonthlyWeek: (taskRepeat === 'Monthly' && repeatMonthlyMode === 'nth-weekday') ? repeatMonthlyWeek : null,
      repeatMonthlyDay: (taskRepeat === 'Monthly' && repeatMonthlyMode === 'nth-weekday') ? repeatMonthlyDay : null,
      repeatDayOfMonth: (taskRepeat === 'Monthly' && repeatMonthlyMode === 'specific-date' && repeatDayOfMonth) ? parseInt(repeatDayOfMonth, 10) : null,
      repeatWeekendRule: (taskRepeat === 'Monthly' && repeatMonthlyMode === 'specific-date' && repeatDayOfMonth) ? repeatWeekendRule : null,
      dueDate: taskDueDate ? format(taskDueDate, 'do MMM yyyy') : null,
      timerState: 'idle', timerStartedAt: null, elapsedMs: 0, timeTaken: null,
      qcEnabled: false, qcAssigneeId: null, qcAssigneeName: null, qcStatus: null, qcRating: null, qcFeedback: null, qcReviewedAt: null,
      departments: prefilledAssignee?.department ? [prefilledAssignee.department] : null,
      billable: selectedClientId === '__ethinos__' ? false : taskBillable,
      estimatedMs,
    };
    setSubmitting(true);
    setError('');
    try {
      // Multi-occurrence path: generate and persist every occurrence through
      // persistTaskCreate so each gets a stable Firebase push-key (P5).
      // setClientLogs is NOT used here — it may only update React state and
      // would bypass the push-key assignment that persistTaskCreate provides.
      if (supportsRecurrence && taskRepeatEnd) {
        if (!persistTaskCreate) {
          // Must not fall back silently — the user asked for recurrence.
          setError('Task creation service is unavailable — cannot create recurring tasks.');
          setSubmitting(false);
          return;
        }
        const dates = generateRecurringDates(
          taskDate, taskRepeatEnd, taskRepeat,
          [0, 1, 2, 3, 4],
          repeatMonthlyMode === 'nth-weekday' ? repeatMonthlyWeek : null,
          repeatMonthlyMode === 'nth-weekday' ? repeatMonthlyDay : null,
          repeatMonthlyMode === 'specific-date' ? repeatDayOfMonth : null,
          repeatMonthlyMode === 'specific-date' ? repeatWeekendRule : null
        );
        if (dates.length === 0) {
          setError('No valid dates found for this repeat schedule. Try extending the end date.');
          setSubmitting(false);
          return;
        }
        const dueDateOffsetDays = taskDueDate ? differenceInCalendarDays(taskDueDate, taskDate) : null;
        const repeatGroupId = `rg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        for (const dt of dates) {
          await persistTaskCreate(selectedClientId, {
            ...baseTaskData,
            date: format(dt, 'do MMM yyyy'),
            dueDate: dueDateOffsetDays !== null ? format(addDays(dt, dueDateOffsetDays), 'do MMM yyyy') : null,
            repeatGroupId,
          });
        }
      } else {
        // Single task — use the stable push-key creator
        if (persistTaskCreate) {
          await persistTaskCreate(selectedClientId, baseTaskData);
        } else {
          // P5: persistTaskCreate is required — throw rather than fall back to
          // a temporary Date.now() id that would bypass the stable push-key system.
          throw new Error('Task creation service is unavailable');
        }
      }
      // Notify the assignee by email — skip if creator is assigning to themselves
      if (prefilledAssignee?.email && String(prefilledAssignee.id) !== String(currentUser?.id)) {
        sendNotification('task-assigned', {
          assigneeEmail: prefilledAssignee.email,
          assigneeName: prefilledAssignee.name,
          taskName: taskName.trim(),
          taskDescription: taskComment.trim(),
          clientName: selectedClient?.name || '',
          dueDate: taskDueDate ? format(taskDueDate, 'do MMM yyyy') : null,
          creatorName: currentUser?.name,
          steps: [],
        });
      }
      onClose();
    } catch (err) {
      console.error('[PMT] Failed to create task:', err);
      setError('Could not save task — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">Add Task</h3>
            {prefilledAssignee && <p className="text-xs text-slate-500 mt-0.5">For <span className="font-semibold text-indigo-600">{prefilledAssignee.name}</span></p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18}/></button>
        </div>

        {/* Mode toggle */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {[['manual', 'Manual Task'], ['template', 'From Template']].map(([m, label]) => (
              <button
                key={m} type="button"
                onClick={() => { setMode(m); setError(''); setTemplateError(''); setSelectedTemplateId(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'template' && <LayoutTemplate size={11} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Template picker */}
        {mode === 'template' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-6 pt-3 pb-2 flex-shrink-0">
              <div className="flex gap-1 bg-slate-50 rounded-lg border border-slate-200 p-0.5">
                {['All', 'Daily', 'Weekly', 'Monthly'].map(f => (
                  <button key={f} type="button"
                    onClick={() => { setTemplateFilter(f); setSelectedTemplateId(null); }}
                    className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-all ${templateFilter === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                  >{f}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-3 space-y-2">
              {filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <LayoutTemplate size={28} className="text-slate-200 mb-2" />
                  {assigneeRoleTemplates.length === 0 ? (
                    <>
                      <p className="text-xs font-semibold text-slate-500">No templates for {prefilledAssignee?.role || 'this role'}</p>
                      <p className="text-[11px] text-slate-400 mt-1">Create role templates in the Control Centre and assign them to the <strong>{prefilledAssignee?.role}</strong> role.</p>
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-slate-500">No templates for this frequency — try All.</p>
                  )}
                </div>
              ) : filteredTemplates.map(tpl => {
                const isSelected = selectedTemplateId === tpl.id;
                const tasksToShow = templateFilter === 'All' ? (tpl.tasks || []) : (tpl.tasks || []).filter(t => t.repeatFrequency === templateFilter);
                return (
                  <div key={tpl.id}
                    onClick={() => setSelectedTemplateId(isSelected ? null : tpl.id)}
                    className={`border rounded-xl p-3 cursor-pointer transition-all ${isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{tpl.name}</p>
                        {tpl.description && <p className="text-[10px] text-slate-500 mt-0.5">{tpl.description}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{tasksToShow.length} task{tasksToShow.length !== 1 ? 's' : ''}</span>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                          {isSelected && <CheckCircle size={10} className="text-white" />}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {tasksToShow.map((task, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 bg-white border border-slate-100 rounded-lg px-2.5 py-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-indigo-100 text-indigo-600 text-[8px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-slate-800 leading-snug">{task.name || task.comment}</p>
                            {task.category && <span className="text-[9px] text-slate-400">{task.category}</span>}
                          </div>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            task.repeatFrequency === 'Daily' ? 'bg-emerald-100 text-emerald-700' :
                            task.repeatFrequency === 'Weekly' ? 'bg-blue-100 text-blue-700' :
                            task.repeatFrequency === 'Monthly' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                          }`}>{task.repeatFrequency || 'Once'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {templateError && <p className="mx-6 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex-shrink-0">{templateError}</p>}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button type="button" onClick={onClose} className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">Cancel</button>
              <button
                type="button"
                disabled={!selectedTemplateId || submittingTemplate}
                onClick={handleApplyTemplate}
                className="flex-1 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <LayoutTemplate size={11} />
                {submittingTemplate ? 'Applying…' : `Apply Template${selectedTemplateId ? ` (${(assigneeRoleTemplates.find(t => t.id === selectedTemplateId)?.tasks || []).length} tasks)` : ''}`}
              </button>
            </div>
          </div>
        )}

        {mode === 'manual' && (
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Client *</label>
            <div className="relative mb-1"><Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Search clients…" className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20"/></div>
            <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto">
              {filteredClients.map(c => (<button key={c.id} type="button" onClick={() => { setSelectedClientId(c.id); setClientSearch(''); }} className={`w-full text-left px-3 py-2 text-xs transition-colors ${String(selectedClientId) === String(c.id) ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-700'}`}>{c.name}</button>))}
              {filteredClients.length === 0 && <p className="text-xs text-slate-400 px-3 py-2 text-center">No clients found</p>}
            </div>
          </div>
          <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Task Name *</label><input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="Task name…" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20"/></div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Category *</label>
              <select value={taskCategory} onChange={e => setTaskCategory(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20">
                <option value="">Select…</option>
                {(taskCategories || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Repeat</label>
              {/* Only expose frequencies that generateRecurringDates supports.
                  Fortnightly/Quarterly/Yearly/One-time are not implemented in the
                  recurrence utility and would silently save a single task. */}
              <select value={taskRepeat} onChange={e => { const v = e.target.value; setTaskRepeat(v); setRepeatDayOfMonth(''); setRepeatWeekendRule('none'); setRepeatMonthlyMode('nth-weekday'); setRepeatMonthlyWeek(1); setRepeatMonthlyDay(0); if (v === 'Once') setTaskRepeatEnd(null); }} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20">
                <option value="Once">Once</option>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
          </div>
          {taskRepeat === 'Monthly' && (
            <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Monthly schedule</p>
              {/* Mode toggle */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-semibold">
                {[['nth-weekday', 'Nth weekday'], ['specific-date', 'Specific date']].map(([mode, label]) => (
                  <button key={mode} type="button"
                    onClick={() => setRepeatMonthlyMode(mode)}
                    className={`flex-1 py-1.5 transition-all ${repeatMonthlyMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >{label}</button>
                ))}
              </div>
              {repeatMonthlyMode === 'nth-weekday' ? (
                <>
                  <div className="flex items-center gap-2">
                    <select value={repeatMonthlyWeek} onChange={e => setRepeatMonthlyWeek(Number(e.target.value))}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none focus:ring-2 ring-blue-500/20">
                      {WEEK_ORDINALS.map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
                    </select>
                    <select value={repeatMonthlyDay} onChange={e => setRepeatMonthlyDay(Number(e.target.value))}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none focus:ring-2 ring-blue-500/20">
                      {WEEKDAY_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                  <p className="text-[10px] text-blue-600 font-medium">
                    {WEEK_ORDINALS[repeatMonthlyWeek - 1]} {WEEKDAY_FULL[repeatMonthlyDay]} of each month
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Day of month</label>
                    <input
                      type="number" min="1" max="28"
                      value={repeatDayOfMonth}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '' || (parseInt(v, 10) >= 1 && parseInt(v, 10) <= 28)) setRepeatDayOfMonth(v);
                      }}
                      placeholder="e.g. 5"
                      className="w-20 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20"
                    />
                    <span className="text-xs text-slate-400">of every month</span>
                  </div>
                  {repeatDayOfMonth && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">If weekend</label>
                      <select value={repeatWeekendRule} onChange={e => setRepeatWeekendRule(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20">
                        <option value="none">Keep date as-is</option>
                        <option value="prev-friday">Move to previous Friday</option>
                        <option value="next-monday">Move to next Monday</option>
                      </select>
                    </div>
                  )}
                  {repeatDayOfMonth && (
                    <p className="text-[10px] text-blue-600 font-medium">
                      Repeats on the {formatOrdinal(parseInt(repeatDayOfMonth,10))} of each month
                      {repeatWeekendRule !== 'none' ? ` · ${repeatWeekendRule === 'prev-friday' ? 'moves to Friday if weekend' : 'moves to Monday if weekend'}` : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {['Daily', 'Weekly', 'Monthly'].includes(taskRepeat) && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 block">Repeat End Date <span className="font-normal text-slate-400">(optional — omit to save one task)</span></label>
              <DatePicker
                selected={taskRepeatEnd}
                onChange={date => setTaskRepeatEnd(date)}
                minDate={taskDate}
                placeholderText="No end date"
                dateFormat="dd MMM yyyy"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20"
              />
              {taskRepeatEnd && (() => {
                const count = generateRecurringDates(
                  taskDate, taskRepeatEnd, taskRepeat,
                  [0, 1, 2, 3, 4],
                  repeatMonthlyMode === 'nth-weekday' ? repeatMonthlyWeek : null,
                  repeatMonthlyMode === 'nth-weekday' ? repeatMonthlyDay : null,
                  repeatMonthlyMode === 'specific-date' ? repeatDayOfMonth : null,
                  repeatMonthlyMode === 'specific-date' ? repeatWeekendRule : null
                ).length;
                return count > 0
                  ? <p className="text-[10px] text-blue-600 font-medium">{count} task{count !== 1 ? 's' : ''} will be created</p>
                  : <p className="text-[10px] text-red-500 font-medium">No dates in this range — try extending the end date.</p>;
              })()}
              {taskRepeatEnd && (
                <button type="button" onClick={() => setTaskRepeatEnd(null)} className="text-xs font-semibold text-red-600 hover:text-red-700">Clear end date</button>
              )}
            </div>
          )}
          <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Description *</label><textarea value={taskComment} onChange={e => setTaskComment(e.target.value)} rows={3} placeholder="Describe the task…" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20 resize-none"/></div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Due Date</label>
            <DueDateInput
              startDate={taskDate}
              value={taskDueDate}
              onChange={setTaskDueDate}
              minDate={taskDate}
            />
            {taskDueDate && (
              <button type="button" onClick={() => setTaskDueDate(null)} className="mt-1 text-xs font-semibold text-red-600 hover:text-red-700">
                Clear Due Date
              </button>
            )}
            {leaveConflict && taskDueDate && (() => {
              const t = leaveConflict.type;
              const isHard = t === 'full-leave' || t === 'holiday';
              const isPending = t === 'pending-leave';
              const bg = isHard ? 'bg-red-50 border-red-200 text-red-700' : isPending ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700';
              const label = t === 'holiday' ? `Public holiday: ${leaveConflict.holidayName || 'Holiday'}` : t === 'full-leave' ? `${prefilledAssignee?.name || 'Assignee'} is on full-day leave` : t === 'half-leave' ? `${prefilledAssignee?.name || 'Assignee'} is on half-day leave (${leaveConflict.session})` : `${prefilledAssignee?.name || 'Assignee'} has a pending leave request`;
              return (
                <div className={`mt-1.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${bg}`}>
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{label}</span>
                </div>
              );
            })()}
          </div>
          <div className="flex gap-3">
            <div className="flex-1"><label className="text-xs font-semibold text-slate-600 mb-1 block">Est. Hours</label><input type="number" min="0" value={estimatedHrs} onChange={e => setEstimatedHrs(e.target.value)} placeholder="0" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20"/></div>
            <div className="flex-1"><label className="text-xs font-semibold text-slate-600 mb-1 block">Est. Mins</label><input type="number" min="0" max="59" value={estimatedMins} onChange={e => setEstimatedMins(e.target.value)} placeholder="0" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20"/></div>
          </div>
          {selectedClient && !selectedClient.synthetic && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setTaskBillable(b => !b)} className={`w-9 h-5 rounded-full flex items-center transition-colors ${taskBillable ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${taskBillable ? 'translate-x-4' : 'translate-x-0.5'}`}/></button>
              <span className="text-xs text-slate-600 font-medium">Billable</span>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed">{submitting ? 'Saving…' : 'Add Task'}</button>
          </div>
        </form>
        )}
      </div>

      {leaveConflict && leaveModalOpen && (
        <LeaveConflictModal
          conflict={leaveConflict}
          userName={prefilledAssignee?.name || 'Assignee'}
          onProceed={() => {
            const id = prefilledAssignee?.id ? String(prefilledAssignee.id) : null;
            const dateKey = toDateKey(taskDueDate);
            acknowledgedLeaveRef.current = `${id}__${dateKey}`;
            setLeaveModalOpen(false);
          }}
          onCancel={() => {
            setLeaveConflict(null);
            setLeaveModalOpen(false);
            setTaskDueDate(null);
          }}
        />
      )}
    </div>
  );
};

// Enrich a checklist group with computed stats from clientLogs child tasks.
// Returns the group extended with _childTasks, _totalQuestions, _ynTotal, _answered, _yesCount, _noCount, _effectiveStatus, _groupDate.
// Progress = _answered / _totalQuestions (covers both yes/no and text questions).
// Yes/No counts remain separate for display.
const enrichChecklistGroup = (group, clientLogs) => {
  const clientTasks = clientLogs[group.clientId] || [];
  // #5 — normalize both sides to string so Firebase string/number differences don't break grouping
  const childTasks = clientTasks.filter(t => String(t.taskGroupId) === String(group.id));
  const ynTasks = childTasks.filter(t => t.taskType === 'checklist' && !t.requiresInput);
  const textTasks = childTasks.filter(t => t.taskType === 'checklist' && t.requiresInput);
  const ynAnswered = ynTasks.filter(t => t.checklistAnswer != null);
  const textAnswered = textTasks.filter(t => t.checklistNote?.trim());
  const yesCount = ynAnswered.filter(t => t.checklistAnswer === 'yes').length;
  const noCount = ynAnswered.filter(t => t.checklistAnswer === 'no').length;
  const ynTotal = ynTasks.length;
  // #1 — totalQuestions includes both yes/no AND text questions; progress = answered / totalQuestions
  const totalQuestions = ynTotal + textTasks.length;
  // #12 — clamp to avoid > 100%
  const answered = totalQuestions > 0 ? Math.min(ynAnswered.length + textAnswered.length, totalQuestions) : 0;
  // #6 — robust date parsing: prefer ISO (YYYY-MM-DD), then 'do MMM yyyy', then 'd MMM yyyy', then fallback
  let groupDate = null;
  if (group.date) {
    const isoMatch = String(group.date).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      groupDate = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    } else {
      try { groupDate = parse(group.date, 'do MMM yyyy', new Date()); } catch {}
      if (!groupDate || isNaN(groupDate.getTime())) {
        try { groupDate = parse(group.date, 'd MMM yyyy', new Date()); } catch {}
      }
      if (!groupDate || isNaN(groupDate.getTime())) {
        const d2 = new Date(group.date);
        groupDate = isNaN(d2.getTime()) ? null : d2;
      }
    }
    if (groupDate && !isNaN(groupDate.getTime())) {
      groupDate = new Date(groupDate.getFullYear(), groupDate.getMonth(), groupDate.getDate());
    } else {
      groupDate = null;
    }
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // #4 — normalize status to lowercase before comparison
  const normalizedStatus = (group.status ?? '').toString().toLowerCase();
  const isDone = normalizedStatus === 'done';
  const isOverdue = !isDone && groupDate != null && groupDate < today;
  const effectiveStatus = isDone ? 'done' : isOverdue ? 'overdue' : 'pending';
  return { ...group, _childTasks: childTasks, _totalQuestions: totalQuestions, _ynTotal: ynTotal, _answered: answered, _yesCount: yesCount, _noCount: noCount, _effectiveStatus: effectiveStatus, _groupDate: groupDate };
};

const CHECKLIST_CADENCE_COLORS = {
  Daily:   'bg-rose-100 text-rose-700',
  Weekly:  'bg-amber-100 text-amber-700',
  Monthly: 'bg-blue-100 text-blue-700',
  Once:    'bg-slate-100 text-slate-600',
};

const MemberStats = ({ member, allMemberTasks, clients, syntheticClients, users, currentUser, clientLogs, setClientLogs, taskCategories, taskGroups = [], persistTaskCreate = null, taskTemplates = [] }) => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const [memberLeaveByDate, setMemberLeaveByDate] = useState({});
  const [leaveOpen, setLeaveOpen] = useState(true);
  // Checklists tab state
  const [checklistCadenceFilter, setChecklistCadenceFilter] = useState('All');
  const [checklistClientFilter, setChecklistClientFilter] = useState('all');
  const [checklistStatusFilter, setChecklistStatusFilter] = useState('all');
  const [selectedChecklistGroupId, setSelectedChecklistGroupId] = useState(null);

  const memberTasksRef = useRef(null);
  const scrollToTasks = (filter) => {
    if (filter) setStatusFilter(filter);
    setTimeout(() => memberTasksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    getUserLeaveAndHolidayData(String(member.id)).then(data => {
      if (!cancelled) setMemberLeaveByDate(data);
    });
    return () => { cancelled = true; };
  }, [member?.id]);

  // Group leave records into distinct requests (by leaveId), today + future only
  const todayKey = toDateKey(new Date());
  const leaveGroups = useMemo(() => {
    const groups = {};
    Object.entries(memberLeaveByDate).forEach(([dk, rec]) => {
      if (!rec || rec.isHoliday) return;
      if (dk < todayKey) return; // skip past leave
      const gKey = rec.leaveId || dk;
      if (!groups[gKey]) {
        groups[gKey] = {
          id: gKey,
          startDate: rec.startDate || dk,
          endDate: rec.endDate || dk,
          leaveType: rec.leaveType || 'Leave',
          status: rec.status || 'pending',
          isToday: dk === todayKey,
          session: rec.session,
        };
      }
      // extend range in case dates span multiple keys
      if (dk < groups[gKey].startDate) groups[gKey].startDate = dk;
      if (dk > groups[gKey].endDate) groups[gKey].endDate = dk;
      if (dk === todayKey) groups[gKey].isToday = true;
    });
    return Object.values(groups).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [memberLeaveByDate, todayKey]);

  const tasks = useMemo(() => {
    let list = allMemberTasks.filter(t => !t.archived);
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter);
    if (clientFilter !== 'all') list = list.filter(t => String(t.cid) === String(clientFilter));
    if (dateRange === 'week') {
      const wS = startOfWeek(new Date(), { weekStartsOn: 1 }), wE = endOfWeek(new Date(), { weekStartsOn: 1 });
      list = list.filter(t => { const d = parseDueDate(t.dueDate || t.date); return d && !isBefore(d, wS) && !isAfter(d, wE); });
    } else if (dateRange === 'month') {
      const mS = startOfMonth(new Date()), mE = endOfMonth(new Date());
      list = list.filter(t => { const d = parseDueDate(t.dueDate || t.date); return d && !isBefore(d, mS) && !isAfter(d, mE); });
    }
    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase();
      list = list.filter(t => (t.name || '').toLowerCase().includes(q) || (t.cName || '').toLowerCase().includes(q));
    }
    return list;
  }, [allMemberTasks, statusFilter, clientFilter, dateRange, taskSearch]);

  const stats = useMemo(() => {
    const base = allMemberTasks.filter(t => !t.archived);
    const done = base.filter(t => t.status === 'Done'), wip = base.filter(t => t.status === 'WIP'), pending = base.filter(t => t.status === 'Pending');
    const overdue = base.filter(t => {
      if (t.status === 'Done') return false;
      const d = parseDueDate(t.dueDate);
      if (!d || !isBefore(d, new Date())) return false;
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      if (isFullDayLeaveOrHoliday(memberLeaveByDate[`${y}-${m}-${day}`])) return false;
      return true;
    });
    const rated = done.filter(t => t.qcRating);
    const avgQc = rated.length > 0 ? (rated.reduce((s, t) => s + t.qcRating, 0) / rated.length).toFixed(1) : null;
    const snapNow = Date.now();
    let billableMs = 0, nonBillableMs = 0, aboveEst = 0, belowEst = 0;
    base.forEach(t => {
      const ms = getElapsed(t, snapNow);
      if (t.billable !== false) billableMs += ms; else nonBillableMs += ms;
      if (t.estimatedMs) { if (ms > t.estimatedMs) aboveEst++; else belowEst++; }
    });
    return { total: base.length, done: done.length, wip: wip.length, pending: pending.length, overdue: overdue.length, avgQc, billableMs, nonBillableMs, aboveEst, belowEst };
  }, [allMemberTasks, memberLeaveByDate]);

  const clientHourSplit = useMemo(() => {
    const snapNow = Date.now();
    const map = {};
    allMemberTasks.filter(t => !t.archived).forEach(t => {
      const ms = getElapsed(t, snapNow);
      if (!map[t.cid]) map[t.cid] = { name: t.cName || t.cid, ms: 0, count: 0 };
      map[t.cid].ms += ms; map[t.cid].count++;
    });
    return Object.values(map).sort((a, b) => b.ms - a.ms);
  }, [allMemberTasks]);

  const uniqueClients = useMemo(() => {
    const seen = {};
    allMemberTasks.forEach(t => { if (!seen[t.cid]) seen[t.cid] = t.cName || t.cid; });
    return Object.entries(seen).map(([id, name]) => ({ id, name }));
  }, [allMemberTasks]);

  // Checklist groups for this member, enriched with child-task stats
  const memberChecklistGroups = useMemo(() => {
    return taskGroups
      .filter(g => !g.archived && String(g.assigneeId) === String(member.id))
      .map(g => enrichChecklistGroup(g, clientLogs));
  }, [taskGroups, member.id, clientLogs]);

  const filteredChecklistGroups = useMemo(() => {
    let list = memberChecklistGroups;
    if (checklistCadenceFilter !== 'All') list = list.filter(g => (g.repeatFrequency || 'Once') === checklistCadenceFilter);
    if (checklistClientFilter !== 'all') list = list.filter(g => String(g.clientId) === String(checklistClientFilter));
    if (checklistStatusFilter !== 'all') list = list.filter(g => g._effectiveStatus === checklistStatusFilter);
    return list.sort((a, b) => {
      // Sort: overdue first, then pending, then done
      const order = { overdue: 0, pending: 1, done: 2 };
      return (order[a._effectiveStatus] ?? 1) - (order[b._effectiveStatus] ?? 1);
    });
  }, [memberChecklistGroups, checklistCadenceFilter, checklistClientFilter, checklistStatusFilter]);

  const checklistUniqueClients = useMemo(() => {
    const seen = {};
    memberChecklistGroups.forEach(g => { if (g.clientId && !seen[g.clientId]) seen[g.clientId] = g.clientName || g.clientId; });
    return Object.entries(seen).map(([id, name]) => ({ id, name }));
  }, [memberChecklistGroups]);

  const checklistStats = useMemo(() => {
    const total = memberChecklistGroups.length;
    const submitted = memberChecklistGroups.filter(g => g._effectiveStatus === 'done').length;
    const overdue = memberChecklistGroups.filter(g => g._effectiveStatus === 'overdue').length;
    return { total, submitted, overdue };
  }, [memberChecklistGroups]);

  // #7 — derive the live selected group from current data so it stays fresh
  const liveSelectedChecklistGroup = useMemo(
    () => selectedChecklistGroupId != null
      ? memberChecklistGroups.find(g => String(g.id) === String(selectedChecklistGroupId)) ?? null
      : null,
    [selectedChecklistGroupId, memberChecklistGroups]
  );

  // P3: async so task-status changes are confirmed in Firebase before the UI
  // moves on. savingGuard prevents a second update while one is in-flight.
  const savingGuard = useRef(false);
  const [saving, setSaving] = useState(false);
  const handleUpdateTask = useCallback(async (task, changes) => {
    if (!task.cid || savingGuard.current) return;
    savingGuard.current = true;
    setSaving(true);
    try {
      const updated = (clientLogs[task.cid] || []).map(t => t.id === task.id ? { ...t, ...changes } : t);
      await setClientLogs({ ...clientLogs, [task.cid]: updated });
      if (selectedTask?.id === task.id) setSelectedTask(prev => ({ ...prev, ...changes }));
    } catch (err) {
      console.error('[PMT] TeamView handleUpdateTask: Firebase write failed', err);
    } finally {
      savingGuard.current = false;
      setSaving(false);
    }
  }, [clientLogs, setClientLogs, selectedTask]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${avatarColor(member.name)} flex items-center justify-center text-white font-bold text-sm`}>{initials(member.name)}</div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">{member.name}</h3>
            <p className="text-xs text-slate-500">{member.role}{member.department ? ` · ${member.department}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(member.email || member.emailAddress) && (
            <button
              onClick={() => setShowDm(true)}
              title="Mention via Teams"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm"
            >
              <MessageSquare size={13}/> DM
            </button>
          )}
          <button onClick={() => setShowAddTask(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm">
            <Plus size={13}/> Add Task
          </button>
        </div>
      </div>
      {/* Tab switcher */}
      <div className="px-5 pt-3 border-b border-slate-100 flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === 'tasks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          <ClipboardCheck size={12} /> Tasks
          <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{stats.total}</span>
        </button>
        <button
          onClick={() => setActiveTab('checklists')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === 'checklists' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          <CheckCircle size={12} /> Checklists
          {checklistStats.total > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${checklistStats.overdue > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{checklistStats.total}</span>
          )}
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1 space-y-4">
        {activeTab === 'tasks' && (<>
        <div className="grid grid-cols-4 gap-2">
          {[{ label: 'Total', value: stats.total, color: 'text-slate-800', filter: 'all' }, { label: 'Pending', value: stats.pending, color: 'text-orange-600', filter: 'Pending' }, { label: 'WIP', value: stats.wip, color: 'text-blue-600', filter: 'WIP' }, { label: 'Done', value: stats.done, color: 'text-emerald-600', filter: 'Done' }].map(s => (
            <button key={s.label} onClick={() => scrollToTasks(s.filter)} className="bg-white border border-slate-200 rounded-xl p-3 text-center transition-opacity hover:opacity-80 active:opacity-60">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button onClick={() => scrollToTasks('all')} className="bg-white border border-slate-200 rounded-xl p-3 text-center transition-opacity hover:opacity-80 active:opacity-60"><p className="text-xl font-black text-red-600">{stats.overdue}</p><p className="text-[10px] text-slate-500 font-semibold mt-0.5">Overdue</p></button>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center"><p className="text-xl font-black text-amber-600">{stats.avgQc ?? '—'}</p><p className="text-[10px] text-slate-500 font-semibold mt-0.5">Avg QC</p></div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center"><p className="text-sm font-black text-indigo-600">{fmtMs(stats.billableMs)}</p><p className="text-[10px] text-slate-500 font-semibold mt-0.5">Billable</p></div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center"><p className="text-sm font-black text-slate-600">{fmtMs(stats.nonBillableMs)}</p><p className="text-[10px] text-slate-500 font-semibold mt-0.5">Non-Bill.</p></div>
        </div>
        {(stats.aboveEst + stats.belowEst) > 0 && (
          <div className="flex gap-2">
            <div className="flex-1 bg-red-50 border border-red-100 rounded-lg p-2.5 flex items-center gap-2"><ArrowUp size={14} className="text-red-500"/><div><p className="text-sm font-bold text-red-700">{stats.aboveEst}</p><p className="text-[10px] text-red-500">Over estimate</p></div></div>
            <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 flex items-center gap-2"><ArrowDown size={14} className="text-emerald-500"/><div><p className="text-sm font-bold text-emerald-700">{stats.belowEst}</p><p className="text-[10px] text-emerald-500">Under estimate</p></div></div>
          </div>
        )}

        {/* Leave Overview */}
        {leaveGroups.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setLeaveOpen(o => !o)}
              className="w-full px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left"
            >
              <CalendarClock size={13} className="text-indigo-500"/>
              <h4 className="text-xs font-bold text-slate-700 flex-1">Leave Overview</h4>
              <span className="text-[10px] text-slate-400 font-medium mr-1">{leaveGroups.length}</span>
              <ChevronRight size={13} className={`text-slate-400 transition-transform ${leaveOpen ? 'rotate-90' : ''}`}/>
            </button>
            {leaveOpen && (
              <div className="divide-y divide-slate-50">
                {leaveGroups.map(lg => {
                  const isApproved = lg.status === 'approved';
                  const isToday = lg.isToday;
                  return (
                    <div key={lg.id} className={`px-4 py-2.5 flex items-center gap-3 ${isToday ? 'bg-amber-50/60' : ''}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isToday
                          ? 'bg-amber-100 text-amber-600'
                          : isApproved
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-blue-50 text-blue-500'
                      }`}>
                        {isToday
                          ? <CalendarX2 size={13}/>
                          : isApproved
                            ? <CalendarCheck2 size={13}/>
                            : <CalendarClock size={13}/>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{lg.leaveType}</p>
                        <p className="text-[10px] text-slate-500">{fmtLeaveDateRange(lg.startDate, lg.endDate)}{lg.session && lg.session !== 'full' ? ` · ${lg.session}` : ''}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {isToday && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Today</span>
                        )}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          isApproved
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-600'
                        }`}>
                          {isApproved ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {clientHourSplit.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100"><h4 className="text-xs font-bold text-slate-700">Client Hour Split</h4></div>
            <table className="w-full text-xs"><thead className="bg-slate-50 border-b border-slate-100"><tr><th className="px-4 py-2 text-left text-slate-500 font-semibold">Client</th><th className="px-4 py-2 text-right text-slate-500 font-semibold">Hours</th><th className="px-4 py-2 text-right text-slate-500 font-semibold">Tasks</th></tr></thead>
              <tbody className="divide-y divide-slate-50">{clientHourSplit.map(row => (<tr key={row.name} className="hover:bg-slate-50 transition-colors"><td className="px-4 py-2 text-slate-700 font-medium">{row.name}</td><td className="px-4 py-2 text-right text-slate-600">{fmtMs(row.ms)}</td><td className="px-4 py-2 text-right text-slate-500">{row.count}</td></tr>))}</tbody>
            </table>
          </div>
        )}
        <div ref={memberTasksRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-bold text-slate-700 mr-1">Tasks</h4>
            <div className="relative"><Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/><input value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Search…" className="pl-6 pr-2 py-1 text-[10px] border border-slate-200 rounded-md bg-slate-50 outline-none w-28"/></div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-[10px] border border-slate-200 rounded-md px-2 py-1 bg-slate-50 outline-none"><option value="all">All Status</option><option value="Pending">Pending</option><option value="WIP">WIP</option><option value="Done">Done</option></select>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="text-[10px] border border-slate-200 rounded-md px-2 py-1 bg-slate-50 outline-none max-w-[120px]"><option value="all">All Clients</option>{uniqueClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="text-[10px] border border-slate-200 rounded-md px-2 py-1 bg-slate-50 outline-none"><option value="all">All Time</option><option value="week">This Week</option><option value="month">This Month</option></select>
          </div>
          {tasks.length === 0
            ? <p className="text-center text-xs text-slate-400 py-8">No tasks match the filters.</p>
            : (
              <div className="divide-y divide-slate-50">
                {tasks.map(task => {
                  const isRunning = task.timerState === 'running' && task.timerStartedAt;
                  const elapsed = isRunning ? 0 : getElapsed(task, Date.now());
                  const over = task.estimatedMs && (isRunning ? (task.elapsedMs || 0) : elapsed) > task.estimatedMs;
                  const dueD = parseDueDate(task.dueDate);
                  const isOverdue = dueD && isBefore(dueD, new Date()) && task.status !== 'Done';
                  return (
                    <button key={task.id} onClick={() => setSelectedTask(task)} className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{task.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{task.cName}</span>
                            {task.dueDate && <span className={isOverdue ? 'text-red-500 font-semibold' : ''}>Due {task.dueDate}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[task.status] || 'bg-slate-100 text-slate-600'}`}>{task.status}</span>
                          {task.qcRating && <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5"><Star size={10}/>{task.qcRating}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                        <span>
                          {isRunning
                            ? <><LiveElapsed startedAt={task.timerStartedAt} elapsedMs={task.elapsedMs || 0}/> logged</>
                            : <>{fmtMs(elapsed)} logged</>
                          }
                        </span>
                        {task.estimatedMs && <span className={over ? 'text-red-500' : 'text-emerald-500'}>{over ? <ArrowUp size={9} className="inline"/> : <ArrowDown size={9} className="inline"/>}{' est. '}{fmtMs(task.estimatedMs)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          }
        </div>
        </>) /* end tasks tab */}

        {activeTab === 'checklists' && (
          <>
            {/* Checklist KPI row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-slate-800">{checklistStats.total}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Total</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-emerald-600">{checklistStats.submitted}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Submitted</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-red-600">{checklistStats.overdue}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Overdue</p>
              </div>
            </div>
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <select value={checklistCadenceFilter} onChange={e => setChecklistCadenceFilter(e.target.value)} className="text-[10px] border border-slate-200 rounded-md px-2 py-1 bg-slate-50 outline-none">
                <option value="All">All Cadences</option>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Once">One-time</option>
              </select>
              {checklistUniqueClients.length > 1 && (
                <select value={checklistClientFilter} onChange={e => setChecklistClientFilter(e.target.value)} className="text-[10px] border border-slate-200 rounded-md px-2 py-1 bg-slate-50 outline-none max-w-[120px]">
                  <option value="all">All Clients</option>
                  {checklistUniqueClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <select value={checklistStatusFilter} onChange={e => setChecklistStatusFilter(e.target.value)} className="text-[10px] border border-slate-200 rounded-md px-2 py-1 bg-slate-50 outline-none">
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="done">Submitted</option>
              </select>
            </div>
            {/* Group list */}
            {filteredChecklistGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle size={28} className="text-slate-200 mb-2"/>
                <p className="text-xs text-slate-400">{checklistStats.total === 0 ? 'No checklist groups assigned to this member.' : 'No groups match the current filters.'}</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <ClipboardCheck size={13} className="text-indigo-400"/>
                  <h4 className="text-xs font-bold text-slate-700 flex-1">Checklist Groups</h4>
                  <span className="text-[10px] text-slate-400">{filteredChecklistGroups.length}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {filteredChecklistGroups.map(group => (
                    <button key={group.id} onClick={() => setSelectedChecklistGroupId(group.id)} className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{group.name}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {group.clientName && <span className="text-[10px] text-slate-500 truncate max-w-[100px]">{group.clientName}</span>}
                            {group.repeatFrequency && group.repeatFrequency !== 'Once' && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CHECKLIST_CADENCE_COLORS[group.repeatFrequency] || 'bg-slate-100 text-slate-600'}`}>{group.repeatFrequency}</span>
                            )}
                            {group.date && <span className="text-[10px] text-slate-400">{group.date}</span>}
                          </div>
                          {group._totalQuestions > 0 && (
                            <div className="mt-2 space-y-0.5">
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>{group._answered} / {group._totalQuestions} answered</span>
                                {group._ynTotal > 0 && <span><span className="text-emerald-600">{group._yesCount} Yes</span> · <span className="text-red-500">{group._noCount} No</span></span>}
                              </div>
                              <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.round((group._answered / group._totalQuestions) * 100)}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {group._effectiveStatus === 'done' ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Submitted</span>
                          ) : group._effectiveStatus === 'overdue' ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
                          )}
                          <ChevronRight size={12} className="text-slate-300 mt-0.5"/>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Read-only checklist group detail for managers */}
      {liveSelectedChecklistGroup && (
        <ChecklistGroupDetailPanel
          group={liveSelectedChecklistGroup}
          childTasks={liveSelectedChecklistGroup._childTasks || []}
          currentUser={currentUser}
          users={users}
          taskCategories={taskCategories}
          onClose={() => setSelectedChecklistGroupId(null)}
          onUpdateChildTask={() => {}}
          onUpdateGroup={() => {}}
          readOnly
        />
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-[800] flex items-center justify-end">
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setSelectedTask(null)}/>
          <div className="relative z-10 h-full w-full max-w-xl">
            <TaskDetailPanel task={selectedTask} currentUser={currentUser} users={users} canEdit={false} saving={saving} onClose={() => setSelectedTask(null)} onUpdate={(updated) => handleUpdateTask(selectedTask, updated)}/>
          </div>
        </div>
      )}
      {showAddTask && (
        <AddTaskModal prefilledAssignee={member} clients={clients} syntheticClients={syntheticClients} taskCategories={taskCategories} currentUser={currentUser} clientLogs={clientLogs} setClientLogs={setClientLogs} persistTaskCreate={persistTaskCreate} taskTemplates={taskTemplates} onClose={() => setShowAddTask(false)}/>
      )}
      {showDm && (
        <TeamsChatModal
          member={member}
          currentUser={currentUser}
          onClose={() => setShowDm(false)}
        />
      )}
    </div>
  );
};

const fmtLeaveDate = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const fmtLeaveDateRange = (start, end) => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts = { day: 'numeric', month: 'short' };
  if (start === end) return s.toLocaleDateString('en-IN', opts);
  if (s.getFullYear() !== e.getFullYear())
    return `${s.toLocaleDateString('en-IN', { ...opts, year: 'numeric' })} – ${e.toLocaleDateString('en-IN', { ...opts, year: 'numeric' })}`;
  return `${s.toLocaleDateString('en-IN', opts)} – ${e.toLocaleDateString('en-IN', opts)}`;
};

const MemberCard = ({ member, isSelected, onClick, leaveStatus, attendanceStatus }) => {
  const ls = leaveStatus || {};
  const as = attendanceStatus || null;

  // Build badge: today states take priority, then upcoming
  // At most 2 badges: one for today, one for upcoming
  const todayBadge = ls.onLeaveToday
    ? { label: 'On Leave', cls: isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700' }
    : ls.onLeavePendingToday
      ? { label: 'Leave Pending', cls: isSelected ? 'bg-white/20 text-blue-100' : 'bg-blue-100 text-blue-700 border border-blue-200' }
      : null;

  // Upcoming: show approved first, fall back to pending
  const upcomingBadge = (!ls.onLeaveToday && !ls.onLeavePendingToday)
    ? ls.upcomingLeaveDate
      ? { label: `Leave ${fmtLeaveDate(ls.upcomingLeaveDate)}`, cls: isSelected ? 'bg-white/20 text-blue-100' : 'bg-sky-50 text-sky-600 border border-sky-200' }
      : ls.upcomingPendingDate
        ? { label: `Pending ${fmtLeaveDate(ls.upcomingPendingDate)}`, cls: isSelected ? 'bg-white/20 text-blue-100' : 'bg-blue-50 text-blue-500 border border-blue-200' }
        : null
    : null;

  // Attendance dot on avatar
  // green = in office, slate = left for day, red = not yet arrived, null = no Keka data
  const arrived = as ? (as.hasArrived ?? (as.clockIn !== null)) : null;
  const attendanceDot = as
    ? as.isInOffice ? 'bg-emerald-400'
      : arrived ? 'bg-slate-400'
      : 'bg-red-400'
    : null;
  const attendanceDotTitle = as?.isInOffice ? 'In office'
    : arrived ? 'Left for day'
    : 'Not arrived';

  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm text-slate-700'}`}>
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] ${isSelected ? 'bg-white/20 text-white' : `${avatarColor(member.name)} text-white`}`}>{initials(member.name)}</div>
          {attendanceDot && !ls.onLeaveToday && (
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${attendanceDot}`} title={attendanceDotTitle} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{member.name}</p>
          {member.department && <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>{member.department}</p>}
          {/* Keka + attendance row */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {member.kekaEmployeeId ? (
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-teal-100' : 'bg-teal-50 text-teal-600 border border-teal-200'}`}>
                <Link2 size={8} strokeWidth={2.5} /> Keka
              </span>
            ) : (
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/10 text-blue-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                <Link2Off size={8} strokeWidth={2.5} /> No Keka
              </span>
            )}
            {as && !ls.onLeaveToday && (() => {
              const fmt = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
              if (!arrived) {
                return (
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${isSelected ? 'bg-red-400/70 text-white' : 'bg-red-100 text-red-600'}`}>
                    ✕ NOT IN
                  </span>
                );
              }
              return as.isInOffice ? (
                <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${isSelected ? 'bg-emerald-400/80 text-white' : 'bg-emerald-500 text-white'}`}>
                  ● IN {fmt(as.clockIn)}
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-blue-100' : 'bg-slate-200 text-slate-600'}`}>
                  ● OUT {fmt(as.clockOut ?? as.clockIn)}
                </span>
              );
            })()}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 items-end flex-shrink-0">
          {todayBadge && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${todayBadge.cls}`}>
              {todayBadge.label}
            </span>
          )}
          {upcomingBadge && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${upcomingBadge.cls}`}>
              {upcomingBadge.label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

const EmptyLevelRow = ({ role }) => (
  <div className="w-full px-4 py-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-[10px] text-slate-400 italic">
    No {role}s in this team
  </div>
);

const TeamView = ({
  currentUser,
  users = [],
  clients = [],
  syntheticClients = [],
  clientLogs = {},
  setClientLogs,
  persistTaskCreate = null,
  taskCategories = [],
  hierarchyOrder = [],
  taskGroups = [],
  taskTemplates = [],
  onOpenClient = () => {},
  onGoToApprovals = () => {},
}) => {
  const [drillStack, setDrillStack] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [deptFilter, setDeptFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [leaveStatuses, setLeaveStatuses] = useState({});
  const [leaveLoaded, setLeaveLoaded] = useState(false);
  const [upcomingHolidays, setUpcomingHolidays] = useState(new Set());
  const [attendanceStatuses, setAttendanceStatuses] = useState({});

  const overviewAtRiskRef = useRef(null);
  const overviewPendingQCRef = useRef(null);
  const overviewMissingInfoRef = useRef(null);
  const overviewLeaveRef = useRef(null);
  const scrollToOverview = (ref) => ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const isBH = currentUser?.role === 'Business Head';
  const isCSMPM = CS_REPORT_ROLES.has(currentUser?.role);
  // Region filter is only for roles that already see users across regions.
  const isTeamAdmin = TEAM_ADMIN_ROLES.includes(currentUser?.role);

  const effectiveHierarchyOrder = useMemo(() => (hierarchyOrder?.length > 0 ? hierarchyOrder : DEFAULT_STANDARD_TRACK), [hierarchyOrder]);

  const allDepartments = useMemo(() => {
    const depts = [...new Set(users.map(u => u.department).filter(Boolean))].sort();
    return depts;
  }, [users]);

  const allRegions = useMemo(() => {
    return [...new Set(users.map(u => u.region).filter(Boolean))].sort();
  }, [users]);

  const allClients = useMemo(() => [...(clients || []), ...(syntheticClients || [])], [clients, syntheticClients]);

  // Aug 2026 policy: Business Heads and CSMs are client-specific. Their Team
  // View shows direct reportees PLUS the teams allocated to their own clients
  // and to the clients of their direct reportees — and they only see tasks
  // belonging to those clients (no personal tasks, no other clients' tasks).
  const isOwnerScoped = isBH || currentUser?.role === 'CSM';
  const ownerScope = useMemo(() => {
    if (!isOwnerScoped) return null;
    const directs = getDirectReports(currentUser.id, users);
    const directIdSet = new Set(directs.map(d => String(d.id)));
    const ownedBy = (uid) => (clients || []).filter(c => (c.ownerIds || []).map(String).includes(String(uid)));
    const relevant = new Map();
    ownedBy(currentUser.id).forEach(c => relevant.set(String(c.id), c));
    directs.forEach(r => ownedBy(r.id).forEach(c => relevant.set(String(c.id), c)));
    const clientIds = new Set(relevant.keys());
    const clientNames = new Set([...relevant.values()].map(c => c.name));
    const teamMembers = users.filter(u =>
      String(u.id) !== String(currentUser.id) &&
      !directIdSet.has(String(u.id)) &&
      (u.assignedProjects || []).some(p => clientNames.has(p))
    );
    return { clientIds, teamMembers };
  }, [isOwnerScoped, currentUser?.id, users, clients]);

  // Pre-built user→tasks index so MemberCard lookups are O(1) instead of
  // iterating all clientLogs on every render. Recomputed only when clientLogs
  // or the clients list changes — not on every task-level field update.
  const userTasksIndex = useMemo(() => {
    const index = new Map();
    Object.entries(clientLogs).forEach(([cid, tasks]) => {
      // Owner-scoped roles (BH/CSM) only see tasks of their relevant clients —
      // this also excludes personal/synthetic buckets.
      if (ownerScope && !ownerScope.clientIds.has(String(cid))) return;
      const clientObj = allClients.find(c => String(c.id) === String(cid));
      const cName = clientObj?.name || cid;
      (tasks || []).forEach(t => {
        const uid = String(t.assigneeId);
        const enriched = { ...t, cid, cName };
        const existing = index.get(uid);
        if (existing) existing.push(enriched);
        else index.set(uid, [enriched]);
      });
    });
    return index;
  }, [clientLogs, allClients, ownerScope]);

  const allTasksForUser = useCallback((userId) => {
    return userTasksIndex.get(String(userId)) ?? [];
  }, [userTasksIndex]);

  const currentParent = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;

  const leftPanelGroups = useMemo(() => {
    const filterByDept = (members) => {
      let out = members;
      if (deptFilter === 'all') { /* no dept restriction */ }
      else out = out.filter(u => u.department === deptFilter);
      // Region filter — admins only; combines with (never replaces) other filters.
      if (isTeamAdmin && regionFilter !== 'all') out = out.filter(u => u.region === regionFilter);
      return out;
    };
    const sortByName = (arr) => [...arr].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (isBH) {
      const csReports = sortByName(filterByDept(getDirectReports(currentUser.id, users).filter(u => CS_REPORT_ROLES.has(u.role))));
      const groups = [{ role: 'CSM / Project Manager', members: csReports, isDrillable: false }];
      if (ownerScope?.teamMembers.length) {
        groups.push({ role: 'Client Teams', members: sortByName(filterByDept(ownerScope.teamMembers)), isDrillable: false });
      }
      return groups;
    }

    if (isCSMPM) {
      const direct = sortByName(filterByDept(getDirectReports(currentUser.id, users)));
      const groups = [{ role: 'Direct Reports', members: direct, isDrillable: false }];
      if (ownerScope?.teamMembers.length) {
        groups.push({ role: 'Client Teams', members: sortByName(filterByDept(ownerScope.teamMembers)), isDrillable: false });
      }
      return groups;
    }

    if (isSuperAdmin && currentParent?.role === 'Business Head') {
      const csReports = sortByName(filterByDept(getDirectReports(currentParent.id, users).filter(u => CS_REPORT_ROLES.has(u.role))));
      return [{ role: 'CSM / Project Manager', members: csReports, isDrillable: false }];
    }

    const rootId = currentParent ? currentParent.id : currentUser?.id;
    const parentRole = currentParent ? currentParent.role : currentUser?.role;

    if (isSuperAdmin && !currentParent) {
      const bhGroup = {
        role: 'Business Head',
        members: sortByName(filterByDept(users.filter(u => u.role === 'Business Head'))),
        isDrillable: true,
      };
      const standardGroups = effectiveHierarchyOrder.map(role => ({
        role,
        members: sortByName(filterByDept(users.filter(u => u.role === role))),
        isDrillable: true,
      }));
      return [bhGroup, ...standardGroups];
    }

    // Shared helper: supports array-valued managerId and secondary managerId2,
    // identical semantics to the mobile app. Drill-down only ever exposes the
    // drilled parent's reports, so managers stay within their own subtree.
    const directReports = getDirectReports(rootId, users);
    const levelsToShow = getLevelsToShow(parentRole, effectiveHierarchyOrder);
    const groups = levelsToShow.map(role => ({
      role,
      members: sortByName(filterByDept(directReports.filter(u => u.role === role))),
      isDrillable: true,
    }));
    const coveredRoles = new Set(levelsToShow);
    const extraRoles = [...new Set(directReports.filter(u => !coveredRoles.has(u.role)).map(u => u.role))];
    extraRoles.forEach(role => groups.push({
      role,
      members: sortByName(filterByDept(directReports.filter(u => u.role === role))),
      isDrillable: true,
    }));
    return groups;
  }, [currentParent, isSuperAdmin, isBH, isCSMPM, users, currentUser, effectiveHierarchyOrder, deptFilter, regionFilter, isTeamAdmin]);

  useEffect(() => {
    const allMembers = leftPanelGroups.flatMap(g => g.members || []);
    setLeaveLoaded(false);
    if (!allMembers.length) {
      setLeaveStatuses({});
      setUpcomingHolidays(new Set());
      setLeaveLoaded(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      Promise.all(
        allMembers.map(m =>
          getUserLeaveStatus(String(m.id)).then(status => ({ id: String(m.id), status }))
        )
      ),
      getUpcomingHolidays('All', 14),
      // Single Firebase read for all attendance — one call for the whole team
      getTodayAttendanceMap(),
    ]).then(([results, holidays, attendanceMap]) => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ id, status }) => { map[id] = status; });
      setLeaveStatuses(map);
      setUpcomingHolidays(holidays);
      setAttendanceStatuses(attendanceMap);
    }).finally(() => {
      if (!cancelled) setLeaveLoaded(true);
    });
    return () => { cancelled = true; };
  }, [leftPanelGroups]);

  const canDrillSelected = useMemo(() => {
    if (!selectedMember) return false;
    if (isBH || isCSMPM) return false;
    if (currentParent?.role === 'Business Head') return false;
    return getDirectReports(selectedMember.id, users).length > 0;
  }, [selectedMember, isBH, isCSMPM, currentParent, users]);

  const drillInto = () => {
    if (!selectedMember || !canDrillSelected) return;
    setDrillStack(prev => [...prev, selectedMember]);
    setSelectedMember(null);
    setAttendanceFilter('all');
  };

  const drillBack = (idx) => {
    setDrillStack(prev => prev.slice(0, idx));
    setSelectedMember(null);
    setAttendanceFilter('all');
  };

  const memberTasks = useMemo(() => {
    if (!selectedMember) return [];
    return allTasksForUser(selectedMember.id);
  }, [selectedMember, allTasksForUser]);

  const visibleMemberIds = useMemo(() => {
    const ids = new Set();
    leftPanelGroups.forEach(({ members }) => {
      (members || []).forEach(m => ids.add(String(m.id)));
    });
    return ids;
  }, [leftPanelGroups]);

  const visibleTasks = useMemo(() => {
    const result = [];
    Object.entries(clientLogs).forEach(([cid, tasks]) => {
      const clientObj = allClients.find(c => String(c.id) === String(cid));
      (tasks || []).forEach(t => {
        if (visibleMemberIds.has(String(t.assigneeId))) {
          result.push({ ...t, cid, cName: clientObj?.name || cid });
        }
      });
    });
    return result;
  }, [clientLogs, visibleMemberIds, allClients]);

  const clientById = useMemo(() => {
    const map = {};
    allClients.forEach(c => { map[String(c.id)] = c; });
    return map;
  }, [allClients]);

  const unassignedTasks = useMemo(() => {
    const result = [];
    Object.entries(clientLogs).forEach(([cid, tasks]) => {
      const clientObj = clientById[String(cid)];
      (tasks || []).forEach(t => {
        if (!t.assigneeId && !t.archived && t.status !== 'Done') {
          result.push({ ...t, cid, cName: clientObj?.name || cid });
        }
      });
    });
    return result;
  }, [clientLogs, clientById]);

  const kpiMetrics = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
    let overdue = 0, dueToday = 0, awaitingQC = 0, qcRejected = 0, missingDueDate = 0;
    visibleTasks.forEach(t => {
      if (t.archived) return;
      if (t.status !== 'Done') {
        const due = parseDueDate(t.dueDate);
        if (!t.dueDate) missingDueDate++;
        else if (due && due < today) overdue++;
        else if (due && due >= today && due <= todayEnd) dueToday++;
      }
      if (t.qcStatus === 'sent' && !t.archived) awaitingQC++;
      if (t.qcStatus === 'rejected' && t.status !== 'Done' && !t.archived) qcRejected++;
    });
    return { overdue, dueToday, awaitingQC, qcRejected, unassigned: unassignedTasks.length, missingDueDate };
  }, [visibleTasks, unassignedTasks]);

  const atRiskTasks = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
    return visibleTasks
      .filter(t => !t.archived && t.status !== 'Done')
      .map(t => {
        const due = parseDueDate(t.dueDate);
        if (!due) return null;
        const isOverdue = due < today;
        const isDueToday = due >= today && due <= todayEnd;
        if (!isOverdue && !isDueToday) return null;
        return { ...t, isOverdue, isDueToday, daysOverdue: isOverdue ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0 };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return b.daysOverdue - a.daysOverdue;
      })
      .slice(0, 30);
  }, [visibleTasks]);

  const workloadData = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const memberMap = {};
    leftPanelGroups.forEach(({ members }) => {
      (members || []).forEach(m => { memberMap[String(m.id)] = { member: m, open: 0, wip: 0, done: 0, overdue: 0 }; });
    });
    visibleTasks.forEach(t => {
      if (t.archived) return;
      const key = String(t.assigneeId);
      if (!memberMap[key]) return;
      if (t.status === 'Done') { memberMap[key].done++; return; }
      memberMap[key].open++;
      if (t.status === 'WIP') memberMap[key].wip++;
      const due = parseDueDate(t.dueDate);
      if (due && due < today) memberMap[key].overdue++;
    });
    const rows = Object.values(memberMap);
    const maxOpen = Math.max(...rows.map(r => r.open), 1);
    return { rows: rows.sort((a, b) => b.overdue - a.overdue || b.open - a.open), maxOpen };
  }, [visibleTasks, leftPanelGroups]);

  const pendingQCTasks = useMemo(() => {
    const today = new Date();
    return visibleTasks
      .filter(t => t.qcStatus === 'sent' && !t.archived)
      .map(t => {
        const submitted = parseTimestamp(t.qcSubmittedAt || t.date);
        const daysAge = submitted ? Math.floor((today.getTime() - submitted.getTime()) / 86400000) : 0;
        return { ...t, daysAge: Math.max(0, daysAge) };
      })
      .sort((a, b) => b.daysAge - a.daysAge);
  }, [visibleTasks]);

  const missingInfoTasks = useMemo(() => {
    const nodue = visibleTasks
      .filter(t => !t.archived && t.status !== 'Done' && !t.dueDate)
      .map(t => ({ ...t, missingType: 'dueDate' }));
    const noassignee = unassignedTasks.map(t => ({ ...t, missingType: 'assignee' }));
    return [...noassignee, ...nodue].slice(0, 20);
  }, [visibleTasks, unassignedTasks]);

  const leaveConflicts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sevenDaysLater = new Date(today); sevenDaysLater.setDate(today.getDate() + 7);
    const memberLookup = {};
    leftPanelGroups.forEach(({ members }) => {
      (members || []).forEach(m => { memberLookup[String(m.id)] = m; });
    });
    return visibleTasks
      .filter(t => !t.archived && t.status !== 'Done' && t.dueDate && t.assigneeId)
      .map(t => {
        const due = parseDueDate(t.dueDate);
        if (!due || due < today || due > sevenDaysLater) return null;
        const status = leaveStatuses[String(t.assigneeId)];
        if (!status) return null;
        const dueKey = format(due, 'yyyy-MM-dd');
        const isDueOnHoliday = upcomingHolidays.has(dueKey);
        let conflictType = null, badge = null, badgeStyle = null;
        if (status.onLeaveToday) {
          conflictType = 'hard'; badge = 'On Leave Today'; badgeStyle = 'bg-red-100 text-red-700';
        } else if (status.upcomingLeaveDate && status.upcomingLeaveDate <= dueKey) {
          conflictType = 'hard'; badge = 'Leave on Due Date'; badgeStyle = 'bg-orange-100 text-orange-700';
        } else if (isDueOnHoliday) {
          conflictType = 'hard'; badge = 'Public Holiday'; badgeStyle = 'bg-rose-100 text-rose-700';
        } else if (status.onLeavePendingToday) {
          conflictType = 'soft'; badge = 'Pending Leave'; badgeStyle = 'bg-amber-100 text-amber-700';
        } else if (status.upcomingPendingDate && status.upcomingPendingDate <= dueKey) {
          conflictType = 'soft'; badge = 'Pending Leave'; badgeStyle = 'bg-amber-100 text-amber-700';
        }
        if (!conflictType) return null;
        const member = memberLookup[String(t.assigneeId)];
        return { ...t, due, dueKey, conflictType, badge, badgeStyle, member };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.conflictType !== b.conflictType) return a.conflictType === 'hard' ? -1 : 1;
        return a.due - b.due;
      });
  }, [visibleTasks, leaveStatuses, upcomingHolidays, leftPanelGroups]);

  const hardConflictCount = useMemo(
    () => leaveConflicts.filter(c => c.conflictType === 'hard').length,
    [leaveConflicts]
  );

  // Team-wide checklist groups for the overview panel
  const teamChecklistGroups = useMemo(() => {
    return taskGroups
      .filter(g => !g.archived && visibleMemberIds.has(String(g.assigneeId)))
      .map(g => enrichChecklistGroup(g, clientLogs));
  }, [taskGroups, visibleMemberIds, clientLogs]);

  const teamChecklistKpis = useMemo(() => {
    const total = teamChecklistGroups.length;
    const submitted = teamChecklistGroups.filter(g => g._effectiveStatus === 'done').length;
    const overdue = teamChecklistGroups.filter(g => g._effectiveStatus === 'overdue').length;
    return { total, submitted, overdue };
  }, [teamChecklistGroups]);

  const [teamChecklistFilter, setTeamChecklistFilter] = useState('all'); // 'all' | 'pending' | 'overdue' | 'done'
  const [selectedTeamChecklistGroupId, setSelectedTeamChecklistGroupId] = useState(null);

  // #9 — sort: overdue → pending → done; within each bucket sort oldest due-date first
  const sortedTeamChecklistGroups = useMemo(() => {
    const STATUS_ORDER = { overdue: 0, pending: 1, done: 2 };
    return [...teamChecklistGroups].sort((a, b) => {
      const sd = (STATUS_ORDER[a._effectiveStatus] ?? 1) - (STATUS_ORDER[b._effectiveStatus] ?? 1);
      if (sd !== 0) return sd;
      const aT = a._groupDate ? a._groupDate.getTime() : Infinity;
      const bT = b._groupDate ? b._groupDate.getTime() : Infinity;
      return aT - bT;
    });
  }, [teamChecklistGroups]);

  const filteredTeamChecklistGroups = useMemo(() => {
    if (teamChecklistFilter === 'all') return sortedTeamChecklistGroups;
    return sortedTeamChecklistGroups.filter(g => g._effectiveStatus === teamChecklistFilter);
  }, [sortedTeamChecklistGroups, teamChecklistFilter]);

  // #7 — always derive the live group from the latest data rather than storing the whole object
  const liveSelectedTeamChecklistGroup = useMemo(
    () => selectedTeamChecklistGroupId != null
      ? teamChecklistGroups.find(g => String(g.id) === String(selectedTeamChecklistGroupId)) ?? null
      : null,
    [selectedTeamChecklistGroupId, teamChecklistGroups]
  );

  if (!currentUser) return null;

  const showDeptFilter = allDepartments.length > 1;
  const hasAnyAttendance = Object.keys(attendanceStatuses).length > 0;

  const ATTENDANCE_FILTERS = [
    { value: 'all',         label: 'All' },
    { value: 'in_office',   label: '● In Office' },
    { value: 'left',        label: '● Left' },
    { value: 'not_arrived', label: '✕ Not Arrived' },
  ];

  const matchesAttendanceFilter = (memberId) => {
    if (attendanceFilter === 'all') return true;
    const as = attendanceStatuses[String(memberId)];
    const arrived = as ? (as.hasArrived ?? (as.clockIn !== null)) : false;
    if (attendanceFilter === 'in_office')   return as?.isInOffice === true;
    if (attendanceFilter === 'left')        return arrived && !as?.isInOffice;
    if (attendanceFilter === 'not_arrived') return !arrived && !!as; // only Keka-linked
    return true;
  };

  return (
    <div className="flex gap-4 h-full">
      <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold min-h-[24px] flex-wrap">
            <button onClick={() => drillBack(0)} className={`flex items-center gap-1 ${drillStack.length === 0 ? 'text-blue-600 font-bold cursor-default' : 'hover:text-slate-700 cursor-pointer'}`}>
              <Users size={13}/><span>Team</span>
            </button>
            {drillStack.map((m, i) => (
              <React.Fragment key={m.id}>
                <ChevronRight size={11} className="text-slate-300 flex-shrink-0"/>
                <button onClick={() => drillBack(i + 1)} className={`truncate max-w-[80px] ${i === drillStack.length - 1 ? 'text-blue-600 font-bold cursor-default' : 'hover:text-slate-700 cursor-pointer'}`}>
                  {m.name.split(' ')[0]}
                </button>
              </React.Fragment>
            ))}
          </div>
          {drillStack.length > 0 && (
            <button onClick={() => drillBack(drillStack.length - 1)} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors">
              <ChevronLeft size={10}/> Back
            </button>
          )}
          {showDeptFilter && (
            <div className="flex items-center gap-1.5">
              <Filter size={11} className="text-slate-400 flex-shrink-0"/>
              <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setSelectedMember(null); }}
                className="flex-1 text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-2 ring-blue-500/20 text-slate-700">
                <option value="all">All Departments</option>
                {allDepartments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {isTeamAdmin && allRegions.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter size={11} className="text-slate-400 flex-shrink-0"/>
              <select value={regionFilter} onChange={e => { setRegionFilter(e.target.value); setSelectedMember(null); }}
                className="flex-1 text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-2 ring-blue-500/20 text-slate-700">
                <option value="all">All Regions</option>
                {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {hasAnyAttendance && (
            <div className="flex items-center gap-1 flex-wrap">
              {ATTENDANCE_FILTERS.map(({ value, label }) => {
                const active = attendanceFilter === value;
                const colorCls = active
                  ? value === 'in_office'   ? 'bg-emerald-500 text-white border-emerald-500'
                  : value === 'left'        ? 'bg-slate-500 text-white border-slate-500'
                  : value === 'not_arrived' ? 'bg-red-500 text-white border-red-500'
                  :                          'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300';
                return (
                  <button
                    key={value}
                    onClick={() => { setAttendanceFilter(value); setSelectedMember(null); }}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors ${colorCls}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {leftPanelGroups.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
              <Users size={28} className="text-slate-300 mx-auto mb-2"/>
              <p className="text-xs text-slate-400">No team members found.</p>
            </div>
          )}
          {leftPanelGroups.map(({ role, members }) => (
            <div key={role} className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">{role}</p>
              {(() => {
                const filtered = members.filter(m => matchesAttendanceFilter(m.id));
                return filtered.length === 0
                  ? <EmptyLevelRow role={role}/>
                  : filtered.map(member => (
                      <MemberCard key={member.id} member={member} isSelected={selectedMember?.id === member.id} onClick={() => setSelectedMember(member)} leaveStatus={leaveStatuses[String(member.id)]} attendanceStatus={attendanceStatuses[String(member.id)]}/>
                    ));
              })()}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        {selectedMember ? (
          <MemberStats
            member={selectedMember}
            allMemberTasks={memberTasks}
            clients={clients}
            syntheticClients={syntheticClients}
            users={users}
            currentUser={currentUser}
            clientLogs={clientLogs}
            setClientLogs={setClientLogs}
            taskCategories={taskCategories}
            taskGroups={taskGroups}
            persistTaskCreate={persistTaskCreate}
            taskTemplates={taskTemplates}
          />
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                <BarChart2 size={13} className="text-indigo-400" />Team Overview
              </h3>
              <span className="text-[10px] text-slate-400">{visibleMemberIds.size} member{visibleMemberIds.size !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* KPI cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Overdue',     value: kpiMetrics.overdue,       accent: 'text-red-600',    bg: 'bg-red-50 border-red-100',       ref: overviewAtRiskRef },
                  { label: 'Due Today',   value: kpiMetrics.dueToday,      accent: 'text-amber-600',  bg: 'bg-amber-50 border-amber-100',   ref: overviewAtRiskRef },
                  { label: 'Awaiting QC', value: kpiMetrics.awaitingQC,    accent: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100', ref: overviewPendingQCRef },
                  { label: 'QC Rejected', value: kpiMetrics.qcRejected,    accent: 'text-orange-600', bg: 'bg-orange-50 border-orange-100', ref: overviewPendingQCRef },
                  { label: 'Unassigned',  value: kpiMetrics.unassigned,    accent: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',   ref: overviewMissingInfoRef },
                  { label: 'No Due Date', value: kpiMetrics.missingDueDate, accent: 'text-gray-500',  bg: 'bg-gray-50 border-gray-200',     ref: overviewMissingInfoRef },
                ].map(card => (
                  <button
                    key={card.label}
                    onClick={() => scrollToOverview(card.ref)}
                    className={`rounded-xl border p-3 text-center transition-opacity hover:opacity-80 active:opacity-60 ${card.bg}`}
                  >
                    <p className={`text-2xl font-black ${card.accent}`}>{card.value}</p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-tight">{card.label}</p>
                  </button>
                ))}
                <button
                  onClick={() => scrollToOverview(overviewLeaveRef)}
                  className="rounded-xl border p-3 text-center bg-rose-50 border-rose-100 transition-opacity hover:opacity-80 active:opacity-60"
                >
                  <p className="text-2xl font-black text-rose-600">{leaveLoaded ? hardConflictCount : '—'}</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-tight">Leave Conflicts</p>
                </button>
                {teamChecklistKpis.total > 0 && (
                  <div className="rounded-xl border p-3 text-center bg-indigo-50 border-indigo-100">
                    <p className="text-2xl font-black text-indigo-600">{teamChecklistKpis.submitted}<span className="text-sm font-semibold text-indigo-300">/{teamChecklistKpis.total}</span></p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-tight">Checklists Done</p>
                  </div>
                )}
              </div>

              {/* At-Risk Tasks */}
              {atRiskTasks.length > 0 && (
                <div ref={overviewAtRiskRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-red-400" />
                    <h4 className="text-xs font-bold text-slate-700 flex-1">At-Risk Tasks</h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{atRiskTasks.length}</span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Task</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Client</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Assignee</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Due</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {atRiskTasks.map((t, idx) => {
                        const clientObj = clientById[String(t.cid)] || { id: t.cid, name: t.cName };
                        return (
                          <tr key={`ar-${t.cid}-${t.id}-${idx}`} onClick={() => onOpenClient(clientObj)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                            <td className="px-4 py-2 text-xs font-semibold text-slate-800 max-w-[140px]"><p className="truncate">{t.name || t.comment}</p></td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-[80px]">{t.cName}</td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-[70px]">{t.assigneeName || '—'}</td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 whitespace-nowrap">{t.dueDate || '—'}</td>
                            <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>{t.status}</span></td>
                            <td className="px-3 py-2">{t.isOverdue ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{t.daysOverdue}d late</span> : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">Today</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Team Workload */}
              {workloadData.rows.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                    <BarChart2 size={13} className="text-indigo-400" />
                    <h4 className="text-xs font-bold text-slate-700">Team Workload</h4>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {workloadData.rows.map((row) => {
                      const barPct = workloadData.maxOpen > 0 ? (row.open / workloadData.maxOpen) * 100 : 0;
                      return (
                        <button
                          key={row.member.id}
                          onClick={() => setSelectedMember(row.member)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className={`w-7 h-7 rounded-full ${avatarColor(row.member.name)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                            {initials(row.member.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-xs font-semibold text-slate-800 truncate">{row.member.name}</p>
                              <div className="flex items-center gap-2 flex-shrink-0 text-[10px] font-bold">
                                <span className="text-orange-500">{row.open} open</span>
                                <span className="text-blue-500">{row.wip} WIP</span>
                                <span className="text-red-500">{row.overdue} late</span>
                                <span className="text-emerald-500">{row.done} done</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${row.overdue > 0 ? 'bg-red-400' : 'bg-indigo-400'}`} style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                          <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Team Checklists */}
              {teamChecklistGroups.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                    <ClipboardCheck size={13} className="text-indigo-400"/>
                    <h4 className="text-xs font-bold text-slate-700 flex-1">Team Checklists</h4>
                    <div className="flex items-center gap-1">
                      {[
                        { value: 'all',     label: 'All',       count: teamChecklistKpis.total },
                        { value: 'overdue', label: 'Overdue',   count: teamChecklistKpis.overdue },
                        { value: 'pending', label: 'Pending',   count: null },
                        { value: 'done',    label: 'Submitted', count: teamChecklistKpis.submitted },
                      ].map(f => (
                        <button
                          key={f.value}
                          onClick={() => setTeamChecklistFilter(f.value)}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors ${teamChecklistFilter === f.value ? (f.value === 'overdue' ? 'bg-red-500 text-white border-red-500' : f.value === 'done' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-indigo-600 text-white border-indigo-600') : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                        >
                          {f.label}{f.count != null ? ` (${f.count})` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredTeamChecklistGroups.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-6">No groups match the filter.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-[11px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Group</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Member</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Client</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cadence</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Progress</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredTeamChecklistGroups.slice(0, 20).map((g, idx) => {
                            const memberUser = users.find(u => String(u.id) === String(g.assigneeId));
                            const memberName = memberUser?.name || g.assigneeName || '—';
                            // #1/#2 — use _totalQuestions so text-only checklists show progress too
                            const pct = g._totalQuestions > 0 ? Math.round((g._answered / g._totalQuestions) * 100) : null;
                            return (
                              <tr key={`tc-${g.id}-${idx}`} onClick={() => setSelectedTeamChecklistGroupId(g.id)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                                <td className="px-4 py-2 text-xs font-semibold text-slate-800 max-w-[140px]"><p className="truncate">{g.name}</p></td>
                                <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-[80px]">{memberName}</td>
                                <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-[80px]">{g.clientName || '—'}</td>
                                <td className="px-3 py-2">
                                  {g.repeatFrequency && g.repeatFrequency !== 'Once' ? (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CHECKLIST_CADENCE_COLORS[g.repeatFrequency] || 'bg-slate-100 text-slate-600'}`}>{g.repeatFrequency}</span>
                                  ) : <span className="text-[10px] text-slate-400">—</span>}
                                </td>
                                <td className="px-3 py-2 min-w-[80px]">
                                  {pct != null ? (
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[40px]">
                                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }}/>
                                      </div>
                                      <span className="text-[10px] text-slate-500 flex-shrink-0">{g._answered}/{g._totalQuestions}</span>
                                    </div>
                                  ) : <span className="text-[10px] text-slate-400">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  {g._effectiveStatus === 'done'
                                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Submitted</span>
                                    : g._effectiveStatus === 'overdue'
                                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>
                                    : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {/* #10 — show truncation notice when more than 20 records */}
                      {filteredTeamChecklistGroups.length > 20 && (
                        <p className="text-center text-[10px] text-slate-400 py-2 border-t border-slate-50">
                          Showing 20 of {filteredTeamChecklistGroups.length} checklist groups
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Team Checklist read-only detail panel */}
              {liveSelectedTeamChecklistGroup && (
                <ChecklistGroupDetailPanel
                  group={liveSelectedTeamChecklistGroup}
                  childTasks={liveSelectedTeamChecklistGroup._childTasks || []}
                  currentUser={currentUser}
                  users={users}
                  taskCategories={taskCategories}
                  onClose={() => setSelectedTeamChecklistGroupId(null)}
                  onUpdateChildTask={() => {}}
                  onUpdateGroup={() => {}}
                  readOnly
                />
              )}

              {/* Pending QC Reviews */}
              {pendingQCTasks.length > 0 && (
                <div ref={overviewPendingQCRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={onGoToApprovals} className="w-full px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left">
                    <ClipboardCheck size={13} className="text-indigo-400" />
                    <h4 className="text-xs font-bold text-slate-700 flex-1">Pending QC Reviews</h4>
                    <span className="text-[10px] font-bold text-indigo-500">View all →</span>
                  </button>
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Task</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Client</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Assignee</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Submitted</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pendingQCTasks.map((t, idx) => {
                        const submittedD = parseTimestamp(t.qcSubmittedAt || t.date);
                        const submittedLabel = submittedD ? format(submittedD, 'dd MMM') : null;
                        return (
                          <tr key={`qc-${t.cid}-${t.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2 text-xs font-semibold text-slate-800 max-w-[140px]"><p className="truncate">{t.name || t.comment}</p></td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-[80px]">{t.cName}</td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-[70px]">{t.assigneeName || '—'}</td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 whitespace-nowrap">{submittedLabel || '—'}</td>
                            <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.daysAge > 3 ? 'bg-red-100 text-red-600' : t.daysAge > 1 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{t.daysAge === 0 ? 'Today' : `${t.daysAge}d`}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Missing Info */}
              {missingInfoTasks.length > 0 && (
                <div ref={overviewMissingInfoRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                    <Clock size={13} className="text-slate-400" />
                    <h4 className="text-xs font-bold text-slate-700 flex-1">Missing Info</h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{missingInfoTasks.length}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {missingInfoTasks.map((t, idx) => {
                      const clientObj = clientById[String(t.cid)] || { id: t.cid, name: t.cName };
                      return (
                        <button
                          key={`mi-${t.cid}-${t.id}-${idx}`}
                          onClick={() => onOpenClient(clientObj)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{t.name || t.comment}</p>
                            <span className="text-[10px] text-slate-400">{t.cName}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${t.missingType === 'assignee' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                            {t.missingType === 'assignee' ? 'No Assignee' : 'No Due Date'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Leave Conflicts */}
              <div ref={overviewLeaveRef} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <CalendarX2 size={13} className="text-rose-400" />
                  <h4 className="text-xs font-bold text-slate-700 flex-1">Leave Conflicts</h4>
                  {leaveLoaded && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{leaveConflicts.length}</span>}
                </div>
                {!leaveLoaded ? (
                  <div className="divide-y divide-slate-50">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 bg-slate-100 rounded-full animate-pulse w-3/4" />
                          <div className="h-2 bg-slate-100 rounded-full animate-pulse w-1/2" />
                        </div>
                        <div className="h-5 w-20 bg-slate-100 rounded-full animate-pulse flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : leaveConflicts.length === 0 ? (
                  <div className="flex items-center gap-2 px-4 py-4">
                    <CalendarCheck2 size={14} className="text-emerald-400 flex-shrink-0" />
                    <p className="text-xs text-slate-400">No upcoming conflicts in the next 7 days</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {leaveConflicts.map((t, idx) => {
                      const clientObj = clientById[String(t.cid)] || { id: t.cid, name: t.cName };
                      const memberName = t.member?.name || t.assigneeName || '?';
                      return (
                        <button
                          key={`lc-${t.cid}-${t.id}-${idx}`}
                          onClick={() => onOpenClient(clientObj)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className={`w-7 h-7 rounded-full ${avatarColor(memberName)} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                            {initials(memberName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight">{t.name || t.comment}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] font-medium text-slate-600">{memberName}</span>
                              <span className="text-[10px] text-slate-400">·</span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{t.cName}</span>
                              <span className="text-[10px] text-slate-400">·</span>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">{format(t.due, 'd MMM')}</span>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${t.badgeStyle}`}>
                            {t.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* All-clear state */}
              {atRiskTasks.length === 0 && pendingQCTasks.length === 0 && missingInfoTasks.length === 0 && leaveConflicts.length === 0 && leaveLoaded && visibleMemberIds.size > 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                  <Users size={32} />
                  <p className="text-sm font-semibold mt-2">Team is on track</p>
                  <p className="text-xs mt-1 text-slate-400">No overdue, QC, missing info, or leave issues</p>
                </div>
              )}
              {visibleMemberIds.size === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                  <Users size={32} />
                  <p className="text-sm font-semibold mt-2">No team members in view</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {canDrillSelected && (
        <button onClick={drillInto}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all z-50">
          <Users size={13}/> View {selectedMember.name.split(' ')[0]}'s Team
        </button>
      )}
    </div>
  );
};

export default TeamView;
