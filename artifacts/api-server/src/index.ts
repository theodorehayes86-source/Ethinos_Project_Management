import app from "./app";
import { logger } from "./lib/logger";
import { startReminderScheduler } from "./lib/reminder-scheduler";
import { startRepeatScheduler } from "./lib/repeat-scheduler";
import { startWeeklyDigestScheduler } from "./lib/weekly-digest-scheduler";
import { startKekaScheduler } from "./lib/keka-scheduler";
import { startAttendanceScheduler } from "./lib/attendance-scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const hasTenantId = !!(process.env.AZURE_TENANT_ID || process.env.VITE_AZURE_TENANT_ID);
const hasClientId = !!(process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID);
const hasClientSecret = !!process.env.AZURE_CLIENT_SECRET;
const hasSenderEmail = !!process.env.MS_SENDER_EMAIL;

if (!hasTenantId || !hasClientId || !hasClientSecret || !hasSenderEmail) {
  const missing: string[] = [];
  if (!hasTenantId) missing.push("AZURE_TENANT_ID (or VITE_AZURE_TENANT_ID)");
  if (!hasClientId) missing.push("AZURE_CLIENT_ID (or VITE_AZURE_CLIENT_ID)");
  if (!hasClientSecret) missing.push("AZURE_CLIENT_SECRET");
  if (!hasSenderEmail) missing.push("MS_SENDER_EMAIL");
  const msg =
    "FATAL: Microsoft 365 integration is not configured. " +
    "The following required environment secrets are missing: " +
    missing.join(", ") +
    ". Set them in the Replit Secrets panel and restart the server.";
  logger.error({ missing }, msg);
  process.exit(1);
}

logger.info("Microsoft Graph email service configured");

const isDev = process.env.NODE_ENV !== "production";
const teamsAppId = isDev
  ? (process.env.TEAMS_APP_ID_TEST || process.env.TEAMS_APP_ID)
  : process.env.TEAMS_APP_ID;

if (!teamsAppId) {
  logger.warn(
    isDev
      ? "TEAMS_APP_ID_TEST is not set — Teams activity notifications will be skipped in dev. See teams-app/README.md."
      : "TEAMS_APP_ID is not set — Teams activity notifications will be skipped in production. See teams-app/README.md."
  );
} else {
  logger.info(
    { env: isDev ? "development" : "production", appId: teamsAppId },
    `Teams activity notifications configured (${isDev ? "TEST" : "LIVE"} package)`
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startRepeatScheduler();
  startReminderScheduler();
  startWeeklyDigestScheduler();
  startKekaScheduler();
  startAttendanceScheduler();
});
