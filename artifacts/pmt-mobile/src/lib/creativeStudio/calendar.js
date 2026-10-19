// Pure helpers for the Content plan calendar. Day placement uses each item's
// own timezone via dayKey(); grid math is done on UTC calendar days so the
// viewer's browser timezone can never shift a cell. Duplicated in pmt-mobile.
import { dayKey } from './core.js';

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
