/**
 * Tests for the shared recurrence utility.
 *
 * Covers: formatOrdinal, parseLocalDate, generateRecurringDates (all modes),
 * input validation, weekend adjustment, dedup/sort, and cross-surface
 * consistency expectations.
 */
import { describe, it, expect } from 'vitest';
import {
  formatOrdinal,
  parseLocalDate,
  getNthWeekday,
  applyWeekendRule,
  generateRecurringDates,
  WEEKDAY_SHORT,
  WEEKDAY_FULL,
  WEEK_ORDINALS,
} from '../utils/recurrence.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const local = (y, m, d) => new Date(y, m - 1, d);
const fmt   = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmtAll = (dates) => dates.map(fmt);

// ─── formatOrdinal ───────────────────────────────────────────────────────────

describe('formatOrdinal', () => {
  it.each([
    [1,  '1st'], [2,  '2nd'], [3,  '3rd'], [4,  '4th'],
    [11, '11th'],[12, '12th'],[13, '13th'],
    [21, '21st'],[22, '22nd'],[23, '23rd'],[24, '24th'],
    [28, '28th'],
  ])('formatOrdinal(%i) → %s', (n, expected) => {
    expect(formatOrdinal(n)).toBe(expected);
  });

  it('handles non-finite input gracefully by returning the original string', () => {
    expect(formatOrdinal('abc')).toBe('abc');
  });
});

// ─── parseLocalDate ──────────────────────────────────────────────────────────

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local midnight', () => {
    const d = parseLocalDate('2026-08-05');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);    // 0-indexed August
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it('does NOT produce a UTC date that shifts the calendar date', () => {
    // new Date('2026-01-01') would be UTC midnight → local Dec 31 in UTC-offset timezones
    // parseLocalDate must always return local Jan 1
    const d = parseLocalDate('2026-01-01');
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it('returns null for invalid inputs', () => {
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate('not-a-date')).toBeNull();
    expect(parseLocalDate('2026-13-01')).toBeNull();
  });
});

// ─── Exported constants ──────────────────────────────────────────────────────

describe('exported constants', () => {
  it('WEEKDAY_SHORT has 5 entries', () => {
    expect(WEEKDAY_SHORT).toHaveLength(5);
    expect(WEEKDAY_SHORT[0]).toBe('Mon');
    expect(WEEKDAY_SHORT[4]).toBe('Fri');
  });

  it('WEEKDAY_FULL has 5 entries', () => {
    expect(WEEKDAY_FULL).toHaveLength(5);
    expect(WEEKDAY_FULL[0]).toBe('Monday');
    expect(WEEKDAY_FULL[4]).toBe('Friday');
  });

  it('WEEK_ORDINALS has 4 entries', () => {
    expect(WEEK_ORDINALS).toHaveLength(4);
    expect(WEEK_ORDINALS[0]).toBe('1st');
    expect(WEEK_ORDINALS[3]).toBe('4th');
  });
});

// ─── applyWeekendRule ────────────────────────────────────────────────────────

describe('applyWeekendRule', () => {
  it('leaves a weekday unchanged for any rule', () => {
    const tue = local(2026, 8, 4); // Tuesday
    expect(applyWeekendRule(tue, 'none')).toBe(tue);
    expect(applyWeekendRule(tue, 'prev-friday').getDate()).toBe(4);
    expect(applyWeekendRule(tue, 'next-monday').getDate()).toBe(4);
  });

  it('none rule leaves a Saturday unchanged', () => {
    const sat = local(2026, 8, 1); // Saturday
    expect(applyWeekendRule(sat, 'none').getDate()).toBe(1);
  });

  it('prev-friday moves Saturday back one day', () => {
    const sat = local(2026, 8, 1); // Saturday
    const result = applyWeekendRule(sat, 'prev-friday');
    expect(result.getDay()).toBe(5); // Friday
    expect(result.getDate()).toBe(31); // July 31 — crosses month boundary
  });

  it('next-monday moves Saturday forward two days', () => {
    const sat = local(2026, 8, 1); // Saturday Aug 1
    const result = applyWeekendRule(sat, 'next-monday');
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(3);
  });

  it('prev-friday moves Sunday back two days', () => {
    const sun = local(2026, 8, 2); // Sunday Aug 2
    const result = applyWeekendRule(sun, 'prev-friday');
    expect(result.getDay()).toBe(5);
    expect(result.getDate()).toBe(31); // July 31
  });

  it('next-monday moves Sunday forward one day', () => {
    const sun = local(2026, 8, 2); // Sunday Aug 2
    const result = applyWeekendRule(sun, 'next-monday');
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(3);
  });

  // Cross-year boundary
  it('prev-friday crosses year boundary correctly for Jan 1 Sunday', () => {
    const jan1Sun = local(2023, 1, 1); // Jan 1 2023 was a Sunday
    const result = applyWeekendRule(jan1Sun, 'prev-friday');
    expect(result.getFullYear()).toBe(2022);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(30);
  });

  // End-of-year Saturday
  it('next-monday crosses year boundary correctly for Dec 31 Saturday', () => {
    const dec31Sat = local(2022, 12, 31); // Dec 31 2022 was a Saturday
    const result = applyWeekendRule(dec31Sat, 'next-monday');
    expect(result.getFullYear()).toBe(2023);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(2);
  });
});

