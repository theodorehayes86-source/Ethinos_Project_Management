import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronRight, ChevronLeft, AlertTriangle, CheckCircle, Star, Users, Plus, Tag, Calendar, Clock, X, ChevronDown, ChevronUp, ShieldCheck, Info } from 'lucide-react';
import ApproveSheet from './ApproveSheet.jsx';
import TaskDetailSheet from './TaskDetailSheet.jsx';
import AddTaskSheet from './AddTaskSheet.jsx';
import {
  getDirectReports,
  getSubtreeIds,
  getUserTaskStats,
  getSubtreeStats,
} from '../hooks/useFirebaseData.js';
import { isTaskOverdue, isTaskLeaveAwareOverdue, getLeaveAndHolidayData, getLeaveDataForUser, getLeaveStatus } from '../utils/taskUtils.js';

const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function RollupBadge({ label, value, red }) {
  if (!value) return null;
  return (
    <div className="text-center">
      <p className={`text-base font-black ${red ? 'text-red-500' : 'text-indigo-600'}`}>{value}</p>
      <p className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function parseDueDateLocal(str) {
  if (!str) return null;
  try {
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const m = str.match(/(\d+)[a-z]*\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]));
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function toDateKey(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

const TASK_STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700',
  WIP: 'bg-blue-100 text-blue-700',
  Done: 'bg-emerald-100 text-emerald-700',
};

function PersonTaskSheet({ user, tasks, onClose, onTaskClick }) {
  const today = tasks.filter(t => {
    const d = new Date(t.dueDate);
    const now = new Date(); now.setHours(0,0,0,0);
    const end = new Date(now); end.setHours(23,59,59,999);
    return d >= now && d <= end;
  });
  const overdue = tasks.filter(t => {
    const d = new Date(t.dueDate);
    const now = new Date(); now.setHours(0,0,0,0);
    return d < now && t.status !== 'Done';
  });

  const pending = tasks.filter(t => t.status === 'Pending' && !overdue.includes(t) && !today.includes(t));
  const sections = [
    { label: 'Overdue', items: overdue, accent: 'text-red-500', icon: <AlertTriangle size={12} className="text-red-400" /> },
    { label: 'Due Today', items: today, accent: 'text-indigo-600', icon: <Clock size={12} className="text-indigo-400" /> },
    { label: 'Pending', items: pending.slice(0, 10), accent: 'text-amber-600', icon: <Clock size={12} className="text-amber-400" /> },
    { label: 'All Tasks', items: tasks.filter(t => !today.includes(t) && !overdue.includes(t) && !pending.includes(t)).slice(0, 10), accent: 'text-slate-500', icon: <Calendar size={12} className="text-slate-400" /> },
  ].filter(s => s.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Tasks</p>
            <h2 className="text-base font-bold text-slate-900">{user.name}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
            <X size={16} className="text-slate-600" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tasks.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No tasks assigned</p>
            </div>
          )}
          {sections.map(({ label, items, accent, icon }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 mb-2">
                {icon}
                <span className={`text-xs font-black uppercase tracking-widest ${accent}`}>{label}</span>
                <span className="ml-auto text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(t => {
                  const taskOverdue = isTaskOverdue(t);
                  return (
                    <button
                      key={`${t._clientId}-${t.id}`}
                      onClick={() => { onTaskClick(t); onClose(); }}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border bg-white hover:border-indigo-200 text-left transition-colors ${taskOverdue ? 'border-red-200' : 'border-slate-200'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{t.name || t.comment}</p>
                        {t._clientName && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Tag size={9} /> {t._clientName}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 mt-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TASK_STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                          {t.status || 'Pending'}
                        </span>
                        {taskOverdue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-0.5">
                            <AlertTriangle size={9} /> Overdue
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterBadge({ label, value, active, red, onClick }) {
  if (!value) return null;
  const base = active
    ? (red ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white')
    : (red ? 'text-red-500 hover:bg-red-50' : 'text-indigo-600 hover:bg-indigo-50');
  return (
    <button onClick={onClick} className={`text-center px-2 py-0.5 rounded-lg transition-colors ${base}`}>
      <p className="text-base font-black leading-none">{value}</p>
      <p className="text-[9px] uppercase tracking-wide leading-tight mt-0.5">{label}</p>
    </button>
  );
}

function TaskRow({ task, onTaskClick }) {
  const overdue = isTaskOverdue(task);
  return (
    <button
      onClick={() => onTaskClick(task)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border bg-white text-left active:bg-slate-50 transition-colors ${overdue ? 'border-red-200' : 'border-slate-100'}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === 'Done' ? 'bg-emerald-500' : task.status === 'WIP' ? 'bg-blue-500' : 'bg-amber-400'}`} />
      <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{task.name || task.comment}</span>
      {task._clientName && <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[80px]">· {task._clientName}</span>}
      {overdue && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
    </button>
  );
}

function PersonCard({ user, clientLogs, clients, users, allUsers, onDrillIn, onTaskClick }) {
  const personal = getUserTaskStats(user.id, clientLogs, clients);
  const team     = getSubtreeStats(user.id, allUsers, clientLogs, clients);
  const reports  = getDirectReports(user.id, allUsers);
  const hasTeam  = reports.length > 0;
  const [showTaskSheet, setShowTaskSheet] = useState(false);
  const [taskFilter, setTaskFilter] = useState(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [leaveByDate, setLeaveByDate] = useState({});

  useEffect(() => {
    let cancelled = false;
    getLeaveAndHolidayData(String(user.id)).then(data => { if (!cancelled) setLeaveByDate(data); });
    return () => { cancelled = true; };
  }, [user.id]);

  const leaveAwareOverdueTasks = personal.overdueTasks.filter(t => isTaskLeaveAwareOverdue(t, undefined, leaveByDate));
  const leaveStatusInfo = getLeaveStatus(leaveByDate);
  const leaveStatus = leaveStatusInfo.status;
  const leaveDate = leaveStatusInfo.date;
  const overridePersonal = { ...personal, overdue: leaveAwareOverdueTasks.length, overdueTasks: leaveAwareOverdueTasks };

  const toggleFilter = (f) => setTaskFilter(v => v === f ? null : f);

  const filteredTasks = taskFilter === 'pending'
    ? overridePersonal.pendingTasks
    : taskFilter === 'today'
    ? overridePersonal.todayTasks
    : taskFilter === 'overdue'
    ? overridePersonal.overdueTasks
    : taskFilter === 'awaitingQC'
    ? overridePersonal.pendingQCTasks
    : null;

  const otherTasks = overridePersonal.allTasks.filter(t =>
    !overridePersonal.todayTasks.includes(t) &&
    !overridePersonal.overdueTasks.includes(t) &&
    !overridePersonal.pendingTasks.includes(t)
  );

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          className="w-full px-4 py-4 flex items-center gap-3 text-left active:bg-slate-50 transition-colors"
          onClick={() => hasTeam ? onDrillIn(user) : setShowTaskSheet(true)}
        >
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 relative">
            <span className="text-indigo-700 font-black text-sm">{initials(user.name)}</span>
            {leaveStatus === 'on_leave' && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-orange-400 border-2 border-white" title="On Leave" />
            )}
            {leaveStatus === 'leave_soon' && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-300 border-2 border-white" title="Leave Soon" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
              {leaveStatus === 'on_leave' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  On Leave
                </span>
              )}
              {leaveStatus === 'leave_soon' && leaveDate && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Leave {new Date(leaveDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">{user.role}</p>
            {overridePersonal.avgRating && (
              <span className="flex items-center gap-0.5 text-[11px] text-amber-500 font-bold mt-0.5">
                <Star size={10} className="fill-amber-400" /> {overridePersonal.avgRating.toFixed(1)}/10
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <FilterBadge label="Pending" value={overridePersonal.pending} active={taskFilter === 'pending'} onClick={() => toggleFilter('pending')} />
            <FilterBadge label="Today"   value={overridePersonal.today}   active={taskFilter === 'today'}   onClick={() => toggleFilter('today')} />
            {overridePersonal.overdue > 0 && <FilterBadge label="Overdue" value={overridePersonal.overdue} red active={taskFilter === 'overdue'} onClick={() => toggleFilter('overdue')} />}
            {overridePersonal.pendingQC > 0 && <FilterBadge label="QC" value={overridePersonal.pendingQC} active={taskFilter === 'awaitingQC'} onClick={() => toggleFilter('awaitingQC')} />}
            {hasTeam && (
              <button onClick={() => onDrillIn(user)} className="flex flex-col items-center ml-1">
                <ChevronRight size={16} className="text-slate-300" />
                <span className="text-[9px] text-slate-400 uppercase tracking-wide">Team</span>
              </button>
            )}
          </div>
        </button>

        {filteredTasks && filteredTasks.length > 0 && (
          <div className="border-t border-slate-100 px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 mb-1">
              {taskFilter === 'pending' ? 'Pending Tasks' : taskFilter === 'today' ? 'Due Today' : taskFilter === 'awaitingQC' ? 'Awaiting QC' : 'Overdue Tasks'}
            </p>
            {filteredTasks.map(t => <TaskRow key={`${t._clientId}-${t.id}`} task={t} onTaskClick={onTaskClick} />)}
          </div>
        )}
        {filteredTasks && filteredTasks.length === 0 && (
          <div className="border-t border-slate-100 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">No {taskFilter} tasks</p>
          </div>
        )}

        {overridePersonal.allTasks.length > 0 && (
          <div className="border-t border-slate-100">
            <button
              onClick={() => setShowAllTasks(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">All Tasks</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{overridePersonal.allTasks.length}</span>
                {showAllTasks ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
              </div>
            </button>
            {showAllTasks && (
              <div className="px-3 pb-3 space-y-1.5">
                {overridePersonal.allTasks.map(t => <TaskRow key={`all-${t._clientId}-${t.id}`} task={t} onTaskClick={onTaskClick} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {showTaskSheet && (
        <PersonTaskSheet
          user={user}
          tasks={overridePersonal.allTasks}
          onClose={() => setShowTaskSheet(false)}
          onTaskClick={onTaskClick}
        />
      )}
    </>
  );
}

function KpiChipRow({ overdue, dueToday, awaitingQC, missingInfo, onScrollTo }) {
  const chips = [
    overdue > 0 && { label: 'Overdue', value: overdue, target: 'atRisk', bg: 'bg-red-50', border: 'border-red-100', valueCls: 'text-red-500', labelCls: 'text-red-400' },
    dueToday > 0 && { label: 'Due Today', value: dueToday, target: 'atRisk', bg: 'bg-indigo-50', border: 'border-indigo-100', valueCls: 'text-indigo-600', labelCls: 'text-indigo-400' },
    awaitingQC > 0 && { label: 'Awaiting QC', value: awaitingQC, target: 'atRisk', bg: 'bg-amber-50', border: 'border-amber-100', valueCls: 'text-amber-600', labelCls: 'text-amber-400' },
    missingInfo > 0 && { label: 'Missing Info', value: missingInfo, target: 'missingInfo', bg: 'bg-slate-50', border: 'border-slate-200', valueCls: 'text-slate-600', labelCls: 'text-slate-400' },
  ].filter(Boolean);

  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
      {chips.map(chip => (
        <button
          key={chip.label}
          onClick={() => onScrollTo(chip.target)}
          className={`flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl ${chip.bg} border ${chip.border} min-h-[44px] min-w-[76px] active:opacity-70 transition-opacity`}
        >
          <span className={`text-base font-black leading-none ${chip.valueCls}`}>{chip.value}</span>
          <span className={`text-[9px] uppercase tracking-wide mt-0.5 ${chip.labelCls}`}>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

function PersonAtRiskCard({ user, tasks, isOnLeave, accent, onTaskClick }) {
  const red = accent === 'red';
  const c = red
    ? { bg: 'bg-red-50', border: 'border-red-100', avatar: 'bg-red-200', avatarText: 'text-red-700', name: 'text-red-800', countBg: 'bg-red-100', countText: 'text-red-500', rowHover: 'hover:bg-red-100', taskText: 'text-red-700' }
    : { bg: 'bg-indigo-50', border: 'border-indigo-100', avatar: 'bg-indigo-200', avatarText: 'text-indigo-700', name: 'text-indigo-800', countBg: 'bg-indigo-100', countText: 'text-indigo-500', rowHover: 'hover:bg-indigo-100', taskText: 'text-indigo-700' };
  const icon = red
    ? <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />
    : <Clock size={10} className="text-indigo-400 flex-shrink-0" />;

  return (
    <div className={`${c.bg} rounded-2xl border ${c.border} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 rounded-full ${c.avatar} flex items-center justify-center flex-shrink-0`}>
          <span className={`${c.avatarText} font-black text-[10px]`}>{initials(user.name)}</span>
        </div>
        <p className={`text-xs font-bold ${c.name}`}>{user.name}</p>
        {isOnLeave && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">On Leave</span>
        )}
        <span className={`ml-auto text-[10px] font-bold ${c.countText} ${c.countBg} px-1.5 py-0.5 rounded-full`}>
          {tasks.length} {red ? 'overdue' : 'due today'}
        </span>
      </div>
      <div className="space-y-1">
        {tasks.map(t => (
          <button
            key={`${t._clientId}-${t.id}`}
            onClick={() => onTaskClick(t)}
            className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-xl ${c.rowHover} transition-colors min-h-[44px]`}
          >
            {icon}
            <span className={`text-xs ${c.taskText} font-medium flex-1 truncate`}>{t.name || t.comment}</span>
            {t._clientName && <span className={`text-[10px] ${c.countText} flex-shrink-0 truncate max-w-[80px]`}>{t._clientName}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function AtRiskSection({ currentUser, users, clientLogs, clients, onTaskClick, leaveByUser, sectionRef }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
  const todayKey = toDateKey(today);

  const subtreeIds = getSubtreeIds(currentUser.id, users);
  subtreeIds.delete(String(currentUser.id));

  const overdueByPerson = [];
  const dueTodayByPerson = [];

  subtreeIds.forEach(uid => {
    const user = users.find(u => String(u.id) === uid);
    if (!user) return;
    const stats = getUserTaskStats(uid, clientLogs, clients);
    const ld = leaveByUser[uid] || {};
    const isOnLeave = !!ld[todayKey];
    const filteredOverdue = stats.overdueTasks.filter(t => isTaskLeaveAwareOverdue(t, undefined, ld));
    if (filteredOverdue.length > 0) overdueByPerson.push({ user, tasks: filteredOverdue, isOnLeave });
    const filteredToday = stats.todayTasks.filter(t => t.status !== 'Done' && !t.archived);
    if (filteredToday.length > 0) dueTodayByPerson.push({ user, tasks: filteredToday, isOnLeave });
  });

  const totalCount = overdueByPerson.reduce((s, p) => s + p.tasks.length, 0)
    + dueTodayByPerson.reduce((s, p) => s + p.tasks.length, 0);

  return (
    <div ref={sectionRef}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={13} className={totalCount > 0 ? 'text-red-400' : 'text-slate-300'} />
        <h3 className={`text-xs font-black uppercase tracking-widest ${totalCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>At Risk</h3>
        <span className={`ml-auto text-xs font-bold rounded-full px-2 py-0.5 ${totalCount > 0 ? 'text-red-400 bg-red-50' : 'text-slate-400 bg-slate-100'}`}>{totalCount}</span>
      </div>

      {totalCount === 0 && (
        <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-emerald-50 border border-emerald-100">
          <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
          <p className="text-xs text-emerald-600 font-medium">All team members are on track</p>
        </div>
      )}

      {overdueByPerson.length > 0 && (
        <div className={dueTodayByPerson.length > 0 ? 'mb-4' : ''}>
          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2 px-1">Overdue</p>
          <div className="space-y-2">
            {overdueByPerson.map(({ user, tasks, isOnLeave }) => (
              <PersonAtRiskCard key={user.id} user={user} tasks={tasks} isOnLeave={isOnLeave} accent="red" onTaskClick={onTaskClick} />
            ))}
          </div>
        </div>
      )}

      {dueTodayByPerson.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 px-1">Due Today</p>
          <div className="space-y-2">
            {dueTodayByPerson.map(({ user, tasks, isOnLeave }) => (
              <PersonAtRiskCard key={user.id} user={user} tasks={tasks} isOnLeave={isOnLeave} accent="indigo" onTaskClick={onTaskClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MissingInfoSection({ subtreeTasks, unassignedTasks, onTaskClick, sectionRef }) {
  const [open, setOpen] = useState(true);

  const missingTasks = useMemo(() => {
    const noAssignee = unassignedTasks;
    const noDueDate = subtreeTasks.filter(t => !t.archived && t.status !== 'Done' && !t.dueDate);
    const seen = new Set();
    return [...noAssignee, ...noDueDate].filter(t => {
      const key = `${t._clientId}-${t.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  }, [subtreeTasks, unassignedTasks]);

  return (
    <div ref={sectionRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 mb-2 py-1 min-h-[44px]"
      >
        <Info size={13} className="text-amber-400" />
        <h3 className="text-xs font-black text-amber-600 uppercase tracking-widest flex-1 text-left">Missing Info</h3>
        <span className="text-xs font-bold text-amber-500 bg-amber-50 rounded-full px-2 py-0.5">{missingTasks.length}</span>
        {open ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
      </button>
      {open && (
        missingTasks.length === 0 ? (
          <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-emerald-600 font-medium">All tasks have assignees and due dates</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {missingTasks.map(t => (
              <button
                key={`${t._clientId}-${t.id}`}
                onClick={() => onTaskClick(t)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-100 bg-amber-50 text-left active:bg-amber-100 transition-colors min-h-[44px]"
              >
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${!t.assigneeId ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                  {!t.assigneeId ? 'No Assignee' : 'No Due Date'}
                </span>
                <span className="text-xs text-slate-700 font-medium flex-1 truncate">{t.name || t.comment}</span>
                {t._clientName && <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[70px]">{t._clientName}</span>}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function LeaveConflictsSection({ subtreeTasks, leaveByUser, users, onTaskClick, sectionRef }) {
  const [open, setOpen] = useState(true);

  const conflicts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sevenDaysLater = new Date(today); sevenDaysLater.setDate(today.getDate() + 7);
    const todayKey = toDateKey(today);

    return subtreeTasks
      .filter(t => !t.archived && t.status !== 'Done' && t.dueDate && t.assigneeId)
      .map(t => {
        const due = parseDueDateLocal(t.dueDate);
        if (!due || due < today || due > sevenDaysLater) return null;
        const dueKey = toDateKey(due);
        const ld = leaveByUser[String(t.assigneeId)] || {};
        const conflictDate = Object.keys(ld)
          .filter(dk => dk >= todayKey && dk <= dueKey)
          .sort()
          .find(dk => {
            const rec = ld[dk];
            return rec && !rec.name && rec.status && rec.status !== 'pending';
          });
        if (!conflictDate) return null;
        const badge = conflictDate === dueKey ? 'Leave on Due Date' : 'On Leave';
        return { ...t, due, dueKey, badge };
      })
      .filter(Boolean)
      .sort((a, b) => a.due - b.due);
  }, [subtreeTasks, leaveByUser]);

  return (
    <div ref={sectionRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 mb-2 py-1 min-h-[44px]"
      >
        <Calendar size={13} className="text-rose-400" />
        <h3 className="text-xs font-black text-rose-600 uppercase tracking-widest flex-1 text-left">Leave Conflicts</h3>
        <span className="text-xs font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">{conflicts.length}</span>
        {open ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
      </button>
      {open && (
        conflicts.length === 0 ? (
          <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-emerald-600 font-medium">No upcoming conflicts</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {conflicts.map(t => {
              const member = users.find(u => String(u.id) === String(t.assigneeId));
              const memberName = member?.name || 'Unknown';
              return (
                <button
                  key={`${t._clientId}-${t.id}`}
                  onClick={() => onTaskClick(t)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-100 bg-rose-50 text-left active:bg-rose-100 transition-colors min-h-[44px]"
                >
                  <div className="w-7 h-7 rounded-full bg-rose-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-rose-700 font-black text-[9px]">{initials(memberName)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight">{t.name || t.comment}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{memberName} · {t._clientName} · {t.dueKey}</p>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 flex-shrink-0 whitespace-nowrap">{t.badge}</span>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function ApprovalsTab({ pendingApprovals, clientLogs, onApprove }) {
  if (pendingApprovals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle size={44} className="text-emerald-300 mb-3" />
        <p className="text-slate-500 font-semibold">No pending approvals</p>
        <p className="text-xs text-slate-400 mt-1">All tasks have been reviewed</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingApprovals.map((task, i) => (
        <div key={`${task._clientId}-${task.id}-${i}`} className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Star size={16} className="text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{task.name || task.comment}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
                {task._clientName && <span className="flex items-center gap-1"><Tag size={10} />{task._clientName}</span>}
                {task.dueDate && <span className="flex items-center gap-1"><Calendar size={10} />{task.dueDate}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => onApprove(task)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold min-h-[44px]"
          >
            <Star size={14} /> Review & Rate
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ManagerDashboard({
  currentUser, users, clients, clientLogs, categories,
  pendingApprovals, activeTab, onTabChange,
}) {
  const [drillStack, setDrillStack] = useState([]);
  const [approvingTask, setApprovingTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAllDrillTasks, setShowAllDrillTasks] = useState(false);
  const [leaveByUser, setLeaveByUser] = useState({});

  const scrollContainerRef = useRef(null);
  const atRiskRef = useRef(null);
  const missingInfoRef = useRef(null);

  const viewUser = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;
  const displayUser = viewUser || currentUser;
  const directReports = getDirectReports(displayUser.id, users);

  const drillIn  = (user) => { setDrillStack(s => [...s, user]); setShowAllDrillTasks(false); };
  const drillOut = () => { setDrillStack(s => s.slice(0, -1)); setShowAllDrillTasks(false); };

  const drillPersonalStats = viewUser ? getUserTaskStats(viewUser.id, clientLogs, clients) : null;

  const subtreeIds = useMemo(() => {
    const ids = getSubtreeIds(currentUser.id, users);
    ids.delete(String(currentUser.id));
    return ids;
  }, [currentUser.id, users]);

  useEffect(() => {
    if (drillStack.length > 0 || subtreeIds.size === 0) return;
    let cancelled = false;
    Promise.all([...subtreeIds].map(uid => getLeaveAndHolidayData(uid).then(d => [uid, d]))).then(entries => {
      if (!cancelled) setLeaveByUser(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [clientLogs, subtreeIds, drillStack.length]);

  const subtreeTasks = useMemo(() => {
    if (drillStack.length > 0) return [];
    const tasks = [];
    Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
      const client = clients.find(c => String(c.id) === String(clientId));
      (logs || []).forEach(task => {
        if (subtreeIds.has(String(task.assigneeId))) {
          tasks.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
        }
      });
    });
    return tasks;
  }, [clientLogs, clients, subtreeIds, drillStack.length]);

  const unassignedTasks = useMemo(() => {
    if (drillStack.length > 0) return [];
    const tasks = [];
    Object.entries(clientLogs || {}).forEach(([clientId, logs]) => {
      const client = clients.find(c => String(c.id) === String(clientId));
      (logs || []).forEach(task => {
        if (!task.assigneeId && !task.archived && task.status !== 'Done') {
          tasks.push({ ...task, _clientId: clientId, _clientName: client?.name || clientId });
        }
      });
    });
    return tasks;
  }, [clientLogs, clients, drillStack.length]);

  const kpiCounts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
    let overdue = 0, dueToday = 0, awaitingQC = 0, missingInfo = 0;
    subtreeTasks.forEach(t => {
      if (t.archived || t.status === 'Done') return;
      const due = parseDueDateLocal(t.dueDate);
      if (due && due < today) overdue++;
      if (due && due >= today && due <= todayEnd) dueToday++;
      if (t.qcEnabled && t.qcStatus === 'sent') awaitingQC++;
      if (!t.dueDate) missingInfo++;
    });
    missingInfo += unassignedTasks.length;
    return { overdue, dueToday, awaitingQC, missingInfo };
  }, [subtreeTasks, unassignedTasks]);

  const scrollTo = (target) => {
    const el = target === 'atRisk' ? atRiskRef.current : target === 'missingInfo' ? missingInfoRef.current : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {activeTab === 'team' && (
        <>
          {drillStack.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-100 flex-shrink-0">
              <button
                onClick={drillOut}
                className="flex items-center gap-1 text-indigo-600 text-sm font-bold min-h-[44px] px-2"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <div className="flex items-center gap-1 overflow-x-auto flex-1 text-xs text-slate-400 font-medium">
                <span className="truncate text-slate-500">You</span>
                {drillStack.map((u, i) => (
                  <React.Fragment key={u.id}>
                    <ChevronRight size={12} className="flex-shrink-0" />
                    <span className={`truncate ${i === drillStack.length - 1 ? 'text-slate-800 font-bold' : 'text-slate-500'}`}>
                      {u.name.split(' ')[0]}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          <div className="p-4 space-y-4">
            {drillStack.length === 0 && (
              <KpiChipRow
                overdue={kpiCounts.overdue}
                dueToday={kpiCounts.dueToday}
                awaitingQC={kpiCounts.awaitingQC}
                missingInfo={kpiCounts.missingInfo}
                onScrollTo={scrollTo}
              />
            )}

            {drillStack.length === 0 && (
              <AtRiskSection
                currentUser={currentUser}
                users={users}
                clientLogs={clientLogs}
                clients={clients}
                onTaskClick={setSelectedTask}
                leaveByUser={leaveByUser}
                sectionRef={atRiskRef}
              />
            )}

            {drillPersonalStats && (
              <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-700 font-black text-xs">{initials(viewUser.name)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-900">{viewUser.name}'s Tasks</p>
                    <p className="text-xs text-indigo-500">{viewUser.role}</p>
                  </div>
                  <div className="ml-auto flex gap-3">
                    <RollupBadge label="Pending" value={drillPersonalStats.pending} />
                    <RollupBadge label="Today" value={drillPersonalStats.today} />
                    <RollupBadge label="Overdue" value={drillPersonalStats.overdue} red />
                  </div>
                </div>
                {drillPersonalStats.allTasks.length > 0 ? (
                  <div className="space-y-1.5">
                    {(() => {
                      const prioritised = [...drillPersonalStats.todayTasks, ...drillPersonalStats.overdueTasks, ...drillPersonalStats.allTasks.filter(t => !drillPersonalStats.todayTasks.includes(t) && !drillPersonalStats.overdueTasks.includes(t))];
                      const visible = showAllDrillTasks ? prioritised : prioritised.slice(0, 4);
                      return visible.map(t => {
                        const taskOverdue = isTaskOverdue(t);
                        return (
                          <button
                            key={`${t._clientId}-${t.id}`}
                            onClick={() => setSelectedTask(t)}
                            className={`w-full flex items-center gap-2 px-3 py-2 bg-white rounded-xl border text-left hover:border-indigo-300 transition-colors ${taskOverdue ? 'border-red-200' : 'border-indigo-100'}`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'Done' ? 'bg-emerald-500' : t.status === 'WIP' ? 'bg-blue-500' : 'bg-amber-400'}`} />
                            <span className="text-xs text-indigo-800 font-medium flex-1 truncate">{t.name || t.comment}</span>
                            {t._clientName && <span className="text-[10px] text-indigo-400 flex-shrink-0 truncate max-w-[80px]">{t._clientName}</span>}
                          </button>
                        );
                      });
                    })()}
                    {drillPersonalStats.allTasks.length > 4 && (
                      <button
                        onClick={() => setShowAllDrillTasks(v => !v)}
                        className="w-full text-center text-xs text-indigo-500 font-semibold py-1.5 hover:text-indigo-700"
                      >
                        {showAllDrillTasks
                          ? 'Show less'
                          : `+${drillPersonalStats.allTasks.length - 4} more tasks`}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-indigo-400 text-center py-2">No tasks assigned</p>
                )}
              </div>
            )}

            {directReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <Users size={28} className="text-slate-300" />
                </div>
                <p className="text-slate-500 font-semibold">No direct reports</p>
                <p className="text-xs text-slate-400 mt-1">No team members linked to this person</p>
              </div>
            ) : (
              <>
                {drillStack.length > 0 && (
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                    {viewUser.name.split(' ')[0]}'s Team ({directReports.length})
                  </p>
                )}
                {directReports.map(u => (
                  <PersonCard
                    key={u.id}
                    user={u}
                    clientLogs={clientLogs}
                    clients={clients}
                    users={users}
                    allUsers={users}
                    onDrillIn={drillIn}
                    onTaskClick={setSelectedTask}
                  />
                ))}
              </>
            )}

            {drillStack.length === 0 && (
              <MissingInfoSection
                subtreeTasks={subtreeTasks}
                unassignedTasks={unassignedTasks}
                onTaskClick={setSelectedTask}
                sectionRef={missingInfoRef}
              />
            )}

            {drillStack.length === 0 && (
              <LeaveConflictsSection
                subtreeTasks={subtreeTasks}
                leaveByUser={leaveByUser}
                users={users}
                onTaskClick={setSelectedTask}
                sectionRef={null}
              />
            )}
          </div>
          </div>
        </>
      )}

      {activeTab === 'team' && (
        <button
          onClick={() => setShowAddTask(true)}
          className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-indigo-600 shadow-lg flex items-center justify-center text-white z-30 active:scale-95 transition-transform"
        >
          <Plus size={24} />
        </button>
      )}

      {activeTab === 'approvals' && (
        <div className="flex-1 overflow-y-auto p-4">
          <ApprovalsTab
            pendingApprovals={pendingApprovals}
            clientLogs={clientLogs}
            onApprove={setApprovingTask}
          />
        </div>
      )}

      {approvingTask && (
        <ApproveSheet
          task={approvingTask}
          onClose={() => setApprovingTask(null)}
          clientLogs={clientLogs}
          onDone={() => setApprovingTask(null)}
        />
      )}

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          clientLogs={clientLogs}
          currentUser={currentUser}
          isManager={true}
          users={users}
          clients={clients}
        />
      )}

      {showAddTask && (
        <AddTaskSheet
          currentUser={currentUser}
          users={users}
          clients={clients}
          clientLogs={clientLogs}
          categories={categories}
          onClose={() => setShowAddTask(false)}
          onCreated={() => setShowAddTask(false)}
        />
      )}
    </div>
  );
}
