import { startOfWeek, addDays, format, parse, isBefore } from 'date-fns';

/** Mon–Sun array for the current week ± weekOffset weeks. */
export function getWeekDays(weekOffset = 0) {
  const base = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStart = addDays(base, weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Parse the task dueDate string (stored as 'do MMM yyyy' or ISO). */
export function parseDueDate(raw) {
  if (!raw) return null;
  const fmts = ['do MMM yyyy', 'd MMM yyyy', 'dd MMM yyyy', 'yyyy-MM-dd'];
  for (const fmt of fmts) {
    try {
      const d = parse(raw, fmt, new Date());
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Group tasks into day buckets and a "no due date" bucket.
 * Tasks whose dueDate falls outside the given weekDays land in noDueDate.
 */
export function groupTasksByDay(tasks, weekDays) {
  const byDay = {};
  weekDays.forEach(d => { byDay[format(d, 'yyyy-MM-dd')] = []; });
  const noDueDate = [];

  (tasks || []).forEach(task => {
    if (!task.dueDate) { noDueDate.push(task); return; }
    const d = parseDueDate(task.dueDate);
    if (!d) { noDueDate.push(task); return; }
    const key = format(d, 'yyyy-MM-dd');
    if (byDay[key] !== undefined) byDay[key].push(task);
    else noDueDate.push(task); // outside this week — hide in "no due date" bucket
  });

  return { byDay, noDueDate };
}

/** True if the task is past its due date and not yet Done. */
export function isOverdue(task) {
  if (!task.dueDate || task.status === 'Done') return false;
  const d = parseDueDate(task.dueDate);
  if (!d) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return isBefore(d, today);
}

/**
 * Build a new Date from newDate but keep any time-of-day from originalDueDateStr
 * if it has meaningful hour/minute components.
 */
export function preserveTime(originalDueDateStr, newDate) {
  const orig = parseDueDate(originalDueDateStr);
  if (!orig || (orig.getHours() === 0 && orig.getMinutes() === 0)) return newDate;
  const result = new Date(newDate);
  result.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
  return result;
}

/** Human-readable label for the week, e.g. "28 Jul – 3 Aug 2025". */
export function formatWeekLabel(weekDays) {
  const first = weekDays[0];
  const last = weekDays[6];
  if (first.getMonth() === last.getMonth()) {
    return `${format(first, 'd')}–${format(last, 'd MMM yyyy')}`;
  }
  return `${format(first, 'd MMM')} – ${format(last, 'd MMM yyyy')}`;
}

/** Short day label — "Mon", "Tue", etc. */
export function formatDayLabel(date) {
  return format(date, 'EEE');
}

/** "3 Aug" style date label for column header. */
export function formatColumnDate(date) {
  return format(date, 'd MMM');
}

/** True if the date matches today (local time). */
export function isToday(date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
}