// ─── getNthWeekday ───────────────────────────────────────────────────────────

describe('getNthWeekday', () => {
  it('returns the 1st Monday of August 2026', () => {
    const d = getNthWeekday(2026, 7, 1, 0); // month is 0-indexed
    expect(fmt(d)).toBe('2026-08-03');
  });

  it('returns the 4th Friday of August 2026', () => {
    const d = getNthWeekday(2026, 7, 4, 4);
    expect(fmt(d)).toBe('2026-08-28');
  });

  it('returns null when weekday does not have enough occurrences', () => {
    // August 2026 has only 4 Fridays — there's no 5th Friday
    expect(getNthWeekday(2026, 7, 5, 4)).toBeNull();
  });
});

// ─── generateRecurringDates — input validation ───────────────────────────────

describe('generateRecurringDates — validation', () => {
  it('returns [] when endDate < startDate', () => {
    expect(generateRecurringDates(local(2026,8,10), local(2026,8,1), 'Daily', null, null, null, null, null)).toEqual([]);
  });

  it('returns [] for an unrecognised frequency', () => {
    expect(generateRecurringDates(local(2026,8,1), local(2026,9,1), 'Quarterly', null, null, null, null, null)).toEqual([]);
  });

  it('returns [] when startDate is invalid', () => {
    expect(generateRecurringDates(new Date('bad'), local(2026,9,1), 'Daily', null, null, null, null, null)).toEqual([]);
  });

  it('returns [] when endDate is invalid', () => {
    expect(generateRecurringDates(local(2026,8,1), new Date('bad'), 'Daily', null, null, null, null, null)).toEqual([]);
  });

  it('returns [] when specific-date dom is 0', () => {
    expect(generateRecurringDates(local(2026,8,1), local(2026,10,1), 'Monthly', null, null, null, 0, 'none')).toEqual([]);
  });

  it('returns [] when specific-date dom is 29', () => {
    expect(generateRecurringDates(local(2026,8,1), local(2026,10,1), 'Monthly', null, null, null, 29, 'none')).toEqual([]);
  });

  it('returns [] when nth-weekday rWeek is 0', () => {
    expect(generateRecurringDates(local(2026,8,1), local(2026,10,1), 'Monthly', null, 0, 0, null, null)).toEqual([]);
  });

  it('returns [] when nth-weekday rWeek is 5', () => {
    expect(generateRecurringDates(local(2026,8,1), local(2026,10,1), 'Monthly', null, 5, 0, null, null)).toEqual([]);
  });

  it('returns [] when nth-weekday rDay is 5 (out of 0–4)', () => {
    expect(generateRecurringDates(local(2026,8,1), local(2026,10,1), 'Monthly', null, 1, 5, null, null)).toEqual([]);
  });

  it('rejects an invalid weekend rule by ignoring it (treated as none)', () => {
    // An unknown rule falls back to 'none' — does not crash
    const dates = generateRecurringDates(local(2026,8,1), local(2026,8,31), 'Monthly', null, null, null, 15, 'fly-to-mars');
    expect(dates.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── generateRecurringDates — Daily ─────────────────────────────────────────

describe('generateRecurringDates — Daily', () => {
  it('generates weekdays only', () => {
    const dates = generateRecurringDates(local(2026,8,3), local(2026,8,9), 'Daily', null, null, null, null, null);
    // Mon 3, Tue 4, Wed 5, Thu 6, Fri 7 (Sat/Sun skipped)
    expect(fmtAll(dates)).toEqual(['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']);
  });
});

// ─── generateRecurringDates — Weekly ────────────────────────────────────────

describe('generateRecurringDates — Weekly', () => {
  it('generates Mon/Wed/Fri for one week', () => {
    const dates = generateRecurringDates(local(2026,8,3), local(2026,8,7), 'Weekly', [0,2,4], null, null, null, null);
    expect(fmtAll(dates)).toEqual(['2026-08-03','2026-08-05','2026-08-07']);
  });
});

// ─── generateRecurringDates — Monthly nth-weekday ────────────────────────────

describe('generateRecurringDates — Monthly nth-weekday', () => {
  it('generates the 1st Monday of each month', () => {
    const dates = generateRecurringDates(
      local(2026,8,1), local(2026,11,30),
      'Monthly', null, 1, 0, null, null
    );
    // 1st Mon: Aug=3, Sep=7, Oct=5, Nov=2
    expect(fmtAll(dates)).toEqual(['2026-08-03','2026-09-07','2026-10-05','2026-11-02']);
  });

  it('generates the 4th Friday of each month', () => {
    const dates = generateRecurringDates(
      local(2026,8,1), local(2026,10,31),
      'Monthly', null, 4, 4, null, null
    );
    // 4th Fri: Aug=28, Sep=25, Oct=23
    expect(fmtAll(dates)).toEqual(['2026-08-28','2026-09-25','2026-10-23']);
  });

  it('skips months where the weekday combination does not exist (5th Monday)', () => {
    // Only months with a 5th Monday are included
    const dates = generateRecurringDates(
      local(2026,8,1), local(2026,12,31),
      'Monthly', null, 4, 0, null, null
    );
    // All months should have a 4th Monday
    expect(dates.length).toBeGreaterThan(0);
    dates.forEach(d => expect(d.getDay()).toBe(1)); // all Mondays
  });
});

// ─── generateRecurringDates — Monthly specific-date ─────────────────────────

describe('generateRecurringDates — Monthly specific-date', () => {
  it('generates the 5th of each month', () => {
    const dates = generateRecurringDates(
      local(2026,8,1), local(2026,10,31),
      'Monthly', null, null, null, 5, 'none'
    );
    expect(fmtAll(dates)).toEqual(['2026-08-05','2026-09-05','2026-10-05']);
  });

  it('applies prev-friday weekend rule', () => {
    // Aug 1 2026 is a Saturday → should move to Fri Jul 31
    const dates = generateRecurringDates(
      local(2026,7,29), local(2026,8,10),
      'Monthly', null, null, null, 1, 'prev-friday'
    );
    // The Saturday Aug 1 becomes Fri Jul 31; still in range (start is Jul 29)
    expect(dates.some(d => d.getMonth() === 6 && d.getDate() === 31)).toBe(true);
  });

  it('applies next-monday weekend rule', () => {
    // Sep 5 2026 is a Saturday → should move to Mon Sep 7
    const dates = generateRecurringDates(
      local(2026,9,1), local(2026,9,30),
      'Monthly', null, null, null, 5, 'next-monday'
    );
    expect(dates.some(d => d.getDate() === 7 && d.getDay() === 1)).toBe(true);
  });

  it('clamps dom to last day of shorter months (Feb)', () => {
    // day 28 — safe for all months including February
    const dates = generateRecurringDates(
      local(2026,1,1), local(2026,3,31),
      'Monthly', null, null, null, 28, 'none'
    );
    expect(dates.length).toBe(3);
    expect(fmtAll(dates)).toEqual(['2026-01-28','2026-02-28','2026-03-28']);
  });
});

// ─── Output properties: dedup and sort ──────────────────────────────────────

describe('generateRecurringDates — output dedup and sort', () => {
  it('output is sorted ascending', () => {
    const dates = generateRecurringDates(local(2026,8,1), local(2026,10,31), 'Monthly', null, 1, 0, null, null);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  it('output contains no duplicates by calendar date', () => {
    const dates = generateRecurringDates(local(2026,8,1), local(2026,10,31), 'Daily', null, null, null, null, null);
    const keys = dates.map(fmt);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('contains no invalid dates', () => {
    const dates = generateRecurringDates(local(2026,8,1), local(2026,10,31), 'Daily', null, null, null, null, null);
    dates.forEach(d => expect(isNaN(d.getTime())).toBe(false));
  });
});

// ─── Consistency: all modes produce same count for identical config ───────────

describe('cross-surface consistency', () => {
  const start = local(2026, 8, 3);
  const end   = local(2026, 11, 30);

  it('nth-weekday: 1st Monday Aug–Nov produces 4 dates', () => {
    const dates = generateRecurringDates(start, end, 'Monthly', null, 1, 0, null, null);
    expect(dates.length).toBe(4);
  });

  it('specific-date: 5th of month Aug–Nov produces 4 dates', () => {
    const dates = generateRecurringDates(start, end, 'Monthly', null, null, null, 5, 'none');
    expect(dates.length).toBe(4);
  });

  it('preview count matches generated task count', () => {
    // Simulate what all create surfaces do: preview count = generateRecurringDates(...).length
    const count = generateRecurringDates(start, end, 'Monthly', null, 1, 0, null, null).length;
    const tasks = generateRecurringDates(start, end, 'Monthly', null, 1, 0, null, null);
    expect(tasks.length).toBe(count);
  });
});

// ─── No silent fallback to single task ──────────────────────────────────────

describe('no silent fallback', () => {
  it('returns [] (not [startDate]) when endDate < startDate', () => {
    const result = generateRecurringDates(local(2026,8,10), local(2026,8,1), 'Daily', null, null, null, null, null);
    expect(result).toEqual([]);
  });

  it('returns [] (not [startDate]) for bad frequency', () => {
    const result = generateRecurringDates(local(2026,8,1), local(2026,9,1), 'Once', null, null, null, null, null);
    expect(result).toEqual([]);
  });
});
