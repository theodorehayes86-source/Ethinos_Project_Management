import cron from "node-cron";
import { toZonedTime } from "date-fns-tz";
import { syncAttendanceToday, getKekaCredentials } from "./keka-client";
import { readFirebasePath } from "./firebase-admin";
import { logger } from "./logger";
import { withJobLock } from "./job-lock";

// Lock TTL slightly shorter than the shortest interval (10 min).
const ATTENDANCE_LOCK_TTL_MS = 8 * 60 * 1000;

/**
 * Returns true when the current local time falls inside a "fast" window
 * where we sync every 10 minutes:
 *   09:30 – 11:30  (morning clock-in rush)
 *   17:00 – 20:00  (evening clock-out window)
 * Outside these windows we sync every 30 minutes.
 */
function isInFastWindow(hour: number, minute: number): boolean {
  // 09:30 – 11:30 (inclusive of boundary minutes)
  if (hour === 9 && minute >= 30) return true;
  if (hour === 10) return true;
  if (hour === 11 && minute <= 30) return true;
  // 17:00 – 19:59  (5 pm – just before 8 pm)
  if (hour >= 17 && hour < 20) return true;
  return false;
}

async function runAttendanceSync(): Promise<void> {
  // Skip silently if Keka is not configured.
  const creds = await getKekaCredentials();
  if (!creds) {
    logger.debug("[Attendance] Keka not configured — skipping tick");
    return;
  }

  let hour = 0;
  let minute = 0;

  try {
    const schedRaw = await readFirebasePath<{ scheduleTimezone?: string }>(
      "settings/notifications/reminders-schedule"
    );
    const tz = schedRaw?.scheduleTimezone || "Asia/Kolkata";
    const nowInTz = toZonedTime(new Date(), tz);
    hour = nowInTz.getHours();
    minute = nowInTz.getMinutes();

    // Outer gate: only run between 06:00 and 21:00.
    if (hour < 6 || hour >= 21) {
      logger.debug({ hour, tz }, "[Attendance] Outside 06:00–21:00 — skipping");
      return;
    }

    // Rate gate: inside fast windows run every tick (10 min);
    // outside fast windows only run on the :00 and :30 marks (30 min).
    if (!isInFastWindow(hour, minute) && minute !== 0 && minute !== 30) {
      logger.debug(
        { hour, minute },
        "[Attendance] Outside fast window and not on :00/:30 — skipping tick"
      );
      return;
    }
  } catch (err) {
    // If we can't read timezone config, run anyway — better to sync than skip.
    logger.warn({ err }, "[Attendance] Could not read timezone config — proceeding");
  }

  const inFast = isInFastWindow(hour, minute);
  logger.info(
    { hour, minute, window: inFast ? "10-min" : "30-min" },
    "[Attendance] Running scheduled attendance sync"
  );

  try {
    const result = await syncAttendanceToday();
    if (result.success) {
      logger.info(result, "[Attendance] Sync complete");
    } else {
      logger.warn(result, "[Attendance] Sync completed with errors");
    }
  } catch (err) {
    logger.error({ err }, "[Attendance] Unhandled error during sync");
  }
}

export function startAttendanceScheduler(): void {
  // Runs every 10 minutes; the handler decides whether to proceed based on
  // the active window (10-min during 09:30–11:30 and 17:00–20:00, 30-min
  // otherwise within the 06:00–21:00 work-hours gate).
  cron.schedule("*/10 * * * *", () => {
    withJobLock("attendance-10min", ATTENDANCE_LOCK_TTL_MS, () =>
      runAttendanceSync()
    ).catch((err) =>
      logger.error({ err }, "[Attendance] Unhandled scheduler error")
    );
  });

  logger.info(
    "[Attendance] Scheduler started — 10-min sync during 09:30–11:30 & 17:00–20:00; 30-min otherwise (06:00–21:00)"
  );
}
