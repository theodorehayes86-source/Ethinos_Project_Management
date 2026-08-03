import React, { useState, useMemo, useRef } from 'react';
import { format, getDay } from 'date-fns';
import WeekNavigator from './WeekNavigator';
import WeeklyTaskColumn from './WeeklyTaskColumn';
import TaskMoveConfirmationModal from './TaskMoveConfirmationModal';
import { getWeekDays, groupTasksByDay, formatDayLabel, formatColumnDate } from './weekUtils';

/**
 * Weekly Kanban-style board showing tasks grouped into Mon–Sun columns.
 *
 * Props:
 *   tasks                — task[] (already filtered — same array as list view)
 *   weekOffset           — integer controlled by parent
 *   onWeekOffsetChange   — (offset) => void
 *   mode                 — 'personal' | 'client'
 *   canEditTask          — (task) => boolean
 *   onOpenTask           — (task) => void — opens task detail panel
 *   onRescheduleConfirmed — async (task, newDate, scope) => void
 */
const WeeklyTaskBoard = ({
  tasks = [],
  weekOffset = 0,
  onWeekOffsetChange,
  mode = 'personal',
  canEditTask = () => false,
  onOpenTask,
  onRescheduleConfirmed,
}) => {
  const allWeekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  // Weekend visibility — persisted so the user's choice survives navigation
  const [showWeekend, setShowWeekend] = useState(() => {
    try { return localStorage.getItem('pmt_board_show_weekend') === 'true'; } catch { return false; }
  });
  const toggleWeekend = () => {
    setShowWeekend(v => {
      const next = !v;
      try { localStorage.setItem('pmt_board_show_weekend', String(next)); } catch {}
      return next;
    });
  };

  // When weekend is hidden, drop Sat (index 5) and Sun (index 6)
  const weekDays = useMemo(
    () => showWeekend ? allWeekDays : allWeekDays.filter((_, i) => i < 5),
    [allWeekDays, showWeekend]
  );

  const { byDay, noDueDate } = useMemo(
    () => groupTasksByDay(tasks, allWeekDays),
    [tasks, allWeekDays]
  );

  // Drag state — we track the dragged task here so columns can call onDropTask(targetDate)
  const draggedTaskRef = useRef(null);
  const [dragTargetKey, setDragTargetKey] = useState(null);

  // Move confirmation modal state
  const [moveModal, setMoveModal] = useState(null); // { task, targetDate }
  const [submitting, setSubmitting] = useState(false);
  const [moveError, setMoveError] = useState(null);

  const handleDragStart = (task, e) => {
    draggedTaskRef.current = task;
    e.dataTransfer.effectAllowed = 'move';
    // Minimal ghost — just let browser default
  };

  const handleDragEnd = () => {
    draggedTaskRef.current = null;
    setDragTargetKey(null);
  };

  /** Called by WeeklyTaskColumn when a card is dropped. targetDate = Date | null */
  const handleDropTask = (targetDate) => {
    const task = draggedTaskRef.current;
    draggedTaskRef.current = null;
    setDragTargetKey(null);
    if (!task) return;
    // Open confirmation modal
    setMoveError(null);
    setMoveModal({ task, targetDate: targetDate || new Date() });
  };

  /** Mobile / menu "Move Date" — open modal without drag */
  const handleMoveRequest = (task) => {
    setMoveError(null);
    setMoveModal({ task, targetDate: new Date() });
  };

  const handleConfirmMove = async ({ task, newDate, scope }) => {
    setSubmitting(true);
    setMoveError(null);
    try {
      await onRescheduleConfirmed(task, newDate, scope);
      setMoveModal(null);
    } catch (err) {
      setMoveError('Failed to move task — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMove = () => {
    setMoveModal(null);
    setMoveError(null);
  };

  const colProps = {
    mode,
    canEditTask,
    onOpenTask,
    onDragStart: handleDragStart,
    onDropTask: handleDropTask,
    onMoveRequest: handleMoveRequest,
  };

  return (
    <div className="space-y-3" onDragEnd={handleDragEnd}>
      {/* Week navigation bar */}
      <div className="flex items-center justify-between gap-4">
        <WeekNavigator weekOffset={weekOffset} onOffsetChange={onWeekOffsetChange} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleWeekend}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all whitespace-nowrap ${
              showWeekend
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
            title={showWeekend ? 'Hide Sat & Sun' : 'Show Sat & Sun'}
          >
            {showWeekend ? 'Hide Weekend' : 'Show Weekend'}
          </button>
          <p className="text-[10px] text-slate-400 hidden sm:block">
            Drag cards between columns to reschedule
          </p>
        </div>
      </div>

      {/* Columns — horizontally scrollable */}
      <div
        className="flex gap-3 overflow-x-auto pb-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}
      >
        {weekDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          return (
            <WeeklyTaskColumn
              key={key}
              dayLabel={formatDayLabel(day)}
              dateLabel={formatColumnDate(day)}
              date={day}
              tasks={byDay[key] || []}
              isDragTarget={dragTargetKey === key}
              {...colProps}
              onDropTask={(targetDate) => { setDragTargetKey(key); handleDropTask(targetDate || day); }}
            />
          );
        })}

        {/* No Due Date column */}
        <WeeklyTaskColumn
          dayLabel="No date"
          dateLabel="No due date"
          date={null}
          tasks={noDueDate}
          isDragTarget={dragTargetKey === '__none__'}
          {...colProps}
          onDropTask={() => { setDragTargetKey('__none__'); handleDropTask(null); }}
        />
      </div>

      {/* Move confirmation modal */}
      {moveModal && (
        <TaskMoveConfirmationModal
          task={moveModal.task}
          targetDate={moveModal.targetDate}
          onConfirm={handleConfirmMove}
          onCancel={handleCancelMove}
          submitting={submitting}
        />
      )}

      {/* Inline error (shown below modal when it closes due to error) */}
      {moveError && !moveModal && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          {moveError}
          <button
            type="button"
            onClick={() => setMoveError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default WeeklyTaskBoard;
