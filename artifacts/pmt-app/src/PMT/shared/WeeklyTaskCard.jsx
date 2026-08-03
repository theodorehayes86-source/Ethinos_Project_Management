import React, { useState } from 'react';
import { GripVertical, Clock, AlertTriangle, MoreVertical, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { parseDueDate, isOverdue } from './weekUtils';

const STATUS_STYLES = {
  Done:    'bg-emerald-100 text-emerald-700',
  WIP:     'bg-blue-100 text-blue-700',
  Pending: 'bg-orange-100 text-orange-700',
};

/**
 * Compact task card for the weekly board.
 *
 * Props:
 *   task          — task object
 *   mode          — 'personal' | 'client'
 *   canEdit       — boolean — whether to show drag handle / move option
 *   onOpen        — (task) => void — called on card body click
 *   onDragStart   — (task, e) => void
 *   onMoveRequest — (task) => void — opens date-move modal directly (mobile fallback)
 */
const WeeklyTaskCard = ({ task, mode, canEdit, onOpen, onDragStart, onMoveRequest }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const overdue = isOverdue(task);

  const secondaryLabel = mode === 'personal'
    ? (task.cName || task.clientName || null)
    : (task.assigneeName || null);

  const dueDate = parseDueDate(task.dueDate);
  const hasTime = dueDate && (dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0);
  const timeStr = hasTime ? format(dueDate, 'h:mm a') : null;

  const handleDragStart = (e) => {
    if (!canEdit) return;
    onDragStart(task, e);
  };

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      className={`group relative bg-white rounded-xl border shadow-sm transition-all text-left w-full ${
        overdue
          ? 'border-red-200 bg-red-50/30'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      } ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div className="flex items-start gap-1.5 p-2.5">
        {/* Drag handle */}
        {canEdit && (
          <div className="flex-shrink-0 mt-0.5 text-slate-300 group-hover:text-slate-400 transition-colors">
            <GripVertical size={13} />
          </div>
        )}

        {/* Card body */}
        <div
          className="flex-1 min-w-0"
          onClick={() => onOpen(task)}
        >
          {/* Title */}
          <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug mb-1">
            {task.name || task.comment || '—'}
          </p>

          {/* Secondary label */}
          {secondaryLabel && (
            <p className="text-[10px] text-slate-500 truncate mb-1.5">{secondaryLabel}</p>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-1 flex-wrap">
            {/* Status */}
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${STATUS_STYLES[task.status] || STATUS_STYLES.Pending}`}>
              {task.status || 'Pending'}
            </span>

            {/* Overdue chip */}
            {overdue && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-md">
                <AlertTriangle size={9} />
                Overdue
              </span>
            )}

            {/* Due time */}
            {timeStr && (
              <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
                <Clock size={9} />
                {timeStr}
              </span>
            )}
          </div>
        </div>

        {/* ⋮ menu (mobile fallback + always visible) */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
            className="w-5 h-5 flex items-center justify-center rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Card options"
          >
            <MoreVertical size={12} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-6 z-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[130px]">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onOpen(task); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Open task
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onMoveRequest(task); }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  >
                    <CalendarDays size={11} />
                    Move date…
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyTaskCard;
