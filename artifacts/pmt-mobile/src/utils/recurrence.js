/**
 * Shared recurrence utilities — mobile copy.
 * Identical logic lives in artifacts/pmt-app/src/utils/recurrence.js —
 * keep both in sync whenever either file is edited.
 */

// ─── Shared label constants ────────────────────────────────────────────────
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const WEEKDAY_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const WEEK_ORDINALS = ['1st', '2nd', '3rd', '4th'];

// ─── Ordinal formatting ────────────────────────────────────────────────────

/**
 * Correct English ordinal for any positive integer.
 *   1→"1st", 2→"2nd", 11→"11th", 21→"21st", 22→"22nd", 23→"23rd"
 */
export function formatOrdinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

// ─── Date parsing ──────────────────────────────────────────────────────────

/**
 * Parse a 'YYYY-MM-DD' string as **local** midnight — avoids the UTC shift
 * that `new Date('YYYY-MM-DD')` introduces in negative-offset timezones.
 *
 * Returns a Date set to 00:00:00.000 in the local timezone, or null on
 * invalid input.
 */
export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const out = new Date(y, m - 1, d);
  return isNaN(out.getTime()) ? null : out;
}

// ─── Recurrence helpers ────────────────────────────────────────────────────

/**
 * Return the Nth occurrence of a weekday within a month, or null when the
 * month doesn't contain enough of that weekday (e.g. 5th Monday).
 *
 * dayIdx uses the app's Mon-indexed convention: 0=Mon … 4=Fri.
 */
export function getNthWeekday(year, month, weekNum, dayIdx) {
  const jsDay = dayIdx + 1; // Mon=1 … Fri=5
  let count = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === jsDay) {
      count++;
      if (count === weekNum) return new Date(year, month, d);
    }
  }
  return null;
}

/**
 * Shift a date that falls on a weekend per the adjustment rule.
 *
 * rule: 'none' | 'prev-friday' | 'next-monday'
 *
 * Edge-case: moving the 1st of a month (Sunday) back with 'prev-friday' can
 * land in the previous month. This is intentional and consistent across
 * mobile and desktop.
 */
export function applyWeekendRule(date, rule) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  if (dow !== 0 && dow !== 6) return date;
  const out = new Date(date);
  if (rule === 'prev-friday') {
    out.setDate(date.getDate() + (dow === 0 ? -2 : -1));
  } else if (rule === 'next-monday') {
    out.setDate(date.getDate() + (dow === 0 ? 1 : 2));
  }
  return out;
}

// ─── Core generator ────────────────────────────────────────────────────────

/**
 * Generate every recurring task date in [startDate, endDate] for the given
 * frequency and options.
 *
 * Returns an empty array when:
 *   • dates are invalid or endDate < startDate
 *   • specific-date dom is outside 1–28
 *   • nth-weekday rWeek is outside 1–4
 *   • nth-weekday rDay  is outside 0–4
 *   • frequency is unrecognised (not Daily / Weekly / Monthly)
 *
 * Output is deduplicated by local calendar date and sorted ascending.
 *
 * @param {Date}                startDate
 * @param {Date}                endDate
 * @param {string}              freq          - 'Daily' | 'Weekly' | 'Monthly'
 * @param {number[]|null}       rDays         - Mon-indexed weekday indices for Weekly (0=Mon…4=Fri)
 * @param {number|null}         rWeek         - ordinal 1–4 for nth-weekday Monthly
 * @param {number|null}         rDay          - Mon-indexed day 0–4 for nth-weekday Monthly
 * @param {string|number|null}  rDayOfMonth   - fixed calendar day 1–28 for specific-date Monthly
 * @param {string|null}         rWeekendRule  - 'none' | 'prev-friday' | 'next-monday'
 * @returns {Date[]}
 */
export function generateRecurringDates(
  startDate, endDate, freq,
  rDays, rWeek, rDay,
  rDayOfMonth, rWeekendRule,
) {
  // ── Input validation ──────────────────────────────────────────────────────
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) return [];
  if (!(endDate instanceof Date)   || isNaN(endDate.getTime()))   return [];
  if (endDate < startDate) return [];
  if (!['Daily', 'Weekly', 'Monthly'].includes(freq)) return [];

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const VALID_WEEKEND_RULES = new Set(['none', 'prev-friday', 'next-monday']);
  const effectiveWeekendRule = VALID_WEEKEND_RULES.has(rWeekendRule) ? rWeekendRule : 'none';

  const dates = [];

  // ── Daily ─────────────────────────────────────────────────────────────────
  if (freq === 'Daily') {
    const d = new Date(startDate);
    while (d <= end) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

  // ── Weekly ────────────────────────────────────────────────────────────────
  } else if (freq === 'Weekly') {
    const days = (rDays && rDays.length > 0) ? rDays : [0];
    const d = new Date(startDate);
    while (d <= end) {
      const dow = d.getDay();
      const mapped = dow === 0 ? -1 : dow - 1;
      if (days.includes(mapped)) dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

  // ── Monthly: specific-date ────────────────────────────────────────────────
  } else if (freq === 'Monthly' && rDayOfMonth != null && rDayOfMonth !== '') {
    const dom = parseInt(String(rDayOfMonth), 10);
    if (!Number.isInteger(dom) || dom < 1 || dom > 28) return [];
    let yr = startDate.getFullYear(), mo = startDate.getMonth();
    const endYr = end.getFullYear(), endMo = end.getMonth();
    while (yr < endYr || (yr === endYr && mo <= endMo)) {
      const daysInMonth = new Date(yr, mo + 1, 0).getDate();
      const raw = new Date(yr, mo, Math.min(dom, daysInMonth));
      const dt  = applyWeekendRule(raw, effectiveWeekendRule);
      if (dt >= startDate && dt <= end) dates.push(dt);
      mo++;
      if (mo > 11) { mo = 0; yr++; }
    }

  // ── Monthly: nth-weekday ──────────────────────────────────────────────────
  } else if (freq === 'Monthly') {
    const wk = (rWeek != null) ? Number(rWeek) : 1;
    const di = (rDay  != null) ? Number(rDay)  : 0;
    if (!Number.isInteger(wk) || wk < 1 || wk > 4) return [];
    if (!Number.isInteger(di) || di < 0 || di > 4) return [];
    let yr = startDate.getFullYear(), mo = startDate.getMonth();
    const endYr = end.getFullYear(), endMo = end.getMonth();
    while (yr < endYr || (yr === endYr && mo <= endMo)) {
      const dt = getNthWeekday(yr, mo, wk, di);
      if (dt && dt >= startDate && dt <= end) dates.push(dt);
      mo++;
      if (mo > 11) { mo = 0; yr++; }
    }
  }

  // ── Dedup by local calendar date, then sort ascending ─────────────────────
  const seen = new Set();
  const unique = dates.filter(d => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a - b);
  return unique;
}
