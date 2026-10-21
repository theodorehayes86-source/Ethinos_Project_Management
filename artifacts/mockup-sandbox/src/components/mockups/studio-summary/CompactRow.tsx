import React, { useState } from 'react';
import { CheckCircle2, Activity, AlertTriangle, Clock, CalendarDays, X } from 'lucide-react';
import { STUDIO_CARDS, sampleCounts } from './_cards';
import './_group.css';

// A layout-only iteration of the extracted cards: same keys, counts, colours,
// full accessible labels and toggle-to-filter interaction.
const compact = {
  approved: { short: 'Approved', Icon: CheckCircle2, tone: 'text-emerald-600' },
  wip: { short: 'In progress', Icon: Activity, tone: 'text-amber-600' },
  soon: { short: 'At risk', Icon: AlertTriangle, tone: 'text-red-500' },
  scheduled: { short: 'Scheduled', Icon: Clock, tone: 'text-blue-500' },
  ans: { short: 'To schedule', Icon: CalendarDays, tone: 'text-slate-500' },
};

export default function CompactRow() {
  const [active, setActive] = useState('all');
  const selected = STUDIO_CARDS.find(card => card.key === active);
  return (
    <main className="studio-summary-preview px-3 py-4">
      <section aria-label="Content filters">
        <div className="grid grid-cols-5 gap-0.5 rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
          {STUDIO_CARDS.map(card => {
            const { short, Icon, tone } = compact[card.key as keyof typeof compact];
            const count = sampleCounts[card.count] || 0;
            const pressed = active === card.key;
            return (
              <button key={card.key} type="button" aria-pressed={pressed}
                aria-label={`${card.label}: ${count}`} title={card.label} data-testid={`card-count-${card.key}`}
                onClick={() => setActive(pressed ? 'all' : card.key)}
                className={`flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${pressed ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-slate-50'}`}>
                <span className="flex items-center justify-center gap-1">
                  <Icon size={11} strokeWidth={2} className={`shrink-0 ${tone}`} aria-hidden="true" />
                  <span className="text-[19px] leading-5 font-bold tabular-nums text-slate-900">{count}</span>
                </span>
                <span className={`text-[10px] leading-3 font-medium text-center whitespace-nowrap ${pressed ? 'text-indigo-700' : 'text-slate-600'}`}>{short}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 min-h-9">
          {selected ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-indigo-700">
              <span>Filtering: <strong className="font-semibold">{selected.label}</strong></span>
              <button type="button" onClick={() => setActive('all')} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 hover:bg-indigo-50"><X size={11} />Clear</button>
            </div>
          ) : <p className="text-center text-[10px] leading-4 text-slate-400">Tap a status to filter · Tap again to clear</p>}
        </div>
      </section>
    </main>
  );
}
