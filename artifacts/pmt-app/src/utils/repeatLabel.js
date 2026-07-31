/**
 * Human-readable repeat schedule helpers.
 * Used across HomeView, ClientView (web) and referenced for mobile.
 */

const ORDINALS = ['1st', '2nd', '3rd', '4th'];
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * Returns the display label for a task's repeat schedule, e.g.:
 *   "Monthly · 5th"   when repeatDayOfMonth is set
 *   "Monthly · 2nd Tue"  when repeatMonthlyWeek/Day are set
 *   "Weekly", "Daily", etc. for other frequencies
 *   null when repeatFrequency is absent, "Once", or "One-time"
 */
export function formatRepeatLabel(task) {
  const freq = task?.repeatFrequency;
  if (!freq || freq === 'Once' || freq === 'One-time') return null;

  if (freq === 'Monthly') {
    if (task.repeatDayOfMonth) {
      const dom = Number(task.repeatDayOfMonth);
      const suffix = dom === 1 ? 'st' : dom === 2 ? 'nd' : dom === 3 ? 'rd' : 'th';
      return `Monthly · ${dom}${suffix}`;
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
  const rule = task?.repeatWeekendRule;
  if (!rule || rule === 'none') return null;
  return rule === 'prev-friday' ? '← Fri if weekend' : 'Mon if weekend →';
}

/**
 * Tailwind class string for the repeat badge colour based on frequency.
 */
export function repeatBadgeColor(freq) {
  if (freq === 'Daily')       return 'bg-emerald-100 text-emerald-700';
  if (freq === 'Weekly')      return 'bg-blue-100 text-blue-700';
  if (freq === 'Fortnightly') return 'bg-cyan-100 text-cyan-700';
  if (freq === 'Monthly')     return 'bg-purple-100 text-purple-700';
  if (freq === 'Quarterly')   return 'bg-orange-100 text-orange-700';
  if (freq === 'Yearly')      return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}
