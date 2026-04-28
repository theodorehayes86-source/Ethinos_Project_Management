import cron from "node-cron";
import { toZonedTime } from "date-fns-tz";
import { syncKekaData, checkLeaveConflict } from "./keka-client";
import { readFirebasePath } from "./firebase-admin";
import { logger } from "./logger";

export { checkLeaveConflict };

export async function runKekaSync(): Promise<void> {
  logger.info("[Keka] Running scheduled sync");
  try {
    const result = await syncKekaData();
    if (result.success) {
      logger.info(result, "[Keka] Scheduled sync complete");
    } else {
      logger.warn(result, "[Keka] Scheduled sync completed with errors");
    }
  } catch (err) {
    logger.error({ err }, "[Keka] Unhandled error during sync");
  }
}

/**
 * Check if it's currently 02:00 in the configured local timezone, then sync.
 * Timezone is shared with the reminder-schedule setting in Firebase.
 */
async function runScheduledKekaSync(): Promise<void> {
  try {
    const schedRaw = await readFirebasePath<{
      scheduleTimezone?: string;
    }>("settings/notifications/reminders-schedule");

    const tz = schedRaw?.scheduleTimezone || "Europe/London";
    const nowInTz = toZonedTime(new Date(), tz);
    const currentHour = nowInTz.getHours();

    if (currentHour !== 2) {
      logger.debug(
        { currentHour, tz },
        "[Keka] Hourly tick — not 02:00 local time, skipping"
      );
      return;
    }

    logger.info({ tz }, "[Keka] Hourly tick matches 02:00 local time — running nightly sync");
    await runKekaSync();
  } catch (err) {
    logger.error({ err }, "[Keka] Error reading schedule config");
  }
}

export function startKekaScheduler(): void {
  cron.schedule("0 * * * *", () => {
    runScheduledKekaSync().catch((err) =>
      logger.error({ err }, "[Keka] Unhandled scheduler error")
    );
  });

  logger.info("[Keka] Scheduler started — nightly sync at 02:00 local time");
}

export async function isDateLeaveOrHoliday(
  userId: string,
  dateStr: string,
  region = "All"
): Promise<boolean> {
  const conflict = await checkLeaveConflict(userId, dateStr, region);
  if (!conflict) return false;
  return conflict.type === "full-leave" || conflict.type === "holiday";
}
