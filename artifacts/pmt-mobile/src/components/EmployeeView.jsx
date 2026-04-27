import React, { useState, useMemo } from 'react';
import { Tag, Calendar, ChevronRight, AlertTriangle, CheckCircle, Clock, Plus, ChevronDown, ChevronUp, ShieldCheck, ClipboardList, Activity } from 'lucide-react';
import TaskDetailSheet from './TaskDetailSheet.jsx';
import AddTaskSheet from './AddTaskSheet.jsx';
import { isTaskOverdue } from '../utils/taskUtils.js';

const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  WIP: 'bg-blue-100 text-blue-700 border-blue-200',
  Done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function TaskCard({ task, onClick }) {
  const overdue = isTaskOverdue(task);
  return (
    <button
      onClick={() => onClick(task)}
      className={`w-full bg-white rounded-2xl border shadow-sm p-4 text-left active:scale-[0.98] transition-transform ${overdue ? 'border-red-200' : 'border-slate-200'}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[task.status] || 'bg-slate-100 text-slate-600'}`}>
              {task.status || 'Pending'}
            </span>
            {overdue && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-0.5">
                <AlertTriangle size={9} /> Overdue
              </span>
            )}
            {task.category && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                {task.category}
              </span>
            )}
            {task.qcStatus === 'approved' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                <CheckCircle size={9} /> QC Approved
              </span>
            )}
            {task.qcStatus === 'rejected' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">QC Returned</span>
            )}
            {task.qcStatus === 'sent' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">In QC Review</span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-900 leading-snug">{task.name || task.comment || 'Untitled task'}</p>
          {task.name && task.comment && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.comment}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
            {task._clientName && <span className="flex items-center gap-1"><Tag size={10} /> {task._clientName}</span>}
            {task.dueDate && <span className="flex items-center gap-1"><Calendar size={10} /> {task.dueDate}</span>}
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-300 flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

function Section({ title, tasks, onTaskClick, icon, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (tasks.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        {icon}
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</h3>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{tasks.length}</span>
          {open
            ? <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
            : <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
          }
        </span>
      </button>
      {open && (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskCard key={`${task._clientId}-${task.id}`} task={task} onClick={onTaskClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployeeView({ myTasks, taskGroups = [], clientLogs, currentUser, clients, categories, users }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const { today = [], upcoming = [], overdue = [], done = [], awaitingQC = [] } = myTasks;
  const allEmpty = today.length === 0 && upcoming.length === 0 && overdue.length === 0 && done.length === 0 && awaitingQC.length === 0;

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getDate()}${['st','nd','rd'][((d.getDate()+90)%100-10)%10-1]||'th'} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
  }, []);

  const myGroups = useMemo(() =>
    taskGroups.filter(g => g.assigneeId && currentUser && String(g.assigneeId) === String(currentUser.id)),
    [taskGroups, currentUser]
  );

  const overdueChecklists = useMemo(() =>
    myGroups.filter(g => {
      if (!g.dueDate || g.status === 'done') return false;
      try {
        const [day, mon, yr] = g.dueDate.replace(/(\d+)(st|nd|rd|th)/, '$1').split(' ');
        const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
        return new Date(+yr, months[mon], +day) < new Date(new Date().setHours(0,0,0,0));
      } catch { return false; }
    }),
    [myGroups]
  );

  const dueTodayChecklists = useMemo(() =>
    myGroups.filter(g => g.dueDate === todayStr && g.status !== 'done'),
    [myGroups, todayStr]
  );

  const openChecklists = useMemo(() =>
    myGroups.filter(g => g.status !== 'done'),
    [myGroups]
  );

  const stats = [
    { label: 'Overdue', taskVal: overdue.length, clVal: overdueChecklists.length, color: 'rose', icon: <AlertTriangle size={14} className="text-rose-500" /> },
    { label: 'Due Today', taskVal: today.length, clVal: dueTodayChecklists.length, color: 'amber', icon: <Clock size={14} className="text-amber-500" /> },
    { label: 'Open', taskVal: today.length + upcoming.length, clVal: openChecklists.length, color: 'indigo', icon: <Activity size={14} className="text-indigo-500" /> },
    { label: 'Awaiting QC', taskVal: awaitingQC.length, clVal: 0, color: 'teal', icon: <ShieldCheck size={14} className="text-teal-500" /> },
  ];

  const colorMap = {
    rose: { bg: 'bg-rose-50', border: 'border-rose-100', val: 'text-rose-700', sub: 'text-rose-400', iconBg: 'bg-rose-100' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-100', val: 'text-amber-700', sub: 'text-amber-400', iconBg: 'bg-amber-100' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', val: 'text-indigo-700', sub: 'text-indigo-400', iconBg: 'bg-indigo-100' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-100', val: 'text-teal-700', sub: 'text-teal-400', iconBg: 'bg-teal-100' },
  };

  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="p-4 pb-6 space-y-6">

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s, i) => {
            const c = colorMap[s.color];
            const total = s.taskVal + s.clVal;
            const hasData = total > 0;
            return (
              <div key={i} className={`rounded-2xl border p-3 ${hasData ? `${c.bg} ${c.border}` : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{s.label}</span>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${hasData ? c.iconBg : 'bg-slate-100'}`}>{s.icon}</div>
                </div>
                <p className={`text-2xl font-black ${hasData ? c.val : 'text-slate-300'}`}>{total}</p>
                {s.clVal > 0 && (
                  <p className={`text-[10px] font-semibold mt-0.5 ${c.sub}`}>
                    {s.taskVal} task{s.taskVal !== 1 ? 's' : ''} · {s.clVal} list{s.clVal !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {allEmpty && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <CheckCircle size={28} className="text-slate-300" />
            </div>
            <p className="text-slate-500 font-semibold">No tasks assigned</p>
            <p className="text-xs text-slate-400 mt-1">Tap + to add a task for yourself</p>
          </div>
        )}
        {awaitingQC.length > 0 && (
          <Section title="Awaiting QC" tasks={awaitingQC} onTaskClick={setSelectedTask}
            icon={<ShieldCheck size={13} className="text-indigo-400" />}
            defaultOpen={true} />
        )}
        {overdue.length > 0 && (
          <Section title="Overdue" tasks={overdue} onTaskClick={setSelectedTask}
            icon={<AlertTriangle size={13} className="text-red-400" />}
            defaultOpen={true} />
        )}
        <Section title="Due Today" tasks={today} onTaskClick={setSelectedTask}
          icon={<Clock size={13} className="text-indigo-400" />}
          defaultOpen={true} />
        <Section title="Upcoming" tasks={upcoming} onTaskClick={setSelectedTask}
          icon={<Calendar size={13} className="text-slate-400" />}
          defaultOpen={true} />
        <Section title="Done" tasks={done} onTaskClick={setSelectedTask}
          icon={<CheckCircle size={13} className="text-emerald-400" />}
          defaultOpen={false} />
      </div>

      <button
        onClick={() => setShowAddTask(true)}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-95 transition-transform z-10"
        aria-label="Add personal task"
      >
        <Plus size={24} />
      </button>

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          clientLogs={clientLogs}
          currentUser={currentUser}
          users={users || []}
          clients={clients || []}
        />
      )}

      {showAddTask && (
        <AddTaskSheet
          currentUser={currentUser}
          users={users || []}
          clients={clients || []}
          clientLogs={clientLogs}
          categories={categories || []}
          personalMode={true}
          onClose={() => setShowAddTask(false)}
          onCreated={() => setShowAddTask(false)}
        />
      )}
    </div>
  );
}
