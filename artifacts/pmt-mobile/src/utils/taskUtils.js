import { parse, isBefore, startOfToday, format, addDays } from 'date-fns';
import { ref, get } from 'firebase/database';
import { db } from '../firebase.js';

export const isTaskOverdue = (task, currentStatus) => {
  const status = currentStatus !== undefined ? currentStatus : task.status;
  if (!task.dueDate || status === 'Done') return false;
  try {
    const due = parse(task.dueDate, 'do MMM yyyy', new Date());
    return isBefore(due, startOfToday());
  } catch {
    return false;
  }
};

/**
 * Check leave/holiday conflict for a user on a given date.
 * @param {string} userId
 * @param {string} dateKey - yyyy-MM-dd
 * @returns {Promise<{type: string, leaveType?: string, session?: string, holidayName?: string}|null>}
 */
export async function checkLeaveConflict(userId, dateKey) {
  if (!userId || !dateKey) return null;
  try {
    const [leaveSnap, holidaySnap] = await Promise.all([
      get(ref(db, `leaveData/${userId}/${dateKey}`)),
      get(ref(db, `publicHolidays/All/${dateKey}`)),
    ]);
    const leave = leaveSnap.val();
    const holiday = holidaySnap.val();
    if (leave) {
      return leave.session === 'full'
        ? { type: 'full-leave', leaveType: leave.leaveType || 'Leave', userId, date: dateKey }
        : { type: 'half-leave', leaveType: leave.leaveType || 'Leave', session: leave.session, userId, date: dateKey };
    }
    if (holiday) {
      return { type: 'holiday', holidayName: holiday.name || 'Public Holiday', userId, date: dateKey };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Load leave data for a single user from Firebase.
 * Returns a map of dateKey (yyyy-MM-dd) → leave record.
 * @param {string} userId
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getLeaveDataForUser(userId) {
  if (!userId) return {};
  try {
    const snap = await get(ref(db, `leaveData/${userId}`));
    return snap.exists() ? snap.val() : {};
  } catch {
    return {};
  }
}

/**
 * Load combined leave + public holiday data for a user.
 * Public holidays come from publicHolidays/All; leave from leaveData/{userId}.
 * Suitable for leave+holiday-aware overdue calculations.
 * @param {string} userId
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getLeaveAndHolidayData(userId) {
  if (!userId) return {};
  try {
    const [leaveSnap, holidaySnap] = await Promise.all([
      get(ref(db, `leaveData/${userId}`)),
      get(ref(db, 'publicHolidays/All')),
    ]);
    const leaveData = leaveSnap.exists() ? leaveSnap.val() : {};
    const holidayData = holidaySnap.exists() ? holidaySnap.val() : {};
    return { ...holidayData, ...leaveData };
  } catch {
    return {};
  }
}

/**
 * Returns leave status for a user based on their leave data.
 * Checks today and up to 14 calendar days ahead.
 * @param {Record<string, unknown>} leaveByDate
 * @returns {{ status: 'on_leave' | 'leave_soon' | null, date?: string }}
 */
export function getLeaveStatus(leaveByDate) {
  if (!leaveByDate || Object.keys(leaveByDate).length === 0) return { status: null };
  const today = format(new Date(), 'yyyy-MM-dd');
  if (leaveByDate[today]) return { status: 'on_leave', date: today };
  for (let i = 1; i <= 14; i++) {
    const d = format(addDays(new Date(), i), 'yyyy-MM-dd');
    if (leaveByDate[d]) return { status: 'leave_soon', date: d };
  }
  return { status: null };
}

/**
 * Leave-aware overdue check. Takes pre-loaded leave data (from Firebase leaveData/{userId})
 * and returns false if the task's due date was a leave day, suppressing false overdue alerts.
 *
 * @param {object} task
 * @param {string|undefined} currentStatus
 * @param {Record<string, unknown>} leaveByDate - map of dateKey (yyyy-MM-dd) → leave record
 * @returns {boolean}
 */
export const isTaskLeaveAwareOverdue = (task, currentStatus, leaveByDate = {}) => {
  const status = currentStatus !== undefined ? currentStatus : task.status;
  if (!task.dueDate || status === 'Done') return false;
  try {
    const due = parse(task.dueDate, 'do MMM yyyy', new Date());
    if (!isBefore(due, startOfToday())) return false;
    const dateKey = format(due, 'yyyy-MM-dd');
    const rec = leaveByDate[dateKey];
    if (rec && (rec.name || rec.session === 'full')) return false;
    return true;
  } catch {
    return false;
  }
};
