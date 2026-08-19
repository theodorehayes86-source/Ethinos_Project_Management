import cron from "node-cron";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { syncAttendanceToday, getKekaCredentials, readKekaClientId, readKekaClientSecret } from "./keka-client";
import { readFirebasePath, writeFirebasePath, multiPathUpdate } from "./firebase-admin";
import { sendEmail, isEmailConfigured } from "./microsoft-graph";
import { logger } from "./logger";
import { withJobLock, clearExpiredLock } from "./job-lock";

// Lock TTL slightly shorter than the shortest interval (10 min).
const ATTENDANCE_LOCK_TTL_MS = 8 * 60 * 1000;

// Alert thresholds / cooldowns
const ALERT_FAILURE_THRESHOLD = 3;       // ~30 min of consecutive failures
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // at most one alert per hour

/**
 * In-memory health counters — persisted to Firebase after every run.
 * Resets to zero on server restart, which is fine: the Firebase node retains
 * the last known values and the counters rebuild quickly.
 */
let consecutiveFailures = 0;
let lastSuccessfulRun: string | null = null;
let lastFailedRun: string | null = null;

interface AttendanceSchedulerHealth {
  consecutiveFailures?: number;
  lastSuccessfulRun?: string | null;
  lastFailedRun?: string | null;
  lastError?: string | null;
  lastAttemptedRun?: string | null;
  lastAlertSent?: string | null;
}

/**
 * Reads the attendance scheduler health node and sends an alert email to the
 * admin when the sync has failed consecutively for ALERT_FAILURE_THRESHOLD or
 * more cycles (≈ 30 minutes).
 *
 * Throttled: at most one alert per ALERT_COOLDOWN_MS (1 hour).
 * Auto-clears: no email is sent once consecutiveFailures drops back to 0.
 */
