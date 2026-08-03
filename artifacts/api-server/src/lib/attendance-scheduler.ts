import cron from "node-cron";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { syncAttendanceToday, getKekaCredentials } from "./keka-client";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { logger } from "./logger";
import { withJobLock } from "./job-lock";

// Lock TTL slightly shorter than the shortest interval (10 min).
const ATTENDANCE_LOCK_TTL_MS = 8 * 60 * 1000;

/**
 * In-memory health counters — persisted to Firebase after every run.
 * Resets to zero on server restart, which is fine: the Firebase node retains
 * the last known values and the counters rebuild quickly.
 */
let consecutiveFailures = 0;
let lastSuccessfulRun: string | null = null;
let lastFailedRun: string | null = null;

/**
 * Returns true when the current local time falls inside a "fast" window
 * where we sync every 10 minutes:
 *   09:30 – 11:30  (morning clock-in rush)
 *   17:00 – 19:59  (evening clock-out window)
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

  // ── Window / rate gate ──────────────────────────────────────────────────────
  // Try to read timezone config and decide whether this tick should run.
  // If the config read fails we proceed without the gate (better to sync than skip).
  let tz = "Asia/Kolkata";
  let hour = 0;
  let minute = 0;
  let shouldSkip = false;

  try {
    const schedRaw = await readFirebasePath<{ scheduleTimezone?: string }>(
      "settings/notifications/reminders-schedule"
    );
    tz = schedRaw?.scheduleTimezone || "Asia/Kolkata";
    const nowInTz = toZonedTime(new Date(), tz);
    hour = nowInTz.getHours();
    minute = nowInTz.getMinutes();

    // Outer gate: 06:00–22:00 local time.
    // Extended from 21:00 to 22:00 so the 21:30 rate-gate slot can capture
    // employees who clock out after 21:00 (root cause #5 fix).
    if (hour < 6 || hour >= 22) {
      logger.debug({ hour, tz }, "[Attendance] Outside 06:00–22:00 — skipping");
      shouldSkip = true;
    } else if (!isInFastWindow(hour, minute) && minute !== 0 && minute !== 30) {
      // Rate gate: inside fast windows run every tick (10 min);
      // outside fast windows only run on :00 and :30 (30 min).
      // The 21:30 mark naturally provides the single end-of-day pass.
      logger.debug(
        { hour, minute },
        "[Attendance] Outside fast window and not on :00/:30 — skipping tick"
      );
      shouldSkip = true;
    }
  } catch (err) {
    // Config read failed — proceed without the window gate so we never silently
    // skip a sync due to a transient Firebase connectivity hiccup.
    logger.warn({ err }, "[Attendance] Could not read timezone config — proceeding without window gate");
  }

  if (shouldSkip) return;

  // ── Compute today's date in the configured timezone ─────────────────────────
  // Fixes root cause #3: UTC server clock would produce the wrong calendar date
  // in timezones significantly ahead of UTC (e.g. UTC+12/+13).
  const today = format(toZonedTime(new Date(), tz), "yyyy-MM-dd");
  const inFast = isInFastWindow(hour, minute);
  const runStart = Date.now();
  const attemptedAt = new Date().toISOString();

  logger.info(
    { hour, minute, today, tz, window: inFast ? "10-min" : "30-min" },
    "[Attendance] Running scheduled attendance sync"
  );

  let totalRetries = 0;
  let finalStatus: "Success" | "Partial" | "Failed" = "Success";
  let lastError: string | null = null;
  let todayResult: Awaited<ReturnType<typeof syncAttendanceToday>> | null = null;

  try {
    // ── Catch-up: backfill yesterday if the last sync was a different date ────
    // Fixes root cause #4: if the server was restarted during a day, yesterday's
    // attendance is synced once at the start of the next day's first tick before
    // today's sync begins.
    const yesterday = format(
      toZonedTime(new Date(Date.now() - 86_400_000), tz),
      "yyyy-MM-dd"
    );
    const lastSync = await readFirebasePath<{ date?: string }>(
      "settings/integrations/keka/lastAttendanceSync"
    );
    if (lastSync?.date && lastSync.date < today) {
      logger.info(
        { lastSyncDate: lastSync.date, yesterday, today },
        "[Attendance] Catch-up: last sync was a previous calendar day — syncing yesterday first"
      );
      const catchupResult = await syncAttendanceToday(tz, yesterday);
      totalRetries += catchupResult.retriesUsed ?? 0;
      if (!catchupResult.success) {
        finalStatus = "Partial";
        lastError = `catch-up (${yesterday}): ${catchupResult.error ?? "unknown"}`;
        logger.warn(
          { date: yesterday, error: catchupResult.error },
          "[Attendance] Catch-up sync failed — today's sync will still proceed"
        );
      }
    }

    // ── Today's sync ──────────────────────────────────────────────────────────
    todayResult = await syncAttendanceToday(tz, today);
    totalRetries += todayResult.retriesUsed ?? 0;

    if (!todayResult.success && finalStatus === "Success") {
      finalStatus = "Failed";
      lastError = todayResult.error ?? "unknown";
    }

    const employees =
      (todayResult.totalArrived ?? 0) + (todayResult.totalNotArrived ?? 0);
    const skipped = Math.max(0, employees - todayResult.recordsWritten);
    const durationMs = Date.now() - runStart;
    const durationSec = (durationMs / 1000).toFixed(1);

    // Structured summary log line (spec §7)
    logger.info(
      `[KekaAttendance] Date: ${today} | Duration: ${durationSec}s | ` +
      `Employees: ${employees} | Updated: ${todayResult.recordsWritten} | ` +
      `Skipped: ${skipped} | Retries: ${totalRetries} | Status: ${finalStatus}`
    );

    if (finalStatus === "Success") {
      consecutiveFailures = 0;
      lastSuccessfulRun = new Date().toISOString();
    } else {
      consecutiveFailures++;
      lastFailedRun = new Date().toISOString();
    }

    await writeFirebasePath(
      "settings/integrations/keka/attendanceSchedulerHealth",
      {
        lastAttemptedRun: attemptedAt,
        lastSuccessfulRun,
        lastFailedRun,
        nextScheduledRun: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        lastError,
        lastDurationMs: durationMs,
        consecutiveFailures,
      }
    ).catch((err) =>
      logger.warn({ err }, "[Attendance] Health metadata write failed — non-fatal")
    );
  } catch (err) {
    consecutiveFailures++;
    lastFailedRun = new Date().toISOString();
    lastError = String(err);
    const durationMs = Date.now() - runStart;

    logger.error({ err, today }, "[Attendance] Unhandled error during sync");
    logger.info(
      `[KekaAttendance] Date: ${today} | Duration: ${(durationMs / 1000).toFixed(1)}s | ` +
      `Employees: 0 | Updated: 0 | Skipped: 0 | Retries: ${totalRetries} | Status: Failed`
    );

    await writeFirebasePath(
      "settings/integrations/keka/attendanceSchedulerHealth",
      {
        lastAttemptedRun: attemptedAt,
        lastSuccessfulRun,
        lastFailedRun,
        nextScheduledRun: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        lastError,
        lastDurationMs: durationMs,
        consecutiveFailures,
      }
    ).catch((healthErr) =>
      logger.warn({ err: healthErr }, "[Attendance] Health metadata write failed — non-fatal")
    );
  }
}

export function startAttendanceScheduler(): void {
  // Runs every 10 minutes; the handler decides whether to proceed based on
  // the active window (10-min during 09:30–11:30 and 17:00–20:00, 30-min
  // otherwise within the 06:00–22:00 gate; 21:30 provides the end-of-day pass).
  cron.schedule("*/10 * * * *", () => {
    withJobLock("attendance-10min", ATTENDANCE_LOCK_TTL_MS, () =>
      runAttendanceSync()
    ).catch((err) =>
      logger.error({ err }, "[Attendance] Unhandled scheduler error")
    );
  });

  logger.info(
    "[Attendance] Scheduler started — 10-min sync during 09:30–11:30 & 17:00–20:00; " +
    "30-min otherwise (06:00–22:00); end-of-day pass at 21:30"
  );
}
