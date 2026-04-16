import React, { useState, useMemo, useCallback } from 'react';
import { Users, ChevronRight, ChevronLeft, Plus, X, Search, Star, ArrowUp, ArrowDown } from 'lucide-react';
import { format, isBefore, isAfter, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import TaskDetailPanel from './TaskDetailPanel';

const ROLE_RANK = {
  'Super Admin': 0,
  'Director': 1,
  'Business Head': 2,
  'Snr Manager': 3,
  'Manager': 4,
  'Project Manager': 4,
  'CSM': 4,
  'Asst Manager': 5,
  'Snr Executive': 6,
  'Executive': 7,
  'Employee': 8,
  'Intern': 9,
};

const DEFAULT_STANDARD_TRACK = ['Director', 'Snr Manager', 'Manager', 'Asst Manager', 'Snr Executive', 'Executive', 'Employee', 'Intern'];
const CS_REPORT_ROLES = new Set(['CSM', 'Project Manager', 'PM/CSM']);

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

const getSubtreeIds = (userId, users, visited = new Set()) => {
  if (visited.has(String(userId))) return [];
  visited.add(String(userId));
  const direct = users.filter(u => String(u.managerId) === String(userId));
  return [String(userId), ...direct.flatMap(u => getSubtreeIds(u.id, users, visited))];
};

const getLevelsToShow = (parentRole, effectiveHierarchyOrder) => {
  const idx = effectiveHierarchyOrder.indexOf(parentRole);
  if (idx < 0) return effectiveHierarchyOrder;
  return effectiveHierarchyOrder.slice(idx + 1);
};

const buildLevelGroups = (rootId, parentRole, users, effectiveHierarchyOrder, canDrill) => {
  const subtreeIds = new Set(getSubtreeIds(rootId, users));
  subtreeIds.delete(String(rootId));
  const levelsToShow = getLevelsToShow(parentRole, effectiveHierarchyOrder);
  return levelsToShow.map(role => ({
    role,
    members: users.filter(u => subtreeIds.has(String(u.id)) && u.role === role).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    canDrill,
  }));
};

const AddTaskModal = ({ prefilledAssignee, clients, syntheticClients, taskCategories, currentUser, clientLogs, setClientLogs, onClose }) => {
  const allClients = [...(clients || []), ...(syntheticClients || [])];
  const [selectedClientId, setSelectedClientId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskComment, setTaskComment] = useState('');
  const [taskCategory, setTaskCategory] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(null);
  const [taskBillable, setTaskBillable] = useState(true);
  const [estimatedHrs, setEstimatedHrs] = useState('');
  const [estimatedMins, setEstimatedMins] = useState('');
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const filteredClients = allClients.filter(c => !clientSearch.trim() || (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()));
  const selectedClient = allClients.find(c => String(c.id) === String(selectedClientId));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedClientId || !taskName.trim() || !taskCategory || !taskComment.trim() || !taskDueDate) {
      setError('All fields are required.'); return;
    }
    const estHrs = parseInt(estimatedHrs || '0', 10) || 0;
    const estMins = parseInt(estimatedMins || '0', 10) || 0;
    const estimatedMs = (estHrs * 60 + estMins) > 0 ? (estHrs * 3600000 + estMins * 60000) : null;
    const newTask = {
      id: Date.now(),
      name: taskName.trim(),
      date: format(new Date(), 'do MMM yyyy'),
      comment: taskComment.trim(),
      result: '',
      status: 'Pending',
      assigneeId: prefilledAssignee?.id || null,
      assigneeName: prefilledAssignee?.name || null,
      creatorId: currentUser?.id || null,
      creatorName: currentUser?.name || 'Unassigned',
      creatorRole: currentUser?.role || '',
      category: taskCategory,
      repeatFrequency: 'Monthly',
      dueDate: format(taskDueDate, 'do MMM yyyy'),
      timerState: 'idle', timerStartedAt: null, elapsedMs: 0, timeTaken: null,
      qcEnabled: false, qcAssigneeId: null, qcAssigneeName: null, qcStatus: null, qcRating: null, qcFeedback: null, qcReviewedAt: null,
      departments: prefilledAssignee?.department ? [prefilledAssignee.department] : null,
      billable: selectedClientId === '__ethinos__' ? false : taskBillable,
      estimatedMs,
    };
    setClientLogs({ ...clientLogs, [selectedClientId]: [newTask, ...(clientLogs[selectedClientId] || [])] });
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
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Category *</label>
            <select value={taskCategory} onChange={e => setTaskCategory(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20">
              <option value="">Select category…</option>
              {(taskCategories || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Description *</label><textarea value={taskComment} onChange={e => setTaskComment(e.target.value)} rows={3} placeholder="Describe the task…" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20 resize-none"/></div>
          <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Due Date *</label><DatePicker selected={taskDueDate} onChange={setTaskDueDate} dateFormat="d MMM yyyy" placeholderText="Pick due date…" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20"/></div>
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
  const now = Date.now();

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
    const overdue = base.filter(t => { if (t.status === 'Done') return false; const d = parseDueDate(t.dueDate); return d && isBefore(d, new Date()); });
    const rated = done.filter(t => t.qcRating);
    const avgQc = rated.length > 0 ? (rated.reduce((s, t) => s + t.qcRating, 0) / rated.length).toFixed(1) : null;
    let billableMs = 0, nonBillableMs = 0, aboveEst = 0, belowEst = 0;
    base.forEach(t => {
      const ms = getElapsed(t, now);
      if (t.billable !== false) billableMs += ms; else nonBillableMs += ms;
      if (t.estimatedMs) { if (ms > t.estimatedMs) aboveEst++; else belowEst++; }
    });
    return { total: base.length, done: done.length, wip: wip.length, pending: pending.length, overdue: overdue.length, avgQc, billableMs, nonBillableMs, aboveEst, belowEst };
  }, [allMemberTasks, now]);

  const clientHourSplit = useMemo(() => {
    const map = {};
    allMemberTasks.filter(t => !t.archived).forEach(t => {
      const ms = getElapsed(t, now);
      if (!map[t.cid]) map[t.cid] = { name: t.cName || t.cid, ms: 0, count: 0 };
      map[t.cid].ms += ms; map[t.cid].count++;
    });
    return Object.values(map).sort((a, b) => b.ms - a.ms);
  }, [allMemberTasks, now]);

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
        {clientHourSplit.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100"><h4 className="text-xs font-bold text-slate-700">Client Hour Split</h4></div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="px-4 py-2 text-left text-slate-500 font-semibold">Client</th><th className="px-4 py-2 text-right text-slate-500 font-semibold">Hours</th><th className="px-4 py-2 text-right text-slate-500 font-semibold">Tasks</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {clientHourSplit.map(row => (<tr key={row.name} className="hover:bg-slate-50 transition-colors"><td className="px-4 py-2 text-slate-700 font-medium">{row.name}</td><td className="px-4 py-2 text-right text-slate-600">{fmtMs(row.ms)}</td><td className="px-4 py-2 text-right text-slate-500">{row.count}</td></tr>))}
              </tbody>
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
          {tasks.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8">No tasks match the filters.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {tasks.map(task => {
                const elapsed = getElapsed(task, now);
                const over = task.estimatedMs && elapsed > task.estimatedMs;
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
                      <span>{fmtMs(elapsed)} logged</span>
                      {task.estimatedMs && <span className={over ? 'text-red-500' : 'text-emerald-500'}>{over ? <ArrowUp size={9} className="inline"/> : <ArrowDown size={9} className="inline"/>}{' est. '}{fmtMs(task.estimatedMs)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {selectedTask && (
        <div className="fixed inset-0 z-[800] flex items-center justify-end">
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setSelectedTask(null)}/>
          <div className="relative z-10 h-full w-full max-w-xl">
            <TaskDetailPanel task={selectedTask} currentUser={currentUser} users={users} canEdit={true} onClose={() => setSelectedTask(null)} onUpdate={(updated) => handleUpdateTask(selectedTask, updated)}/>
          </div>
        </div>
      )}
      {showAddTask && (
        <AddTaskModal prefilledAssignee={member} clients={clients} syntheticClients={syntheticClients} taskCategories={taskCategories} currentUser={currentUser} clientLogs={clientLogs} setClientLogs={setClientLogs} onClose={() => setShowAddTask(false)}/>
      )}
    </div>
  );
};

const MemberCard = ({ member, isSelected, onClick }) => (
  <button onClick={onClick}
    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm text-slate-700'}`}>
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 ${isSelected ? 'bg-white/20 text-white' : `${avatarColor(member.name)} text-white`}`}>{initials(member.name)}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{member.name}</p>
        {member.department && <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>{member.department}</p>}
      </div>
    </div>
  </button>
);

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
}) => {
  const [drillStack, setDrillStack] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);

  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const isBH = currentUser?.role === 'Business Head';
  const isCSMPM = CS_REPORT_ROLES.has(currentUser?.role);

  const effectiveHierarchyOrder = useMemo(() => (hierarchyOrder?.length > 0 ? hierarchyOrder : DEFAULT_STANDARD_TRACK), [hierarchyOrder]);

  const allTasksForUser = useCallback((userId) => {
    const result = [];
    Object.entries(clientLogs).forEach(([cid, tasks]) => {
      const clientObj = [...clients, ...syntheticClients].find(c => String(c.id) === String(cid));
      (tasks || []).forEach(t => { if (String(t.assigneeId) === String(userId)) result.push({ ...t, cid, cName: clientObj?.name || cid }); });
    });
    return result;
  }, [clientLogs, clients, syntheticClients]);

  const currentParent = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;

  const leftPanelGroups = useMemo(() => {
    if (isBH) {
      const csReports = users.filter(u => String(u.managerId) === String(currentUser.id) && CS_REPORT_ROLES.has(u.role)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return [{ role: 'CSM / Project Manager', members: csReports, isDrillable: false }];
    }

    if (isCSMPM) {
      const direct = users.filter(u => String(u.managerId) === String(currentUser.id)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      if (direct.length === 0) return [];
      return [{ role: 'Direct Reports', members: direct, isDrillable: false }];
    }

    if (isSuperAdmin && currentParent?.role === 'Business Head') {
      const csReports = users.filter(u => String(u.managerId) === String(currentParent.id) && CS_REPORT_ROLES.has(u.role)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return [{ role: 'CSM / Project Manager', members: csReports, isDrillable: false }];
    }

    if (isSuperAdmin && !currentParent) {
      const bhGroup = { role: 'Business Head', members: users.filter(u => u.role === 'Business Head').sort((a, b) => (a.name || '').localeCompare(b.name || '')), isDrillable: true };
      const standardGroups = effectiveHierarchyOrder.map(role => ({
        role,
        members: users.filter(u => u.role === role).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        isDrillable: true,
      }));
      return [bhGroup, ...standardGroups];
    }

    const rootId = currentParent ? currentParent.id : currentUser?.id;
    const parentRole = currentParent ? currentParent.role : currentUser?.role;
    return buildLevelGroups(rootId, parentRole, users, effectiveHierarchyOrder, true);
  }, [currentParent, isSuperAdmin, isBH, isCSMPM, users, currentUser, effectiveHierarchyOrder]);

  const canDrillSelected = useMemo(() => {
    if (!selectedMember) return false;
    if (isBH || isCSMPM) return false;
    if (currentParent?.role === 'Business Head') return false;
    if (selectedMember.role === 'Business Head' && !isSuperAdmin) return false;
    return users.some(u => String(u.managerId) === String(selectedMember.id));
  }, [selectedMember, isBH, isCSMPM, isSuperAdmin, currentParent, users]);

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

  if (!currentUser) return null;

  return (
    <div className="flex gap-4 h-full">
      <div className="w-72 flex-shrink-0 flex flex-col space-y-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
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
                    <MemberCard key={member.id} member={member} isSelected={selectedMember?.id === member.id} onClick={() => setSelectedMember(member)}/>
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
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-300">
            <Users size={40}/>
            <p className="text-sm font-semibold">Select a team member to view their stats</p>
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
