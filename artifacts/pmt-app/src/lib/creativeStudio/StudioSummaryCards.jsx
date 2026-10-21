import React from 'react';
import { CheckCircle2, Activity, AlertTriangle, Clock, CalendarDays, X } from 'lucide-react';
import { STUDIO_CARDS } from './summary.js';

const styles = {
  approved: [CheckCircle2, 'bg-emerald-50 text-emerald-600'],
  wip: [Activity, 'bg-amber-50 text-amber-600'],
  soon: [AlertTriangle, 'bg-red-50 text-red-600'],
  scheduled: [Clock, 'bg-blue-50 text-blue-600'],
  ans: [CalendarDays, 'bg-slate-100 text-slate-500'],
};

export default function StudioSummaryCards({ counts, active = 'all', onSelect }) {
  const selected = STUDIO_CARDS.find(c => c.key === active);
  return (
    <section aria-label="Content filters" className="mb-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STUDIO_CARDS.map((c, idx) => {
          const [Icon, chip] = styles[c.key];
          const pressed = active === c.key;
          return (
            <button type="button" key={c.key} data-testid={`card-count-${c.key}`} aria-pressed={pressed}
              onClick={() => onSelect(pressed ? 'all' : c.key)}
              className={`text-left rounded-2xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${pressed ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'} ${idx === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm text-slate-700">{c.label}</span>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${chip}`}><Icon size={15} /></span>
              </span>
              <span className="block text-3xl font-bold mt-2 tabular-nums">{counts[c.count] || 0}</span>
              {c.key === 'soon' && counts.overdue > 0 && <span className="block text-[11px] font-semibold text-red-600 mt-0.5">{counts.overdue} overdue</span>}
            </button>
          );
        })}
      </div>
      {selected && (
        <div role="status" className="mt-2 flex items-center gap-2 text-xs text-indigo-700">
          <span>Filtering: {selected.label}</span>
          <button type="button" data-testid="button-clear-card-filter" onClick={() => onSelect('all')} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-indigo-50 focus-visible:ring-2 ring-indigo-500">
            <X size={12} /> Clear filter
          </button>
        </div>
      )}
    </section>
  );
}
