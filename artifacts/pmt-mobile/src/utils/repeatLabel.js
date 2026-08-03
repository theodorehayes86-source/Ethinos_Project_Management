/**
 * Human-readable repeat schedule helpers for the mobile app.
 * Mirrors artifacts/pmt-app/src/utils/repeatLabel.js.
 */

import { formatOrdinal } from './recurrence.js';

const ORDINALS = ['1st', '2nd', '3rd', '4th'];
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * Returns the display label for a task's repeat schedule, e.g.:
 *   "Monthly · 5th"      when repeatDayOfMonth is set
 *   "Monthly · 2nd Tue"  when repeatMonthlyWeek/Day are set
 *   "Weekly", "Daily"    for other frequencies
 *   null                 when repeatFrequency is absent, "Once", or "One-time"
 */
export function formatRepeatLabel(task) {
  const freq = task?.repeatFrequency;
  if (!freq || freq === 'Once' || freq === 'One-time') return null;

  if (freq === 'Monthly') {
    if (task.repeatDayOfMonth) {
      const dom = Number(task.repeatDayOfMonth);
      return `Monthly · ${formatOrdinal(dom)}`;
    }
    if (task.repeatMonthlyWeek != null && task.repeatMonthlyDay != null) {
      const ord = ORDINALS[task.repeatMonthlyWeek - 1] || '';
      const day = WEEKDAY_SHORT[task.repeatMonthlyDay] || '';
      return `Monthly · ${ord} ${day}`.trim();
    }
  }

  return freq;
}

/**
 * Returns a short label for the weekend adjustment rule, or null if none.
 *   "← Fri if weekend"  for prev-friday
 *   "Mon if weekend →"  for next-monday
 */
export function formatWeekendRuleLabel(task) {
  if (!task?.repeatDayOfMonth) return null;
  switch (task.repeatWeekendRule) {
    case 'prev-friday':  return '← Fri if weekend';
    case 'next-monday':  return 'Mon if weekend →';
    default:             return null;
  }
}
