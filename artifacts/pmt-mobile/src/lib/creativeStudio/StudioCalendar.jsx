// Monthly Monday-first calendar for the Content plan. Read-only placement:
// clicking an item calls onOpen(id); planned dates are never changed here.
// Duplicated in pmt-mobile; keep in sync.
import React, { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { stageLabel, fmtInstant, tzShort, urgency } from './core.js';
import { studioMonthGrid, groupStudioByDay } from './calendar.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const tone = (i) => {
  const u = urgency(i);
  if (u === 'overdue' || u === 'soon') return 'border-l-red-400';
  if (i.stage === 'final_approved') return 'border-l-emerald-500';
  if (i.stage === 'internal_draft') return 'border-l-slate-300';
  return 'border-l-amber-400';
};
const dot = (i) => {
  const u = urgency(i);
  if (u === 'overdue' || u === 'soon') return 'bg-red-500';
  if (i.stage === 'final_approved') return 'bg-emerald-500';
  if (i.stage === 'internal_draft') return 'bg-slate-400';
  return 'bg-amber-500';
};
const timeOf = (i) => `${fmtInstant(i.plannedAt, i.timezone, { day: undefined, month: undefined })} ${tzShort(i.timezone)}`;
const longDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); };

function Chip({ i, active, onOpen, clientName }) {
  return (
    <button type="button" data-testid={`calendar-item-${i.id}`} onClick={() => onOpen(i.id)}
      aria-label={`${i.title}, ${i.type}, ${clientName(i.clientId)}, ${stageLabel(i.stage)}, ${timeOf(i)}`}
      className={`w-full text-left rounded-md border border-slate-200 border-l-[3px] ${tone(i)} px-1.5 py-1 bg-white hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 ring-indigo-400 ${active ? '!bg-indigo-50 border-indigo-200' : ''} ${i.archived ? 'opacity-60' : ''}`}>
      <span className="block text-[11px] font-semibold text-slate-800 truncate">{i.title}</span>
      <span className="block text-[10px] text-slate-500 truncate">{i.type} · {clientName(i.clientId)}</span>
      <span className="block text-[10px] text-slate-400 truncate">{stageLabel(i.stage)}{i.scheduled ? ' · Scheduled' : ''}</span>
    </button>
  );
}

function AgendaRow({ i, active, onOpen, clientName }) {
  return (
    <button type="button" data-testid={`agenda-item-${i.id}`} onClick={() => onOpen(i.id)}
      className={`w-full text-left flex items-start gap-2.5 rounded-xl border border-slate-200 border-l-4 ${tone(i)} px-3 py-2 bg-white hover:bg-slate-50 ${active ? '!bg-indigo-50' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{i.title}</span>
        <span className="block text-[11px] text-slate-500 truncate">{i.type} · {clientName(i.clientId)} · {stageLabel(i.stage)}</span>
      </span>
      <span className="shrink-0 text-[11px] text-slate-500 flex items-center gap-1"><Clock size={10} />{timeOf(i)}</span>
    </button>
  );
}

/** items: the already-filtered authorized dataset. month: 'YYYY-MM'. todayKey: 'YYYY-MM-DD'. */
export default function StudioCalendar({ items, month, todayKey, selectedId, onOpen, clientName = () => '' }) {
  const grid = useMemo(() => studioMonthGrid(month), [month]);
  const { byDay, unscheduled } = useMemo(() => groupStudioByDay(items), [items]);
  const firstWithItems = grid.find(c => c.inMonth && byDay[c.key])?.key;
  const [picked, setPicked] = useState(null);
  const pickedKey = picked && picked.startsWith(month) ? picked
    : (todayKey && todayKey.startsWith(month) ? todayKey : firstWithItems || `${month}-01`);
  const dayItems = byDay[pickedKey] || [];

  return (
    <div className="space-y-4" data-testid="studio-calendar">
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200" aria-hidden="true">
          {WEEKDAYS.map(d => <div key={d} className="py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="Content calendar month">
          {grid.map(c => {
            const list = byDay[c.key] || [];
            const isToday = c.key === todayKey;
            const isPicked = c.key === pickedKey;
            return (
              <div key={c.key} role="gridcell" data-testid={`calendar-cell-${c.key}`} aria-label={`${longDay(c.key)}, ${list.length} item${list.length === 1 ? '' : 's'}`}
                className={`min-w-0 min-h-[56px] md:min-h-[112px] border-b border-r border-slate-100 p-1 ${c.inMonth ? 'bg-white' : 'bg-slate-50/70'} ${isPicked ? 'md:bg-white bg-indigo-50/60' : ''}`}>
                <button type="button" data-testid={`button-calendar-day-${c.key}`} onClick={() => setPicked(c.key)} aria-pressed={isPicked}
                  className="w-full flex items-center justify-between gap-1 rounded-md px-0.5 focus-visible:outline-none focus-visible:ring-2 ring-indigo-400">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${isToday ? 'bg-indigo-600 text-white' : c.inMonth ? 'text-slate-700' : 'text-slate-300'}`}>{c.day}</span>
                  {list.length > 0 && <span className="text-[10px] font-bold text-indigo-600">{list.length}</span>}
                </button>
                {list.length > 0 && (
                  <>
                    <div className="hidden md:block space-y-1 mt-1">
                      {list.slice(0, 3).map(i => <Chip key={i.id} i={i} active={i.id === selectedId} onOpen={onOpen} clientName={clientName} />)}
                      {list.length > 3 && <button type="button" onClick={() => setPicked(c.key)} className="text-[10px] font-semibold text-indigo-600 hover:underline">+{list.length - 3} more</button>}
                    </div>
                    <div className="md:hidden flex flex-wrap justify-center gap-0.5 mt-1" aria-hidden="true">
                      {list.slice(0, 4).map(i => <i key={i.id} className={`w-1.5 h-1.5 rounded-full ${dot(i)}`} />)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected-day agenda: primary on mobile, overflow ("+N more") on desktop. */}
      <section aria-label="Selected day" data-testid="calendar-day-agenda" className={`space-y-2 ${dayItems.length > 3 ? '' : 'md:hidden'}`}>
        <h4 className="text-sm font-bold text-slate-800">{longDay(pickedKey)} <span className="text-xs font-normal text-slate-400">· {dayItems.length} item{dayItems.length === 1 ? '' : 's'}</span></h4>
        {dayItems.length === 0
          ? <p className="text-xs text-slate-400">Nothing planned on this day.</p>
          : dayItems.map(i => <AgendaRow key={i.id} i={i} active={i.id === selectedId} onOpen={onOpen} clientName={clientName} />)}
      </section>

      <section aria-label="Unscheduled" data-testid="calendar-unscheduled">
        <h4 className="text-sm font-bold text-slate-800 mb-2">Without a posting date <span className="text-xs font-normal text-slate-400">({unscheduled.length})</span></h4>
        {unscheduled.length === 0 ? <p className="text-xs text-slate-400">Every deliverable has a planned post time.</p> : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {unscheduled.map(i => (
              <button key={i.id} type="button" data-testid={`unscheduled-item-${i.id}`} onClick={() => onOpen(i.id)}
                className={`text-left rounded-xl border border-slate-200 px-3 py-2 bg-white hover:bg-slate-50 ${i.id === selectedId ? '!bg-indigo-50' : ''}`}>
                <span className="block text-sm font-semibold truncate">{i.title}</span>
                <span className="block text-[11px] text-slate-500 truncate">{i.type} · {clientName(i.clientId)} · {stageLabel(i.stage)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
