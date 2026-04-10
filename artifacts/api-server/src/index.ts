import app from "./app";
import { logger } from "./lib/logger";

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

const REQUIRED_AZURE_SECRETS = [
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "MS_SENDER_EMAIL",
] as const;

const missingAzureSecrets = REQUIRED_AZURE_SECRETS.filter(
  (key) => !process.env[key],
);

if (missingAzureSecrets.length > 0) {
  const msg =
    "FATAL: Microsoft 365 integration is not configured. " +
    "The following required environment secrets are missing: " +
    missingAzureSecrets.join(", ") +
    ". Set them in the Replit Secrets panel and restart the server.";
  logger.error({ missing: missingAzureSecrets }, msg);
  process.exit(1);
}

logger.info("Microsoft Graph email service configured");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
