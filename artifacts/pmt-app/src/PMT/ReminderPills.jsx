import React from 'react';

export const REMINDER_OPTIONS = [
  { value: '-7', label: '7 days before' },
  { value: '-3', label: '3 days before' },
  { value: '-2', label: '2 days before' },
  { value: '-1', label: '1 day before' },
  { value: '0',  label: 'On due date' },
  { value: '+1', label: '1 day after', overdue: true },
  { value: '+2', label: '2 days after', overdue: true },
  { value: '+3', label: '3 days after', overdue: true },
];

export function ReminderPills({ selected, onChange }) {
  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {REMINDER_OPTIONS.map(opt => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
              active
                ? opt.overdue
                  ? 'bg-red-100 border-red-400 text-red-700'
                  : 'bg-blue-100 border-blue-400 text-blue-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
