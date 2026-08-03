import React, { useState } from 'react';
import WeeklyTaskCard from './WeeklyTaskCard';
import { isToday } from './weekUtils';

/**
 * One day column in the weekly board.
 *
 * Props:
 *   dayLabel      — e.g. "Mon"
 *   dateLabel     — e.g. "4 Aug"
 *   date          — Date | null (null = "No Due Date" column)
 *   tasks         — task[]
 *   mode          — 'personal' | 'client'
 *   canEditTask   — (task) => boolean
 *   onOpenTask    — (task) => void
 *   onDragStart   — (task, e) => void
 *   onDropTask    — (task, targetDate) => void
 *   onMoveRequest — (task) => void
 *   isDragTarget  — boolean — the task is currently being dragged here
 */
const WeeklyTaskColumn = ({
  dayLabel,
  dateLabel,
  date,
  tasks = [],
  mode,
  canEditTask,
  onOpenTask,
  onDragStart,
  onDropTask,
  onMoveRequest,
  isDragTarget,
}) => {
  const [isOver, setIsOver] = useState(false);
  const todayCol = date && isToday(date);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = (e) => {
    // Only clear when leaving the column container itself
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsOver(false);
    // The dragged task is passed via the onDropTask callback — parent manages drag state
    onDropTask(date);
  };

  return (
    <div
      className={`flex flex-col min-w-[160px] max-w-[220px] flex-shrink-0 rounded-2xl transition-all ${
        isOver || isDragTarget
          ? 'bg-blue-50 ring-2 ring-blue-400 ring-offset-1'
          : todayCol
          ? 'bg-blue-50/40'
          : 'bg-slate-50/60'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className={`px-3 pt-3 pb-2 border-b ${todayCol ? 'border-blue-200' : 'border-slate-200/60'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold ${todayCol ? 'text-blue-700' : 'text-slate-700'}`}>
            {dayLabel}
            {todayCol && (
              <span className="ml-1.5 text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                Today
              </span>
            )}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            tasks.length > 0
              ? 'bg-slate-200 text-slate-600'
              : 'bg-slate-100 text-slate-400'
          }`}>
            {tasks.length}
          </span>
        </div>
        <p className={`text-[10px] mt-0.5 ${todayCol ? 'text-blue-500' : 'text-slate-400'}`}>
          {dateLabel}
        </p>
      </div>

      {/* Task cards */}
      <div className="flex-1 p-2 space-y-2 min-h-[80px]">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-12 text-[10px] text-slate-300 italic">
            {date ? 'No tasks' : 'No due date'}
          </div>
        ) : (
          tasks.map(task => (
            <WeeklyTaskCard
              key={task.id || task.taskKey}
              task={task}
              mode={mode}
              canEdit={canEditTask(task)}
              onOpen={onOpenTask}
              onDragStart={onDragStart}
              onMoveRequest={onMoveRequest}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default WeeklyTaskColumn;
