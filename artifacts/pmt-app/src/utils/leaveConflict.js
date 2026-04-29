import { ref, get } from "firebase/database";
import { db } from "../firebase.js";

/**
 * @typedef {Object} LeaveConflict
 * @property {'full-leave'|'half-leave'|'holiday'|'pending-leave'} type
 * @property {string} [leaveType]
 * @property {'first-half'|'second-half'} [session]
 * @property {string} [holidayName]
 * @property {string} userId
 * @property {string} date
 */

/**
 * Returns true only if a leave/holiday record represents a confirmed FULL-DAY absence.
 * Pending leaves, half-day leaves, and missing records return false.
 * Use this for overdue suppression — only approved full-day leave is a hard block.
 *
 * @param {unknown} record - A Firebase leave or holiday record from getUserLeaveAndHolidayData
 * @returns {boolean}
 */
export function isFullDayLeaveOrHoliday(record) {
  if (!record) return false;
  if (record.name) return true; // holiday
  if (record.status === 'pending') return false; // pending leave is not a hard block
  if (record.session === 'full') return true;
  return false;
}

/**
 * Format a Date to yyyy-MM-dd
 * @param {Date|string|null} date
 * @returns {string|null}
 */
export function toDateKey(date) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Check whether a user is on leave or if a date is a public holiday.
 * Reads from Firebase leaveData/{userId}/{dateKey} and publicHolidays/{region}/{dateKey}.
 *
 * @param {string|number} userId - PMT user ID
 * @param {Date|string} date - The date to check
 * @param {string} [region] - Holiday region (defaults to "All")
 * @returns {Promise<LeaveConflict|null>}
 */
export async function checkLeaveConflict(userId, date, region = "All") {
  if (!userId || !date) return null;

  const dateKey = toDateKey(date);
  if (!dateKey) return null;

  try {
    const [leaveSnap, holidaySnap] = await Promise.all([
      get(ref(db, `leaveData/${userId}/${dateKey}`)),
      get(ref(db, `publicHolidays/${region}/${dateKey}`)),
    ]);

    const leaveRecord = leaveSnap.val();
    const holidayRecord = holidaySnap.val();

    if (leaveRecord) {
      // Pending leave: informational warning only, not a hard block
      if (leaveRecord.status === "pending") {
        return {
          type: "pending-leave",
          leaveType: leaveRecord.leaveType || "Leave",
          session: leaveRecord.session,
          userId: String(userId),
          date: dateKey,
        };
      }
      if (leaveRecord.session === "full") {
        return {
          type: "full-leave",
          leaveType: leaveRecord.leaveType || "Leave",
          userId: String(userId),
          date: dateKey,
        };
      }
      return {
        type: "half-leave",
        leaveType: leaveRecord.leaveType || "Leave",
        session: leaveRecord.session,
        userId: String(userId),
        date: dateKey,
      };
    }

    if (holidayRecord) {
      return {
        type: "holiday",
        holidayName: holidayRecord.name || "Public Holiday",
        userId: String(userId),
        date: dateKey,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the full leave-data map for a user (all synced dates).
 * Useful for leave-aware overdue computation where you need to check many dates.
 *
 * @param {string|number} userId
 * @returns {Promise<Record<string, {session: string, leaveType: string}>>}
 */
export async function getUserLeaveData(userId) {
  if (!userId) return {};
  try {
    const snap = await get(ref(db, `leaveData/${userId}`));
    return snap.val() || {};
  } catch {
    return {};
  }
}

/**
 * Fetch a combined map of leave days AND public holidays for a user.
 * Each key is a yyyy-MM-dd date; value is truthy if the date is a leave or holiday.
 * Use this for leave+holiday-aware overdue suppression.
 *
 * @param {string|number} userId
 * @param {string} [region]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getUserLeaveAndHolidayData(userId, region = "All") {
  if (!userId) return {};
  try {
    const [leaveSnap, holidaySnap] = await Promise.all([
      get(ref(db, `leaveData/${userId}`)),
      get(ref(db, `publicHolidays/${region}`)),
    ]);
    const leaveData = leaveSnap.val() || {};
    const holidayData = holidaySnap.val() || {};
    return { ...holidayData, ...leaveData };
  } catch {
    return {};
  }
}

/**
 * Get leave status for a user on today's date and within the next 14 days.
 * Distinguishes approved leaves from pending (requested, not yet approved).
 * Used for Team panel leave indicators.
 *
 * @param {string|number} userId
 * @param {string} [region]
 * @returns {Promise<{
 *   onLeaveToday: boolean,
 *   onLeavePendingToday: boolean,
 *   upcomingLeaveDate: string|null,
 *   upcomingPendingDate: string|null,
 * }>}
 */
export async function getUserLeaveStatus(userId, region = "All") {
  if (!userId) return { onLeaveToday: false, onLeavePendingToday: false, upcomingLeaveDate: null, upcomingPendingDate: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const leaveSnap = await get(ref(db, `leaveData/${userId}`));
    const leaveData = leaveSnap.val() || {};

    const todayKey = toDateKey(today);
    const todayRecord = leaveData[todayKey];
    const onLeaveToday        = !!todayRecord && todayRecord.status !== "pending";
    const onLeavePendingToday = !!todayRecord && todayRecord.status === "pending";

    let upcomingLeaveDate   = null;
    let upcomingPendingDate = null;

    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dk = toDateKey(d);
      const rec = leaveData[dk];
      if (!rec) continue;
      if (rec.status === "pending") {
        if (!upcomingPendingDate) upcomingPendingDate = dk;
      } else {
        if (!upcomingLeaveDate) upcomingLeaveDate = dk;
      }
      if (upcomingLeaveDate && upcomingPendingDate) break;
    }

    // Check public holiday for today
    if (!onLeaveToday && !onLeavePendingToday) {
      const holidaySnap = await get(ref(db, `publicHolidays/${region}/${todayKey}`));
      if (holidaySnap.val()) {
        return { onLeaveToday: true, onLeavePendingToday: false, upcomingLeaveDate: null, upcomingPendingDate: null };
      }
    }

    return { onLeaveToday, onLeavePendingToday, upcomingLeaveDate, upcomingPendingDate };
  } catch {
    return { onLeaveToday: false, onLeavePendingToday: false, upcomingLeaveDate: null, upcomingPendingDate: null };
  }
}

/**
 * Returns a Set of date strings (YYYY-MM-DD) that are public holidays within the next `days` days.
 * Makes a single Firebase read of the entire region node, then filters to the requested window.
 *
 * @param {string} region - Firebase region key (default "All")
 * @param {number} days - Number of days ahead to check (default 14)
 * @returns {Promise<Set<string>>}
 */
export async function getUpcomingHolidays(region = "All", days = 14) {
  try {
    const snap = await get(ref(db, `publicHolidays/${region}`));
    const data = snap.val() || {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(today.getDate() + days);
    const todayKey = toDateKey(today);
    const cutoffKey = toDateKey(cutoff);
    const result = new Set();
    Object.keys(data).forEach(dk => {
      if (dk >= todayKey && dk <= cutoffKey && data[dk]) result.add(dk);
    });
    return result;
  } catch {
    return new Set();
  }
}
