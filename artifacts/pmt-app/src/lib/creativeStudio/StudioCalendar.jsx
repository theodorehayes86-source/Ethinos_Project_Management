// Monthly Monday-first calendar for the Content plan. Read-only placement:
// clicking an item calls onOpen(id); planned dates are never changed here.
// Duplicated in pmt-mobile; keep in sync.
import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { stageLabel, fmtInstant, tzShort } from './core.js';
import { studioMonthGrid, groupStudioByDay, DEADLINE_TONES, studioDeadlineTone, mostUrgentStudioTone } from './calendar.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const tone = (i, now) => DEADLINE_TONES[studioDeadlineTone(i, now)];
const timeOf = (i) => `${fmtInstant(i.plannedAt, i.timezone, { day: undefined, month: undefined })} ${tzShort(i.timezone)}`;
const longDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); };

const deadlineText = (i, now) => `${i.productionDueDate
  ? `Production deadline: ${i.productionDueDate}${i.productionDueTime ? ` ${i.productionDueTime}` : ' (time not set; due all day)'} ${tzShort(i.timezone)}`
  : i.plannedAt ? `Posting deadline: ${fmtInstant(i.plannedAt, i.timezone)} ${tzShort(i.timezone)}` : 'No deadline'} · ${tone(i, now).label}`;

export function StudioDeadlineLegend() {
  return (
    <div data-testid="calendar-deadline-legend" className="space-y-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600" aria-label="Deadline colours">
        {Object.entries(DEADLINE_TONES).map(([key, t]) => (
          <span key={key} className="inline-flex items-center gap-1.5"><i aria-hidden="true" className={`w-2 h-2 rounded-full ${t.dot}`} />{t.label}</span>
        ))}
      </div>
      <p className="text-[10px] text-slate-400">Production deadline when available; otherwise posting time. Each date shows its most urgent item. Date-only deadlines remain due all day.</p>
    </div>
  );
}

function Chip({ i, active, onOpen, clientName, now }) {
  return (
    <button type="button" data-testid={`calendar-item-${i.id}`} onClick={() => onOpen(i.id)}
      title={deadlineText(i, now)} aria-label={`${i.title}, ${i.type}, ${clientName(i.clientId)}, ${stageLabel(i.stage)}, ${timeOf(i)}, ${deadlineText(i, now)}`}
      className={`w-full text-left rounded-md border border-slate-200 border-l-[3px] ${tone(i, now).border} px-1.5 py-1 bg-white hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 ring-indigo-400 ${active ? '!bg-indigo-50 border-indigo-200' : ''} ${i.archived ? 'opacity-60' : ''}`}>
      <span className="block text-[11px] font-semibold text-slate-800 truncate">{i.title}</span>
      <span className="block text-[10px] text-slate-500 truncate">{i.type} · {clientName(i.clientId)}</span>
      <span className="block text-[10px] text-slate-400 truncate">{stageLabel(i.stage)}{i.scheduled ? ' · Scheduled' : ''}</span>
    </button>
  );
}

function AgendaRow({ i, active, onOpen, clientName, now }) {
  return (
    <button type="button" data-testid={`agenda-item-${i.id}`} onClick={() => onOpen(i.id)}
      title={deadlineText(i, now)} className={`w-full text-left flex items-start gap-2.5 rounded-xl border border-slate-200 border-l-4 ${tone(i, now).border} px-3 py-2 bg-white hover:bg-slate-50 ${active ? '!bg-indigo-50' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{i.title}</span>
        <span className="block text-[11px] text-slate-500 truncate">{i.type} · {clientName(i.clientId)} · {stageLabel(i.stage)}</span>
        <span className="block text-[10px] text-slate-500">{deadlineText(i, now)}</span>
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
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const pickedKey = picked && picked.startsWith(month) ? picked
    : (todayKey && todayKey.startsWith(month) ? todayKey : firstWithItems || `${month}-01`);
  const dayItems = byDay[pickedKey] || [];

  return (
    <div className="space-y-4" data-testid="studio-calendar">
      <StudioDeadlineLegend />
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200" aria-hidden="true">
          {WEEKDAYS.map(d => <div key={d} className="py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="Content calendar month">
          {grid.map(c => {
            const list = byDay[c.key] || [];
            const isToday = c.key === todayKey;
            const isPicked = c.key === pickedKey;
            const dayTone = DEADLINE_TONES[mostUrgentStudioTone(list, now)];
            return (
              <div key={c.key} role="gridcell" data-testid={`calendar-cell-${c.key}`} aria-label={`${longDay(c.key)}, ${list.length} item${list.length === 1 ? '' : 's'}`}
                className={`min-w-0 min-h-[56px] md:min-h-[112px] border-b border-r border-slate-100 p-1 ${c.inMonth ? 'bg-white' : 'bg-slate-50/70'} ${isPicked ? 'md:bg-white bg-indigo-50/60' : ''}`}>
                <button type="button" data-testid={`button-calendar-day-${c.key}`} onClick={() => setPicked(c.key)} aria-pressed={isPicked}
                  className="w-full flex items-center justify-between gap-1 rounded-md px-0.5 focus-visible:outline-none focus-visible:ring-2 ring-indigo-400">
                  <span title={list.length ? dayTone.label : undefined} className={`inline-flex items-center justify-center w-6 h-6 rounded-full border border-transparent text-[11px] font-bold ${list.length ? dayTone.badge : c.inMonth ? 'text-slate-700' : 'text-slate-300'} ${isToday ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}>{c.day}</span>
                  {list.length > 0 && <span className="text-[10px] font-bold text-indigo-600">{list.length}</span>}
                </button>
                {list.length > 0 && (
                  <>
                    <div className="hidden md:block space-y-1 mt-1">
                      {list.slice(0, 3).map(i => <Chip key={i.id} i={i} active={i.id === selectedId} onOpen={onOpen} clientName={clientName} now={now} />)}
                      {list.length > 3 && <button type="button" onClick={() => setPicked(c.key)} className="text-[10px] font-semibold text-indigo-600 hover:underline">+{list.length - 3} more</button>}
                    </div>
                    <div className="md:hidden flex flex-wrap justify-center gap-0.5 mt-1" aria-hidden="true">
                      {list.slice(0, 4).map(i => <i key={i.id} className={`w-1.5 h-1.5 rounded-full ${tone(i, now).dot}`} />)}
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
          : dayItems.map(i => <AgendaRow key={i.id} i={i} active={i.id === selectedId} onOpen={onOpen} clientName={clientName} now={now} />)}
      </section>

      <section aria-label="Unscheduled" data-testid="calendar-unscheduled">
        <h4 className="text-sm font-bold text-slate-800 mb-2">Without a posting date <span className="text-xs font-normal text-slate-400">({unscheduled.length})</span></h4>
        {unscheduled.length === 0 ? <p className="text-xs text-slate-400">Every deliverable has a planned post time.</p> : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {unscheduled.map(i => (
              <button key={i.id} type="button" data-testid={`unscheduled-item-${i.id}`} onClick={() => onOpen(i.id)}
                title={deadlineText(i, now)} className={`text-left rounded-xl border border-slate-200 border-l-4 ${tone(i, now).border} px-3 py-2 bg-white hover:bg-slate-50 ${i.id === selectedId ? '!bg-indigo-50' : ''}`}>
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
