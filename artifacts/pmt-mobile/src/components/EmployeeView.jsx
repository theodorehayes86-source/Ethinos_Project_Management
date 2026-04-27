import React, { useState } from 'react';
import { Tag, Calendar, ChevronRight, AlertTriangle, CheckCircle, Clock, Plus, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
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

export default function EmployeeView({ myTasks, clientLogs, currentUser, clients, categories, users }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const { today = [], upcoming = [], overdue = [], done = [], awaitingQC = [] } = myTasks;
  const allEmpty = today.length === 0 && upcoming.length === 0 && overdue.length === 0 && done.length === 0 && awaitingQC.length === 0;

  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="p-4 pb-6 space-y-6">
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
