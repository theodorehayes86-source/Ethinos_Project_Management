import cron from "node-cron";
import { syncKekaData, checkLeaveConflict } from "./keka-client";
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

export function startKekaScheduler(): void {
  cron.schedule("0 2 * * *", () => {
    runKekaSync().catch((err) =>
      logger.error({ err }, "[Keka] Unhandled scheduler error")
    );
  });

  logger.info("[Keka] Scheduler started — nightly sync at 02:00 UTC");
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