async function checkAttendanceSyncHealth(): Promise<void> {
  if (!isEmailConfigured()) {
    logger.debug("[AttendanceAlert] Email not configured — skipping health check");
    return;
  }

  try {
    const health = await readFirebasePath<AttendanceSchedulerHealth>(
      "settings/integrations/keka/attendanceSchedulerHealth"
    );

    if (!health) {
      logger.debug("[AttendanceAlert] No health data found — skipping");
      return;
    }

    const failures = health.consecutiveFailures ?? 0;

    if (failures < ALERT_FAILURE_THRESHOLD) {
      logger.debug({ failures }, "[AttendanceAlert] Below failure threshold — no alert needed");
      return;
    }

    // Throttle: skip if an alert was already sent within the cooldown window
    if (health.lastAlertSent) {
      const elapsed = Date.now() - new Date(health.lastAlertSent).getTime();
      if (elapsed < ALERT_COOLDOWN_MS) {
        logger.debug(
          { failures, lastAlertSent: health.lastAlertSent, elapsedMin: Math.round(elapsed / 60000) },
          "[AttendanceAlert] Alert already sent within cooldown window — skipping"
        );
        return;
      }
    }

    const adminEmail = process.env.MS_SENDER_EMAIL;
    if (!adminEmail) {
      logger.warn("[AttendanceAlert] MS_SENDER_EMAIL not set — cannot send alert");
      return;
    }

    const lastSuccess = health.lastSuccessfulRun
      ? new Date(health.lastSuccessfulRun).toUTCString()
      : "never";
    const lastError = health.lastError ?? "unknown error";
    const lastAttempted = health.lastAttemptedRun
      ? new Date(health.lastAttemptedRun).toUTCString()
      : "unknown";

    const subject = `⚠️ Attendance Sync Alert: ${failures} consecutive sync failure${failures === 1 ? "" : "s"}`;
    const bodyHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#b91c1c;">Attendance Sync Has Stopped Working</h2>
        <p>The Keka attendance sync has failed <strong>${failures} times in a row</strong> (~${Math.round(failures * 10)} minutes of no data).</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;width:40%;">Last attempted</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${lastAttempted}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;">Last successful run</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${lastSuccess}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;">Last error</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#b91c1c;word-break:break-all;">${lastError}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;font-weight:600;">Consecutive failures</td>
            <td style="padding:8px 12px;">${failures}</td>
          </tr>
        </table>
        <p style="color:#6b7280;font-size:13px;">
          This alert will repeat every hour until the sync recovers. No further email will be sent once attendance data starts syncing successfully again.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#9ca3af;font-size:12px;">Ethinos Flow Pro — Attendance Monitor</p>
      </div>
    `.trim();

    await sendEmail({ to: adminEmail, subject, bodyHtml });

    logger.warn(
      { failures, lastSuccess: health.lastSuccessfulRun, lastError, adminEmail },
      "[AttendanceAlert] Alert email sent to admin"
    );

    // Record when the alert was last sent so we respect the cooldown
    await multiPathUpdate({
      "settings/integrations/keka/attendanceSchedulerHealth/lastAlertSent": new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err }, "[AttendanceAlert] Health check threw — non-fatal");
  }
}

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

/** lastAttendanceSync older than this (during operating hours) triggers a
 *  catch-up run even off the :00/:30 rate gate. Self-heals gaps caused by the
 *  process being asleep/down (e.g. an autoscale deployment with no traffic). */
const STALE_SYNC_MS = 45 * 60 * 1000;

interface TickGate {
  run: boolean;
  tz: string;
  hour: number;
  minute: number;
  reason: string;
}

/**
 * Decides whether a tick should sync — evaluated BEFORE acquiring the job
 * lock, so a tick that would be gated out never takes the lock away from
 * another instance.
 *
 * Runs when: inside 06:00–22:00 AND (fast window, or :00/:30, or the last
 * successful sync is stale/from a previous day — the catch-up override).
 */
export async function evaluateTickGate(): Promise<TickGate> {
  let tz = "Asia/Kolkata";
  let hour = 0;
  let minute = 0;

  try {
    const schedRaw = await readFirebasePath<{ scheduleTimezone?: string }>(
      "settings/notifications/reminders-schedule"
    );
    tz = schedRaw?.scheduleTimezone || "Asia/Kolkata";
  } catch (err) {
    // Config read failed — proceed without the window gate so we never silently
    // skip a sync due to a transient Firebase connectivity hiccup.
    logger.warn({ err }, "[Attendance] Could not read timezone config — proceeding without window gate");
    return { run: true, tz, hour, minute, reason: "config-read-failed" };
  }

  const nowInTz = toZonedTime(new Date(), tz);
  hour = nowInTz.getHours();
  minute = nowInTz.getMinutes();

  // Outer gate: 06:00–22:00 local time.
  // Extended from 21:00 to 22:00 so the 21:30 rate-gate slot can capture
  // employees who clock out after 21:00 (root cause #5 fix).
  if (hour < 6 || hour >= 22) {
    return { run: false, tz, hour, minute, reason: "outside-06-22" };
  }
  // Rate gate: inside fast windows run every tick (10 min);
  // outside fast windows only run on :00 and :30 (30 min).
  // The 21:30 mark naturally provides the single end-of-day pass.
  if (isInFastWindow(hour, minute) || minute === 0 || minute === 30) {
    return { run: true, tz, hour, minute, reason: "scheduled" };
  }

  // Catch-up override: if the last sync is from a previous day or older than
  // STALE_SYNC_MS, run NOW instead of waiting for the next :00/:30 slot.
  try {
    const today = format(nowInTz, "yyyy-MM-dd");
    const lastSync = await readFirebasePath<{ date?: string; syncedAt?: string }>(
      "settings/integrations/keka/lastAttendanceSync"
    );
    const syncedAtMs = lastSync?.syncedAt ? Date.parse(lastSync.syncedAt) : NaN;
    const stale =
      !lastSync?.date ||
      lastSync.date < today ||
      !Number.isFinite(syncedAtMs) ||
      Date.now() - syncedAtMs > STALE_SYNC_MS;
    if (stale) {
      logger.info(
        { lastSyncDate: lastSync?.date, syncedAt: lastSync?.syncedAt },
        "[Attendance] Last sync is stale — catch-up run outside the :00/:30 slot"
      );
      return { run: true, tz, hour, minute, reason: "stale-catch-up" };
    }
  } catch {
    /* staleness check is best-effort — fall through to the normal skip */
  }

  return { run: false, tz, hour, minute, reason: "rate-gated" };
}

export async function runAttendanceSync(gate?: TickGate): Promise<void> {
  // Skip silently if Keka is not configured.
  const creds = await getKekaCredentials();
  if (!creds) {
    logger.debug("[Attendance] Keka not configured — skipping tick");
    return;
  }

  // ── Window / rate gate ──────────────────────────────────────────────────────
  // Callers normally pass the pre-lock gate result; when invoked directly
  // (tests, manual paths) evaluate it here.
  const g = gate ?? (await evaluateTickGate());
  if (!g.run) return;
  const { tz, hour, minute } = g;

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

    // ── Silent zero-write detection ───────────────────────────────────────────
    // A sync can return success:true but write 0 records when the Firebase
    // writes silently fail or are skipped. If Keka returned employees (> 0)
    // but nothing was written, this is a failure — not a success.
    if (todayResult.success && todayResult.recordsWritten === 0 && employees > 0) {
      logger.error(
        { recordsWritten: 0, employees },
        `[Attendance] Zero records written despite ${employees} linked users — treating as failure`
      );
      finalStatus = "Failed";
      lastError = `Zero records written despite ${employees} linked users`;
    }

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

export async function startAttendanceScheduler(): Promise<void> {
  // ── Startup lock hygiene ─────────────────────────────────────────────────────
  // A ghost instance (e.g. a previous deployment that never shut down cleanly)
  // can leave a stale lock in Firebase whose TTL has already elapsed.
  // The normal transaction inside withJobLock will reclaim it on the next tick,
  // but clearing it here means the very first tick after a restart is never
  // blocked by a lock from a previous process.
  // NOTE: lock renamed to "attendance-10min-v2". The previous name is still
  // being acquired every tick by older builds that take the lock BEFORE
  // checking credentials — an unconfigured instance (e.g. a deployment
  // missing KEKA_API_KEY) would win the lock race and silently skip, starving
  // every properly configured instance. Using a fresh lock name makes locks
  // held by old builds irrelevant.
  await clearExpiredLock("attendance-10min-v2");

  // Runs every 10 minutes; the handler decides whether to proceed based on
  // the active window (10-min during 09:30–11:30 and 17:00–20:00, 30-min
  // otherwise within the 06:00–22:00 gate; 21:30 provides the end-of-day pass).
  cron.schedule("*/10 * * * *", async () => {
    try {
      // Credentials gate BEFORE the lock: an instance that cannot sync must
      // never acquire the lock, or it blocks instances that can.
      // The OAuth token exchange needs client ID + secret + API key, so all
      // three must be present — a partial credential set would still acquire
      // the lock, fail the sync, and starve fully configured instances.
      const creds = await getKekaCredentials();
      if (!creds || !readKekaClientId() || !readKekaClientSecret()) {
        logger.warn(
          "[Attendance] Keka not configured on this instance — skipping tick without acquiring lock"
        );
        return;
      }
      // Window/rate gate BEFORE the lock: a tick that would be gated out must
      // never acquire the lock, or it steals the slot from an instance whose
      // tick fires a few seconds later.
      const gate = await evaluateTickGate();
      if (!gate.run) return;
      await withJobLock("attendance-10min-v2", ATTENDANCE_LOCK_TTL_MS, () =>
        runAttendanceSync(gate)
      );
    } catch (err) {
      logger.error({ err }, "[Attendance] Unhandled scheduler error");
    }
  });

  // Runs once per hour — checks consecutive failure count and emails the admin
  // if the sync has been failing for >= ALERT_FAILURE_THRESHOLD cycles (~30 min).
  cron.schedule("0 * * * *", () => {
    checkAttendanceSyncHealth().catch((err) =>
      logger.error({ err }, "[AttendanceAlert] Unhandled health-check error")
    );
  });

  logger.info(
    "[Attendance] Scheduler started — 10-min sync during 09:30–11:30 & 17:00–20:00; " +
    "30-min otherwise (06:00–22:00); end-of-day pass at 21:30; hourly admin health alert"
  );

  // ── Startup catch-up ────────────────────────────────────────────────────────
  // If this process just woke up (deploy restart, autoscale cold start) and the
  // last sync is stale, sync immediately instead of waiting up to 30 minutes
  // for the next cron slot. The stale-catch-up branch of evaluateTickGate
  // handles the decision; the job lock prevents duplicate work across instances.
  setTimeout(async () => {
    try {
      const creds = await getKekaCredentials();
      if (!creds || !readKekaClientId() || !readKekaClientSecret()) return;
      const gate = await evaluateTickGate();
      if (!gate.run) return;
      logger.info({ reason: gate.reason }, "[Attendance] Startup catch-up sync");
      await withJobLock("attendance-10min-v2", ATTENDANCE_LOCK_TTL_MS, () =>
        runAttendanceSync(gate)
      );
    } catch (err) {
      logger.error({ err }, "[Attendance] Startup catch-up failed");
    }
  }, 15_000);
}
