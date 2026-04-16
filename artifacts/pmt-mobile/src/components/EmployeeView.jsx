import React, { useState } from 'react';
import { Tag, Calendar, ChevronRight, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import TaskDetailSheet from './TaskDetailSheet.jsx';

const STATUS_COLORS = {
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  WIP: 'bg-blue-100 text-blue-700 border-blue-200',
  Done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function TaskCard({ task, onClick }) {
  return (
    <button
      onClick={() => onClick(task)}
      className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[task.status] || 'bg-slate-100 text-slate-600'}`}>
              {task.status || 'Pending'}
            </span>
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

function Section({ title, tasks, onTaskClick, icon }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</h3>
        <span className="ml-auto text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map(task => (
          <TaskCard key={`${task._clientId}-${task.id}`} task={task} onClick={onTaskClick} />
        ))}
      </div>
    </div>
  );
}

export default function EmployeeView({ myTasks, clientLogs, currentUser }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const { today = [], upcoming = [], overdue = [] } = myTasks;
  const allEmpty = today.length === 0 && upcoming.length === 0 && overdue.length === 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-6">
        {allEmpty && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <CheckCircle size={28} className="text-slate-300" />
            </div>
            <p className="text-slate-500 font-semibold">No tasks assigned</p>
            <p className="text-xs text-slate-400 mt-1">You're all caught up!</p>
          </div>
        )}
        {overdue.length > 0 && (
          <Section title="Overdue" tasks={overdue} onTaskClick={setSelectedTask}
            icon={<AlertTriangle size={13} className="text-red-400" />} />
        )}
        <Section title="Due Today" tasks={today} onTaskClick={setSelectedTask}
          icon={<Clock size={13} className="text-indigo-400" />} />
        <Section title="Upcoming" tasks={upcoming} onTaskClick={setSelectedTask}
          icon={<Calendar size={13} className="text-slate-400" />} />
      </div>

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          clientLogs={clientLogs}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
