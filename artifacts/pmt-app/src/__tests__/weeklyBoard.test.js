/**
 * Tests for the weekly task board — week navigation, grouping, and persistence.
 *
 * Covers:
 *  1. localStorage round-trip for the card/list view toggle
 *  2. Week navigation: tasks land in the correct column for offset ±N weeks
 *  3. Tasks with no due date always land in the noDueDate bucket
 *  4. Tasks outside the visible week land in noDueDate (not silently dropped)
 *  5. After a reschedule, the updated task appears in the new column immediately
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { format, addDays, startOfWeek } from 'date-fns';
import {
  getWeekDays,
  parseDueDate,
  groupTasksByDay,
  formatWeekLabel,
  isToday,
} from '../PMT/shared/weekUtils.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Monday of the current ISO week. */
const thisMonday = () => startOfWeek(new Date(), { weekStartsOn: 1 });

/** Format a Date as the "do MMM yyyy" string the app stores. */
const asAppDate = (d) => format(d, 'do MMM yyyy');

/** Build a minimal task object. */
const makeTask = (id, dueDateStr) => ({ id, name: `Task ${id}`, dueDate: dueDateStr ?? null });

// ─── 1. localStorage view-toggle persistence ─────────────────────────────────

describe('localStorage view-toggle persistence', () => {
  const KEY = 'pmt_view_personal';

  // Use a plain in-memory store so tests remain isolated from each other
  let store;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem:  (k) => store[k] ?? null,
      setItem:  (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('defaults to "list" when no value is stored', () => {
    const view = localStorage.getItem(KEY) || 'list';
    expect(view).toBe('list');
  });

  it('persists "card" so a simulated reload reads it back', () => {
    // Simulate user switching to card view
    localStorage.setItem(KEY, 'card');

    // Simulate page reload — read the persisted value
    const viewAfterReload = localStorage.getItem(KEY) || 'list';
    expect(viewAfterReload).toBe('card');
  });

  it('switching back to list persists correctly', () => {
    localStorage.setItem(KEY, 'card');
    localStorage.setItem(KEY, 'list');
    expect(localStorage.getItem(KEY)).toBe('list');
  });
});

// ─── 2. getWeekDays — week offset navigation ─────────────────────────────────

describe('getWeekDays', () => {
  it('returns 7 days starting on Monday for offset 0', () => {
    const days = getWeekDays(0);
    expect(days).toHaveLength(7);
    // First day is Monday (getDay() === 1)
    expect(days[0].getDay()).toBe(1);
  });

  it('offset +1 returns next week', () => {
    const thisMon = thisMonday();
    const days = getWeekDays(1);
    const expectedMon = addDays(thisMon, 7);
    expect(format(days[0], 'yyyy-MM-dd')).toBe(format(expectedMon, 'yyyy-MM-dd'));
  });

  it('offset -1 returns previous week', () => {
    const thisMon = thisMonday();
    const days = getWeekDays(-1);
    const expectedMon = addDays(thisMon, -7);
    expect(format(days[0], 'yyyy-MM-dd')).toBe(format(expectedMon, 'yyyy-MM-dd'));
  });

  it('large positive offset advances by the right number of weeks', () => {
    const thisMon = thisMonday();
    const days = getWeekDays(4);
    const expected = addDays(thisMon, 28);
    expect(format(days[0], 'yyyy-MM-dd')).toBe(format(expected, 'yyyy-MM-dd'));
  });
});

// ─── 3. groupTasksByDay — correct column assignment ───────────────────────────

describe('groupTasksByDay — week navigation places tasks in correct columns', () => {
  it('a task due on Wednesday of the current week lands in the Wednesday column', () => {
    const weekDays = getWeekDays(0);
    const wednesday = weekDays[2]; // index 2 = Wednesday
    const task = makeTask('t1', asAppDate(wednesday));

    const { byDay, noDueDate } = groupTasksByDay([task], weekDays);
    const wedKey = format(wednesday, 'yyyy-MM-dd');

    expect(byDay[wedKey]).toHaveLength(1);
    expect(byDay[wedKey][0].id).toBe('t1');
    expect(noDueDate).toHaveLength(0);
  });

  it('navigating to next week: a task due next Friday lands in Friday column of that week', () => {
    const nextWeekDays = getWeekDays(1);
    const nextFriday = nextWeekDays[4]; // index 4 = Friday
    const task = makeTask('t2', asAppDate(nextFriday));

    const { byDay, noDueDate } = groupTasksByDay([task], nextWeekDays);
    const friKey = format(nextFriday, 'yyyy-MM-dd');

    expect(byDay[friKey]).toHaveLength(1);
    expect(byDay[friKey][0].id).toBe('t2');
    expect(noDueDate).toHaveLength(0);
  });

  it('navigating away: the same task disappears from byDay when the week changes', () => {
    // Task is due this Wednesday
    const thisWeekDays = getWeekDays(0);
    const wednesday = thisWeekDays[2];
    const task = makeTask('t3', asAppDate(wednesday));

    // When we navigate to next week, the task should NOT appear in any column
    const nextWeekDays = getWeekDays(1);
    const { byDay, noDueDate } = groupTasksByDay([task], nextWeekDays);

    const allInByDay = Object.values(byDay).flat();
    expect(allInByDay).toHaveLength(0);
    // It falls into noDueDate (outside-week bucket) — task is not silently lost
    expect(noDueDate).toHaveLength(1);
    expect(noDueDate[0].id).toBe('t3');
  });

  it('multiple tasks on different days of the same week each land in their own column', () => {
    const weekDays = getWeekDays(0);
    const tasks = [
      makeTask('mon', asAppDate(weekDays[0])),
      makeTask('tue', asAppDate(weekDays[1])),
      makeTask('fri', asAppDate(weekDays[4])),
    ];

    const { byDay, noDueDate } = groupTasksByDay(tasks, weekDays);

    expect(byDay[format(weekDays[0], 'yyyy-MM-dd')]).toHaveLength(1);
    expect(byDay[format(weekDays[1], 'yyyy-MM-dd')]).toHaveLength(1);
    expect(byDay[format(weekDays[4], 'yyyy-MM-dd')]).toHaveLength(1);
    expect(noDueDate).toHaveLength(0);
  });
});

// ─── 4. Tasks with no due date always land in noDueDate ───────────────────────

describe('groupTasksByDay — no-due-date bucket', () => {
  it('task with null dueDate always goes to noDueDate (offset 0)', () => {
    const weekDays = getWeekDays(0);
    const task = makeTask('x1', null);
    const { byDay, noDueDate } = groupTasksByDay([task], weekDays);

    expect(noDueDate).toHaveLength(1);
    expect(noDueDate[0].id).toBe('x1');
    Object.values(byDay).forEach(col => expect(col).toHaveLength(0));
  });

  it('task with null dueDate always goes to noDueDate (offset +2)', () => {
    const weekDays = getWeekDays(2);
    const task = makeTask('x2', null);
    const { noDueDate } = groupTasksByDay([task], weekDays);
    expect(noDueDate[0].id).toBe('x2');
  });

  it('task with null dueDate always goes to noDueDate (offset -3)', () => {
    const weekDays = getWeekDays(-3);
    const task = makeTask('x3', null);
    const { noDueDate } = groupTasksByDay([task], weekDays);
    expect(noDueDate[0].id).toBe('x3');
  });

  it('task with unparseable dueDate string goes to noDueDate', () => {
    const weekDays = getWeekDays(0);
    const task = makeTask('x4', 'not-a-date');
    const { noDueDate } = groupTasksByDay([task], weekDays);
    expect(noDueDate[0].id).toBe('x4');
  });

  it('mix: dated and undated tasks are split correctly', () => {
    const weekDays = getWeekDays(0);
    const dated = makeTask('d1', asAppDate(weekDays[0]));
    const undated = makeTask('u1', null);

    const { byDay, noDueDate } = groupTasksByDay([dated, undated], weekDays);

    expect(noDueDate).toHaveLength(1);
    expect(noDueDate[0].id).toBe('u1');
    expect(byDay[format(weekDays[0], 'yyyy-MM-dd')]).toHaveLength(1);
  });
});

// ─── 5. Post-reschedule: task appears in new column immediately ────────────────

describe('groupTasksByDay — post-reschedule column update', () => {
  it('moving a task to a different day within the week places it in the new column', () => {
    const weekDays = getWeekDays(0);
    const monday = weekDays[0];
    const thursday = weekDays[3];

    // Before move: task is on Monday
    const taskBefore = makeTask('m1', asAppDate(monday));
    const beforeResult = groupTasksByDay([taskBefore], weekDays);
    expect(beforeResult.byDay[format(monday, 'yyyy-MM-dd')]).toHaveLength(1);
    expect(beforeResult.byDay[format(thursday, 'yyyy-MM-dd')]).toHaveLength(0);

    // After move: task's dueDate is updated to Thursday
    const taskAfter = { ...taskBefore, dueDate: asAppDate(thursday) };
    const afterResult = groupTasksByDay([taskAfter], weekDays);
    expect(afterResult.byDay[format(monday, 'yyyy-MM-dd')]).toHaveLength(0);
    expect(afterResult.byDay[format(thursday, 'yyyy-MM-dd')]).toHaveLength(1);
    expect(afterResult.byDay[format(thursday, 'yyyy-MM-dd')][0].id).toBe('m1');
  });

  it('moving a task from a dated column to null drops it into noDueDate', () => {
    const weekDays = getWeekDays(0);
    const friday = weekDays[4];

    const taskBefore = makeTask('m2', asAppDate(friday));
    const taskAfter = { ...taskBefore, dueDate: null };

    const { byDay: byDayBefore } = groupTasksByDay([taskBefore], weekDays);
    expect(byDayBefore[format(friday, 'yyyy-MM-dd')]).toHaveLength(1);

    const { byDay: byDayAfter, noDueDate } = groupTasksByDay([taskAfter], weekDays);
    expect(byDayAfter[format(friday, 'yyyy-MM-dd')]).toHaveLength(0);
    expect(noDueDate[0].id).toBe('m2');
  });

  it('moving a task to a date in a different week removes it from the visible week', () => {
    const weekDays = getWeekDays(0);
    const thisMonday = weekDays[0];
    const nextMonday = addDays(thisMonday, 7);

    const task = makeTask('m3', asAppDate(nextMonday));
    const { byDay, noDueDate } = groupTasksByDay([task], weekDays);

    // Task is scheduled next week — not in any day column this week, stored in noDueDate bucket
    const allInByDay = Object.values(byDay).flat();
    expect(allInByDay).toHaveLength(0);
    expect(noDueDate[0].id).toBe('m3');
  });
});

// ─── 6. parseDueDate — date format robustness ─────────────────────────────────

describe('parseDueDate', () => {
  it('parses "do MMM yyyy" format (e.g. "3rd Aug 2026")', () => {
    const d = parseDueDate('3rd Aug 2026');
    expect(d).not.toBeNull();
    expect(d.getMonth()).toBe(7); // August
    expect(d.getDate()).toBe(3);
  });

  it('parses "d MMM yyyy" format (e.g. "3 Aug 2026")', () => {
    const d = parseDueDate('3 Aug 2026');
    expect(d).not.toBeNull();
    expect(d.getDate()).toBe(3);
  });

  it('parses ISO "yyyy-MM-dd" format', () => {
    const d = parseDueDate('2026-08-03');
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(3);
  });

  it('returns null for null input', () => {
    expect(parseDueDate(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDueDate('')).toBeNull();
  });

  it('returns null for unrecognised string', () => {
    expect(parseDueDate('banana')).toBeNull();
  });
});

// ─── 7. formatWeekLabel — human-readable range ───────────────────────────────

describe('formatWeekLabel', () => {
  it('returns a non-empty string for any week offset', () => {
    [-2, -1, 0, 1, 2].forEach(offset => {
      const label = formatWeekLabel(getWeekDays(offset));
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });
  });

  it('includes the year in the label', () => {
    const label = formatWeekLabel(getWeekDays(0));
    expect(label).toMatch(/\d{4}/);
  });
});
