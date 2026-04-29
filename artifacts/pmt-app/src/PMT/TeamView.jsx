import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Users, ChevronRight, ChevronLeft, Plus, X, Search, Star, ArrowUp, ArrowDown, Filter, CalendarClock, CalendarCheck2, CalendarX2, AlertTriangle, BarChart2, ClipboardCheck, Clock } from 'lucide-react';
import { format, isBefore, isAfter, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse } from 'date-fns';
import TaskDetailPanel from './TaskDetailPanel';
import { sendNotification } from '../utils/notify';
import DueDateInput from './DueDateInput';
import { getUserLeaveStatus, getUserLeaveData, getUserLeaveAndHolidayData, checkLeaveConflict, toDateKey, isFullDayLeaveOrHoliday } from '../utils/leaveConflict';
import LeaveConflictModal from './LeaveConflictModal';

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

const AddTaskModal = ({ prefilledAssignee, clients, syntheticClients, taskCategories, currentUser, clientLogs, setClientLogs, onClose }) => {
  const allClients = [...(clients || []), ...(syntheticClients || [])];
  const [selectedClientId, setSelectedClientId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskComment, setTaskComment] = useState('');
  const [taskCategory, setTaskCategory] = useState('');
  const [taskDate] = useState(new Date());
  const [taskDueDate, setTaskDueDate] = useState(null);
  const [taskBillable, setTaskBillable] = useState(true);
  const [taskRepeat, setTaskRepeat] = useState('Monthly');
  const [estimatedHrs, setEstimatedHrs] = useState('');
  const [estimatedMins, setEstimatedMins] = useState('');
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [leaveConflict, setLeaveConflict] = useState(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const acknowledgedLeaveRef = useRef(null);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedClientId || !taskName.trim() || !taskCategory || !taskComment.trim()) {
      setError('Client, name, category and description are required.'); return;
    }
    const estHrs = parseInt(estimatedHrs || '0', 10) || 0;
    const estMins = parseInt(estimatedMins || '0', 10) || 0;
    const estimatedMs = (estHrs * 60 + estMins) > 0 ? (estHrs * 3600000 + estMins * 60000) : null;
    const newTask = {
      id: Date.now(),
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
      dueDate: taskDueDate ? format(taskDueDate, 'do MMM yyyy') : null,
      timerState: 'idle', timerStartedAt: null, elapsedMs: 0, timeTaken: null,
      qcEnabled: false, qcAssigneeId: null, qcAssigneeName: null, qcStatus: null, qcRating: null, qcFeedback: null, qcReviewedAt: null,
      departments: prefilledAssignee?.department ? [prefilledAssignee.department] : null,
      billable: selectedClientId === '__ethinos__' ? false : taskBillable,
      estimatedMs,
    };
    setClientLogs({ ...clientLogs, [selectedClientId]: [newTask, ...(clientLogs[selectedClientId] || [])] });

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
              <select value={taskRepeat} onChange={e => setTaskRepeat(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20">
                {REPEAT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
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
            <button type="submit" className="flex-1 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all">Add Task</button>
          </div>
        </form>
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

const MemberStats = ({ member, allMemberTasks, clients, syntheticClients, users, currentUser, clientLogs, setClientLogs, taskCategories }) => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [memberLeaveByDate, setMemberLeaveByDate] = useState({});
  const [leaveOpen, setLeaveOpen] = useState(true);

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

  const handleUpdateTask = useCallback((task, changes) => {
    if (!task.cid) return;
    const updated = (clientLogs[task.cid] || []).map(t => t.id === task.id ? { ...t, ...changes } : t);
    setClientLogs({ ...clientLogs, [task.cid]: updated });
    if (selectedTask?.id === task.id) setSelectedTask(prev => ({ ...prev, ...changes }));
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
        <button onClick={() => setShowAddTask(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-sm">
          <Plus size={13}/> Add Task
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1 space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {[{ label: 'Total', value: stats.total, color: 'text-slate-800' }, { label: 'Pending', value: stats.pending, color: 'text-orange-600' }, { label: 'WIP', value: stats.wip, color: 'text-blue-600' }, { label: 'Done', value: stats.done, color: 'text-emerald-600' }].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center"><p className="text-xl font-black text-red-600">{stats.overdue}</p><p className="text-[10px] text-slate-500 font-semibold mt-0.5">Overdue</p></div>
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
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
      </div>
      {selectedTask && (
        <div className="fixed inset-0 z-[800] flex items-center justify-end">
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setSelectedTask(null)}/>
          <div className="relative z-10 h-full w-full max-w-xl">
            <TaskDetailPanel task={selectedTask} currentUser={currentUser} users={users} canEdit={false} onClose={() => setSelectedTask(null)} onUpdate={(updated) => handleUpdateTask(selectedTask, updated)}/>
          </div>
        </div>
      )}
      {showAddTask && (
        <AddTaskModal prefilledAssignee={member} clients={clients} syntheticClients={syntheticClients} taskCategories={taskCategories} currentUser={currentUser} clientLogs={clientLogs} setClientLogs={setClientLogs} onClose={() => setShowAddTask(false)}/>
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

const MemberCard = ({ member, isSelected, onClick, leaveStatus }) => {
  const ls = leaveStatus || {};

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

  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm text-slate-700'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 ${isSelected ? 'bg-white/20 text-white' : `${avatarColor(member.name)} text-white`}`}>{initials(member.name)}</div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{member.name}</p>
          {member.department && <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>{member.department}</p>}
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
  taskCategories = [],
  hierarchyOrder = [],
  onOpenClient = () => {},
  onGoToApprovals = () => {},
}) => {
  const [drillStack, setDrillStack] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [deptFilter, setDeptFilter] = useState('all');
  const [leaveStatuses, setLeaveStatuses] = useState({});

  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const isBH = currentUser?.role === 'Business Head';
  const isCSMPM = CS_REPORT_ROLES.has(currentUser?.role);

  const effectiveHierarchyOrder = useMemo(() => (hierarchyOrder?.length > 0 ? hierarchyOrder : DEFAULT_STANDARD_TRACK), [hierarchyOrder]);

  const allDepartments = useMemo(() => {
    const depts = [...new Set(users.map(u => u.department).filter(Boolean))].sort();
    return depts;
  }, [users]);

  const allClients = useMemo(() => [...(clients || []), ...(syntheticClients || [])], [clients, syntheticClients]);

  const allTasksForUser = useCallback((userId) => {
    const result = [];
    Object.entries(clientLogs).forEach(([cid, tasks]) => {
      const clientObj = allClients.find(c => String(c.id) === String(cid));
      (tasks || []).forEach(t => { if (String(t.assigneeId) === String(userId)) result.push({ ...t, cid, cName: clientObj?.name || cid }); });
    });
    return result;
  }, [clientLogs, allClients]);

  const currentParent = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;

  const leftPanelGroups = useMemo(() => {
    const filterByDept = (members) => {
      if (deptFilter === 'all') return members;
      return members.filter(u => u.department === deptFilter);
    };
    const sortByName = (arr) => [...arr].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (isBH) {
      const csReports = sortByName(filterByDept(users.filter(u => String(u.managerId) === String(currentUser.id) && CS_REPORT_ROLES.has(u.role))));
      return [{ role: 'CSM / Project Manager', members: csReports, isDrillable: false }];
    }

    if (isCSMPM) {
      const direct = sortByName(filterByDept(users.filter(u => String(u.managerId) === String(currentUser.id))));
      return [{ role: 'Direct Reports', members: direct, isDrillable: false }];
    }

    if (isSuperAdmin && currentParent?.role === 'Business Head') {
      const csReports = sortByName(filterByDept(users.filter(u => String(u.managerId) === String(currentParent.id) && CS_REPORT_ROLES.has(u.role))));
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

    const directReports = users.filter(u => String(u.managerId) === String(rootId));
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
  }, [currentParent, isSuperAdmin, isBH, isCSMPM, users, currentUser, effectiveHierarchyOrder, deptFilter]);

  useEffect(() => {
    const allMembers = leftPanelGroups.flatMap(g => g.members || []);
    if (!allMembers.length) return;
    let cancelled = false;
    Promise.all(
      allMembers.map(m =>
        getUserLeaveStatus(String(m.id)).then(status => ({ id: String(m.id), status }))
      )
    ).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ id, status }) => { map[id] = status; });
      setLeaveStatuses(map);
    });
    return () => { cancelled = true; };
  }, [leftPanelGroups]);

  const canDrillSelected = useMemo(() => {
    if (!selectedMember) return false;
    if (isBH || isCSMPM) return false;
    if (currentParent?.role === 'Business Head') return false;
    return users.some(u => String(u.managerId) === String(selectedMember.id));
  }, [selectedMember, isBH, isCSMPM, currentParent, users]);

  const drillInto = () => {
    if (!selectedMember || !canDrillSelected) return;
    setDrillStack(prev => [...prev, selectedMember]);
    setSelectedMember(null);
  };

  const drillBack = (idx) => {
    setDrillStack(prev => prev.slice(0, idx));
    setSelectedMember(null);
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

  const unassignedTasks = useMemo(() => {
    const result = [];
    Object.entries(clientLogs).forEach(([cid, tasks]) => {
      const clientObj = allClients.find(c => String(c.id) === String(cid));
      (tasks || []).forEach(t => {
        if (!t.assigneeId && !t.archived && t.status !== 'Done') {
          result.push({ ...t, cid, cName: clientObj?.name || cid });
        }
      });
    });
    return result;
  }, [clientLogs, allClients]);

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
        const submittedRaw = t.qcSubmittedAt || t.date;
        const submitted = submittedRaw ? (typeof submittedRaw === 'number' ? new Date(submittedRaw) : parseDueDate(submittedRaw)) : null;
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

  if (!currentUser) return null;

  const showDeptFilter = allDepartments.length > 1;

  return (
    <div className="flex gap-4 h-full">
      <div className="w-72 flex-shrink-0 flex flex-col space-y-3">
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
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {leftPanelGroups.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
              <Users size={28} className="text-slate-300 mx-auto mb-2"/>
              <p className="text-xs text-slate-400">No team members found.</p>
            </div>
          )}
          {leftPanelGroups.map(({ role, members }) => (
            <div key={role} className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">{role}</p>
              {members.length === 0
                ? <EmptyLevelRow role={role}/>
                : members.map(member => (
                    <MemberCard key={member.id} member={member} isSelected={selectedMember?.id === member.id} onClick={() => setSelectedMember(member)} leaveStatus={leaveStatuses[String(member.id)]}/>
                  ))
              }
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
                  { label: 'Overdue', value: kpiMetrics.overdue, accent: 'text-red-600', bg: 'bg-red-50 border-red-100' },
                  { label: 'Due Today', value: kpiMetrics.dueToday, accent: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
                  { label: 'Awaiting QC', value: kpiMetrics.awaitingQC, accent: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
                  { label: 'QC Rejected', value: kpiMetrics.qcRejected, accent: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
                  { label: 'Unassigned', value: kpiMetrics.unassigned, accent: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
                  { label: 'No Due Date', value: kpiMetrics.missingDueDate, accent: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
                ].map(card => (
                  <div key={card.label} className={`rounded-xl border p-3 text-center ${card.bg}`}>
                    <p className={`text-2xl font-black ${card.accent}`}>{card.value}</p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-tight">{card.label}</p>
                  </div>
                ))}
              </div>

              {/* At-Risk Tasks */}
              {atRiskTasks.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-red-400" />
                    <h4 className="text-xs font-bold text-slate-700 flex-1">At-Risk Tasks</h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{atRiskTasks.length}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {atRiskTasks.map((t, idx) => {
                      const clientObj = allClients.find(c => String(c.id) === String(t.cid));
                      return (
                        <button
                          key={`ar-${t.cid}-${t.id}-${idx}`}
                          onClick={() => clientObj && onOpenClient(clientObj)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{t.name || t.comment}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{t.cName}</span>
                              {t.assigneeName && <span className="text-[10px] text-slate-400 truncate">· {t.assigneeName}</span>}
                              {t.dueDate && <span className="text-[10px] text-slate-400">· Due {t.dueDate}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {t.isOverdue ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{t.daysOverdue}d late</span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">Today</span>
                            )}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>{t.status}</span>
                          </div>
                        </button>
                      );
                    })}
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

              {/* Pending QC Reviews */}
              {pendingQCTasks.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={onGoToApprovals} className="w-full px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left">
                    <ClipboardCheck size={13} className="text-indigo-400" />
                    <h4 className="text-xs font-bold text-slate-700 flex-1">Pending QC Reviews</h4>
                    <span className="text-[10px] font-bold text-indigo-500">View all →</span>
                  </button>
                  <div className="divide-y divide-slate-50">
                    {pendingQCTasks.slice(0, 10).map((t, idx) => {
                      const submittedRaw = t.qcSubmittedAt || t.date;
                      const submittedLabel = submittedRaw
                        ? (() => { try { const d = typeof submittedRaw === 'number' ? new Date(submittedRaw) : parseDueDate(submittedRaw); return d ? format(d, 'dd MMM') : null; } catch { return null; } })()
                        : null;
                      return (
                        <div key={`qc-${t.cid}-${t.id}-${idx}`} className="flex items-center gap-2.5 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{t.name || t.comment}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{t.cName}</span>
                              {t.assigneeName && <span className="text-[10px] text-slate-400 truncate">· {t.assigneeName}</span>}
                              {submittedLabel && <span className="text-[10px] text-slate-400">· Submitted {submittedLabel}</span>}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${t.daysAge > 3 ? 'bg-red-100 text-red-600' : t.daysAge > 1 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                            {t.daysAge === 0 ? 'Today' : `${t.daysAge}d`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Missing Info */}
              {missingInfoTasks.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                    <Clock size={13} className="text-slate-400" />
                    <h4 className="text-xs font-bold text-slate-700 flex-1">Missing Info</h4>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{missingInfoTasks.length}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {missingInfoTasks.map((t, idx) => {
                      const clientObj = allClients.find(c => String(c.id) === String(t.cid));
                      return (
                        <button
                          key={`mi-${t.cid}-${t.id}-${idx}`}
                          onClick={() => clientObj && onOpenClient(clientObj)}
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

              {/* All-clear state */}
              {atRiskTasks.length === 0 && pendingQCTasks.length === 0 && missingInfoTasks.length === 0 && visibleMemberIds.size > 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                  <Users size={32} />
                  <p className="text-sm font-semibold mt-2">Team is on track</p>
                  <p className="text-xs mt-1 text-slate-400">No overdue, QC, or missing info issues</p>
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
