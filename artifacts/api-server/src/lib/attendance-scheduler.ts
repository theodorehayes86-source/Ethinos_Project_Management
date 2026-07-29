import cron from "node-cron";
import { toZonedTime } from "date-fns-tz";
import { syncAttendanceToday, getKekaCredentials } from "./keka-client";
import { readFirebasePath } from "./firebase-admin";
import { logger } from "./logger";
import { withJobLock } from "./job-lock";

// Lock TTL slightly shorter than the 10-min interval so a slow run never
// blocks the next tick.
const ATTENDANCE_LOCK_TTL_MS = 8 * 60 * 1000;

async function runAttendanceSync(): Promise<void> {
  // Skip silently if Keka is not configured — avoids noisy log spam on
  // instances that haven't set up the integration.
  const creds = await getKekaCredentials();
  if (!creds) {
    logger.debug("[Attendance] Keka not configured — skipping tick");
    return;
  }

  // Only run during work hours (06:00–21:00) in the configured timezone.
  // This caps API usage at ~90 calls/day instead of 144, well within
  // Keka's 50 req/min rate limit (one call per sync).
  try {
    const schedRaw = await readFirebasePath<{ scheduleTimezone?: string }>(
      "settings/notifications/reminders-schedule"
    );
    const tz = schedRaw?.scheduleTimezone || "Asia/Kolkata";
    const nowInTz = toZonedTime(new Date(), tz);
    const hour = nowInTz.getHours();

    if (hour < 6 || hour >= 21) {
      logger.debug({ hour, tz }, "[Attendance] Outside 06:00–21:00 — skipping");
      return;
    }
  } catch (err) {
    // If we can't read the timezone setting, run anyway — better to sync than skip.
    logger.warn({ err }, "[Attendance] Could not read timezone config — proceeding");
  }

  logger.info("[Attendance] Running scheduled attendance sync");
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
  // Every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    withJobLock("attendance-10min", ATTENDANCE_LOCK_TTL_MS, () =>
      runAttendanceSync()
    ).catch((err) =>
      logger.error({ err }, "[Attendance] Unhandled scheduler error")
    );
  });

  logger.info(
    "[Attendance] Scheduler started — syncs every 10 min during work hours (06:00–21:00)"
  );
}
