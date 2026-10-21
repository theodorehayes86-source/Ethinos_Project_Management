import React from 'react';
import { CheckCircle2, Activity, AlertTriangle, Clock, CalendarDays, X } from 'lucide-react';
import { STUDIO_CARDS } from './summary.js';

const styles = {
  approved: [CheckCircle2, 'text-emerald-600', 'Approved'],
  wip: [Activity, 'text-amber-600', 'In progress'],
  soon: [AlertTriangle, 'text-red-500', 'At risk'],
  scheduled: [Clock, 'text-blue-500', 'Scheduled'],
  ans: [CalendarDays, 'text-slate-500', 'To schedule'],
};

export default function StudioSummaryCards({ counts = {}, active = 'all', onSelect }) {
  const selected = STUDIO_CARDS.find(c => c.key === active);
  return (
    <section aria-label="Content filters" className="mb-5">
      <div className="grid grid-cols-5 gap-0.5 rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
        {STUDIO_CARDS.map(c => {
          const [Icon, tone, label] = styles[c.key];
          const count = counts[c.count] || 0;
          const pressed = active === c.key;
          return (
            <button type="button" key={c.key} data-testid={`card-count-${c.key}`} aria-pressed={pressed}
              aria-label={`${c.label}: ${count}`} title={c.label}
              onClick={() => onSelect(pressed ? 'all' : c.key)}
              className={`flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${pressed ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-slate-50'}`}>
              <span className="flex items-center justify-center gap-1">
                <Icon size={11} strokeWidth={2} className={`shrink-0 ${tone}`} aria-hidden="true" />
                <span className="text-[19px] leading-5 font-bold tabular-nums text-slate-900">{count}</span>
              </span>
              <span className={`text-[10px] leading-3 font-medium text-center whitespace-nowrap ${pressed ? 'text-indigo-700' : 'text-slate-600'}`}>{label}</span>
              {c.key === 'soon' && counts.overdue > 0 && <span className="text-[9px] leading-[10px] font-semibold text-red-600">{counts.overdue} overdue</span>}
            </button>
          );
        })}
      </div>
      {selected && (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-1 text-[11px] text-indigo-700">
          <span>Filtering: {selected.label}</span>
          <button type="button" data-testid="button-clear-card-filter" onClick={() => onSelect('all')} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 hover:bg-indigo-50 focus-visible:ring-2 ring-indigo-500">
            <X size={11} /> Clear filter
          </button>
        </div>
      )}
      {!selected && <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">Tap a status to filter · Tap again to clear</p>}
    </section>
  );
}
