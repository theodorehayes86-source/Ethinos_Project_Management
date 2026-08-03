import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import { X, CalendarDays } from 'lucide-react';
import { parseDueDate } from './weekUtils';

/**
 * Confirmation modal before a task is rescheduled.
 *
 * Props:
 *   task         — task to move
 *   targetDate   — Date — the drop-target date (default for the picker)
 *   onConfirm    — ({ task, newDate, scope }) => void
 *   onCancel     — () => void
 *   submitting   — boolean
 */
const TaskMoveConfirmationModal = ({ task, targetDate, onConfirm, onCancel, submitting }) => {
  const [newDate, setNewDate] = useState(targetDate || new Date());

  // 'one' | 'all'
  const [scope, setScope] = useState('one');

  const isRecurring = !!(task.repeatGroupId && task.repeatFrequency && task.repeatFrequency !== 'Once');

  const originalDueDateStr = task.dueDate
    ? (() => {
        const d = parseDueDate(task.dueDate);
        return d ? format(d, 'd MMM yyyy') : task.dueDate;
      })()
    : 'No due date';

  const handleConfirm = () => {
    onConfirm({ task, newDate, scope });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Move Task</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Task name */}
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Task</p>
            <p className="text-sm font-semibold text-slate-800 line-clamp-2">{task.name || task.comment}</p>
          </div>

          {/* Current → New */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 mb-1">Current date</p>
              <p className="text-xs font-medium text-slate-700">{originalDueDateStr}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 mb-1">New date *</p>
              <DatePicker
                selected={newDate}
                onChange={date => date && setNewDate(date)}
                dateFormat="d MMM yyyy"
                className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500/20 cursor-pointer"
              />
            </div>
          </div>

          {/* Recurring scope selector */}
          {isRecurring && (
            <div className="space-y-1.5 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Recurring task</p>
              <div className="space-y-1.5">
                {[
                  ['one', 'This occurrence only'],
                  ['all', 'Entire series'],
                ].map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value={val}
                      checked={scope === val}
                      onChange={() => setScope(val)}
                      className="accent-blue-600 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-slate-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Moving…' : 'Confirm Move'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskMoveConfirmationModal;
