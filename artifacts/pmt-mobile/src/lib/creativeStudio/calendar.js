// Pure helpers for the Content plan calendar. Day placement uses each item's
// own timezone via dayKey(); grid math is done on UTC calendar days so the
// viewer's browser timezone can never shift a cell. Duplicated in pmt-mobile.
import { dayKey, localToUtc } from './core.js';

const z = (n) => String(n).padStart(2, '0');
const keyOf = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`; };

/** 6x7 Monday-first grid for 'YYYY-MM'. Each cell: { key, day, inMonth, weekday }. */
export function studioMonthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const ms = first + (i - offset) * 86400000;
    const d = new Date(ms);
    return { key: keyOf(ms), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1, weekday: (d.getUTCDay() + 6) % 7 };
  });
}

/** Groups scheduled items by local day in THEIR timezone; unscheduled returned separately. Sorted by instant. */
export function groupStudioByDay(items) {
  const byDay = {};
  const unscheduled = [];
  [...(items || [])].sort((a, b) => (Date.parse(a.plannedAt) || 0) - (Date.parse(b.plannedAt) || 0)).forEach(i => {
    if (!i.plannedAt || !Number.isFinite(Date.parse(i.plannedAt))) { unscheduled.push(i); return; }
    const k = dayKey(i.plannedAt, i.timezone);
    (byDay[k] = byDay[k] || []).push(i);
  });
  return { byDay, unscheduled };
}

export const isStudioLayout = (v) => v === 'list' || v === 'calendar';

export const DEADLINE_TONES = {
  far: { label: 'More than 7 days away', border: 'border-l-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  middle: { label: '3–7 days away', border: 'border-l-orange-500', dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-800 border-orange-200' },
  close: { label: 'Within 2 days', border: 'border-l-red-500', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-300' },
  overdue: { label: 'Past deadline', border: 'border-l-red-900', dot: 'bg-red-900', badge: 'bg-red-900 text-white border-red-950' },
  none: { label: 'No deadline', border: 'border-l-slate-300', dot: 'bg-slate-300', badge: 'bg-slate-50 text-slate-600 border-slate-200' },
};

/** Production deadline takes priority; otherwise use posting time.
 * Date-only deadlines stay due all day in the item's timezone.
 * Clients use their authorized projection (posting time, no internal deadline).
 */
export function studioDeadlineTone(item, now = Date.now()) {
  const zone = item.timezone || 'Asia/Kolkata';
  let deadline;
  if (item.productionDueDate) {
    if (!item.productionDueTime) {
      const today = dayKey(new Date(now).toISOString(), zone);
      const days = (Date.parse(item.productionDueDate) - Date.parse(today)) / 86400000;
      if (!Number.isFinite(days)) return 'none';
      return days < 0 ? 'overdue' : days <= 2 ? 'close' : days <= 7 ? 'middle' : 'far';
    }
    deadline = Date.parse(localToUtc(item.productionDueDate, item.productionDueTime, zone));
  } else {
    deadline = Date.parse(item.plannedAt);
  }
  if (!Number.isFinite(deadline)) return 'none';
  const days = (deadline - now) / 86400000;
  return days < 0 ? 'overdue' : days <= 2 ? 'close' : days <= 7 ? 'middle' : 'far';
}

export function mostUrgentStudioTone(items, now = Date.now()) {
  const tones = new Set(items.map(i => studioDeadlineTone(i, now)));
  return ['overdue', 'close', 'middle', 'far'].find(t => tones.has(t)) || 'none';
}
