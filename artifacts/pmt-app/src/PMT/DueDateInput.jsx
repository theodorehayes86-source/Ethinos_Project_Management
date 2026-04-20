import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';

export default function DueDateInput({ startDate, value, onChange, minDate }) {
  const [mode, setMode] = useState('pick');
  const [relDays, setRelDays] = useState(1);

  // When startDate changes in relative mode, recompute due date
  useEffect(() => {
    if (mode === 'relative' && startDate && relDays > 0) {
      onChange(addDays(startDate, relDays));
    }
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchToRelative = () => {
    let days = relDays;
    if (value && startDate) {
      const diff = differenceInCalendarDays(value, startDate);
      if (diff > 0) days = Math.min(60, diff);
    }
    setRelDays(days);
    setMode('relative');
    if (startDate) onChange(addDays(startDate, days));
  };

  const switchToPick = () => {
    setMode('pick');
  };

  const handleRelDaysChange = (raw) => {
    const clamped = Math.max(1, Math.min(60, parseInt(raw, 10) || 1));
    setRelDays(clamped);
    if (startDate) onChange(addDays(startDate, clamped));
  };

  const computedDate = mode === 'relative' && startDate
    ? addDays(startDate, relDays)
    : value;

  return (
    <div className="space-y-2">
      <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={switchToPick}
          className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
            mode === 'pick'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pick date
        </button>
        <button
          type="button"
          onClick={switchToRelative}
          className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
            mode === 'relative'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Days from start
        </button>
      </div>

      {mode === 'pick' ? (
        <DatePicker
          selected={value}
          onChange={onChange}
          placeholderText="Select due date"
          dateFormat="do MMM yyyy"
          minDate={minDate}
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
        />
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="60"
              value={relDays}
              onChange={e => handleRelDaysChange(e.target.value)}
              className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 ring-blue-500/20 text-center"
            />
            <span className="text-sm text-slate-500 font-medium">days after task date</span>
          </div>
          {computedDate && (
            <p className="text-xs font-semibold text-blue-600">
              Due: {format(computedDate, 'do MMM yyyy')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
