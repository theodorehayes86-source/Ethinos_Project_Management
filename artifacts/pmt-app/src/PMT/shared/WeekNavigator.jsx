import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getWeekDays, formatWeekLabel } from './weekUtils';

/**
 * Shows the current week label with prev/next navigation.
 *
 * Props:
 *   weekOffset       — integer (0 = current week, -1 = last week, etc.)
 *   onOffsetChange   — (offset) => void
 */
const WeekNavigator = ({ weekOffset, onOffsetChange }) => {
  const weekDays = getWeekDays(weekOffset);
  const label = formatWeekLabel(weekDays);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onOffsetChange(weekOffset - 1)}
        title="Previous week"
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm"
      >
        <ChevronLeft size={14} />
      </button>

      <button
        type="button"
        onClick={() => onOffsetChange(0)}
        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
          weekOffset === 0
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }`}
        title="Jump to current week"
      >
        {weekOffset === 0 ? 'This week' : label}
      </button>

      {weekOffset !== 0 && (
        <span className="text-xs text-slate-500 font-medium hidden sm:block">{label}</span>
      )}

      <button
        type="button"
        onClick={() => onOffsetChange(weekOffset + 1)}
        title="Next week"
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};

export default WeekNavigator;
