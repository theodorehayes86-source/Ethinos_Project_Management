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

export const REMINDER_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST — India' },
  { value: 'Europe/London', label: 'GMT/BST — London' },
  { value: 'America/New_York', label: 'ET — New York' },
  { value: 'America/Chicago', label: 'CT — Chicago' },
  { value: 'America/Denver', label: 'MT — Denver' },
  { value: 'America/Los_Angeles', label: 'PT — Los Angeles' },
  { value: 'Europe/Berlin', label: 'CET/CEST — Berlin' },
  { value: 'Asia/Dubai', label: 'GST — Dubai' },
  { value: 'Asia/Singapore', label: 'SGT — Singapore' },
  { value: 'Asia/Tokyo', label: 'JST — Tokyo' },
  { value: 'Australia/Sydney', label: 'AET — Sydney' },
];

export function ReminderPills({
  selected,
  onChange,
  time = '09:00',
  onTimeChange,
  timezone = 'Asia/Kolkata',
  onTimezoneChange,
}) {
  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <div className="space-y-2.5">
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
      {onTimeChange && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-semibold text-slate-600">
            <span className="block">Reminder time</span>
            <input
              type="time"
              value={time}
              onChange={event => onTimeChange(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
          </label>
          {onTimezoneChange && (
            <label className="min-w-[190px] flex-1 space-y-1 text-xs font-semibold text-slate-600">
              <span className="block">Timezone</span>
              <select
                value={timezone}
                onChange={event => onTimezoneChange(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              >
                {REMINDER_TIMEZONES.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
