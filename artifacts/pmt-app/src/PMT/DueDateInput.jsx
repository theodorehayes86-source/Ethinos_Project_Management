import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';

export default function DueDateInput({ startDate, value, onChange, minDate }) {
  const [mode, setMode] = useState('pick');
  const [relDays, setRelDays] = useState(1);

  // Recompute due date when startDate changes in anchored modes
  useEffect(() => {
    if (mode === 'same-day' && startDate) {
      onChange(startDate);
    } else if (mode === 'relative' && startDate && relDays > 0) {
      onChange(addDays(startDate, relDays));
    }
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchToSameDay = () => {
    setMode('same-day');
    if (startDate) onChange(startDate);
  };

  const switchToPick = () => {
    setMode('pick');
  };

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

  const handleRelDaysChange = (raw) => {
    const clamped = Math.max(1, Math.min(60, parseInt(raw, 10) || 1));
    setRelDays(clamped);
    if (startDate) onChange(addDays(startDate, clamped));
  };

  const tabs = [
    { id: 'same-day', label: 'Same day',      onClick: switchToSameDay  },
    { id: 'pick',     label: 'Pick date',      onClick: switchToPick     },
    { id: 'relative', label: 'Days from start', onClick: switchToRelative },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={tab.onClick}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
              mode === tab.id
                ? `bg-white shadow-sm ${tab.id === 'relative' ? 'text-blue-700' : 'text-slate-800'}`
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'same-day' && (
        <p className="text-xs font-semibold text-emerald-600">
          Due: same day as task date{startDate ? ` (${format(startDate, 'do MMM yyyy')})` : ''}
        </p>
      )}

      {mode === 'pick' && (
        <DatePicker
          selected={value}
          onChange={onChange}
          placeholderText="Select due date"
          dateFormat="do MMM yyyy"
          minDate={minDate}
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 ring-blue-500/20"
        />
      )}

      {mode === 'relative' && (
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
          {startDate && (
            <p className="text-xs font-semibold text-blue-600">
              Due: {format(addDays(startDate, relDays), 'do MMM yyyy')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
