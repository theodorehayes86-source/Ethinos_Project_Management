// DEV-ONLY visual fixture for the real StudioCalendar (no API, no auth).
// Reached via ?clientDemo=1&demoStudioCalendar=1 inside the lazy demo chunk.
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import StudioCalendar from '../../creativeStudio/StudioCalendar.jsx';
import StudioSummaryCards from '../../creativeStudio/StudioSummaryCards.jsx';
import { matchesStudioCard, studioCardCounts } from '../../creativeStudio/summary.js';
import { utcToLocal, stageLabel, fmtInstant, tzShort } from '../../creativeStudio/core.js';

const CLIENTS = { h: 'Harbour & Pine Interiors', k: 'Kestrel Cycle Co.' };
const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };

export function studioDemoItems(month) {
  const at = (day, hhmmZ) => `${month}-${String(day).padStart(2, '0')}T${hhmmZ}:00.000Z`;
  return [
    { id: 'sd1', title: 'Monsoon linen teaser', type: 'Reel', clientId: 'h', stage: 'awaiting_reference', plannedAt: at(3, '05:30'), timezone: 'Asia/Kolkata' },
    { id: 'sd2', title: 'Walnut dining carousel', type: 'Post', clientId: 'h', stage: 'final_approved', scheduled: true, plannedAt: at(3, '12:00'), timezone: 'Asia/Kolkata' },
    // 20:00Z on the 9th is the 10th in IST: placed by the item's own timezone.
    { id: 'sd3', title: 'Late-night trail story', type: 'Story', clientId: 'k', stage: 'in_production', plannedAt: at(9, '20:00'), timezone: 'Asia/Kolkata' },
    { id: 'sd4', title: 'London showroom post', type: 'Post', clientId: 'h', stage: 'internal_draft', plannedAt: at(9, '20:00'), timezone: 'Europe/London' },
    { id: 'sd5', title: 'Festive gifting guide', type: 'Story', clientId: 'h', stage: 'final_changes', plannedAt: at(17, '06:00'), timezone: 'Asia/Kolkata' },
    { id: 'sd6', title: 'Ride club recap', type: 'Reel', clientId: 'k', stage: 'awaiting_final', plannedAt: at(17, '08:00'), timezone: 'Asia/Kolkata' },
    { id: 'sd7', title: 'Helmet safety tips', type: 'Post', clientId: 'k', stage: 'in_production', plannedAt: at(17, '10:00'), timezone: 'Asia/Kolkata' },
    { id: 'sd8', title: 'Weekend sale banner', type: 'Post', clientId: 'k', stage: 'in_production', plannedAt: at(17, '11:00'), timezone: 'Asia/Kolkata' },
    { id: 'sd9', title: 'Brand film cutdown', type: 'Reel', clientId: 'h', stage: 'internal_draft', plannedAt: null, timezone: 'Asia/Kolkata' },
    { id: 'sd10', title: 'Upcoming launch', type: 'Post', clientId: 'h', stage: 'in_production', plannedAt: at(20, '12:00'), timezone: 'Asia/Kolkata' },
    { id: 'sd11', title: 'Approved campaign', type: 'Story', clientId: 'k', stage: 'final_approved', plannedAt: at(24, '12:00'), timezone: 'Asia/Kolkata' },
    { id: 'sd12', title: 'Next campaign preview', type: 'Reel', clientId: 'h', stage: 'awaiting_reference', plannedAt: at(28, '12:00'), timezone: 'Asia/Kolkata' },
  ];
}

export default function StudioCalendarDemo() {
  const today = utcToLocal(new Date().toISOString(), 'Asia/Kolkata').date;
  const [month, setMonth] = useState(today.slice(0, 7));
  const items = useMemo(() => studioDemoItems(today.slice(0, 7)), [today]);
  const [openId, setOpenId] = useState(null);
  const [card, setCard] = useState('all');
  const [phone, setPhone] = useState(() => new URLSearchParams(window.location.search).get('phone') === '1');
  const filtered = items.filter(i => matchesStudioCard(i, card));
  const open = items.find(i => i.id === openId);
  return (
    <div className="min-h-[100dvh] bg-indigo-50/40 p-3 md:p-6">
      <div className={`${phone ? 'max-w-[390px]' : 'max-w-6xl'} cs-root mx-auto bg-white rounded-2xl border border-slate-200 p-3`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">Demo fixture · Creative Studio content plan calendar <button type="button" data-testid="button-demo-width" onClick={() => setPhone(p => !p)} className="ml-2 underline">{phone ? 'Show wide' : 'Show phone width'}</button></p>
        <StudioSummaryCards counts={studioCardCounts(items)} active={card} onSelect={key => { setCard(key); setOpenId(null); }} />
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button data-testid="button-month-prev" onClick={() => setMonth(m => shift(m, -1))} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Previous month"><ChevronLeft size={16} /></button>
          <h3 data-testid="text-month" className="text-xl font-bold">{month}</h3>
          <button data-testid="button-month-next" onClick={() => setMonth(m => shift(m, 1))} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Next month"><ChevronRight size={16} /></button>
          <button data-testid="button-month-today" onClick={() => setMonth(today.slice(0, 7))} className="text-xs font-semibold text-indigo-600 hover:underline">Today</button>
        </div>
        <StudioCalendar items={filtered} month={month} todayKey={today} selectedId={openId} onOpen={setOpenId} clientName={(id) => CLIENTS[id] || 'Client'} />
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpenId(null)} />
          <div data-testid="demo-studio-detail" className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-2">
            <button onClick={() => setOpenId(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center" aria-label="Close"><X size={15} /></button>
            <h3 className="text-base font-bold pr-8">{open.title}</h3>
            <p className="text-xs text-slate-500">{open.type} · {CLIENTS[open.clientId]} · {stageLabel(open.stage)}</p>
            <p className="text-sm">{open.plannedAt ? `${fmtInstant(open.plannedAt, open.timezone, { weekday: 'short' })} ${tzShort(open.timezone)}` : 'No posting date'}</p>
            <p className="text-[11px] text-slate-400">Staff workspace opens the full detail panel here.</p>
          </div>
        </div>
      )}
    </div>
  );
}
