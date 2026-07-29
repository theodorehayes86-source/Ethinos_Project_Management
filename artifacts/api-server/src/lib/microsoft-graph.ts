import { logger } from "./logger";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getAzureConfig() {
  const tenantId = process.env.AZURE_TENANT_ID || process.env.VITE_AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const senderEmail = process.env.MS_SENDER_EMAIL;

  if (!tenantId || !clientId || !clientSecret || !senderEmail) {
    throw new Error(
      "Microsoft Graph email is not configured. Required: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, MS_SENDER_EMAIL"
    );
  }

  return { tenantId, clientId, clientSecret, senderEmail };
}

async function getAccessToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = getAzureConfig();

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get Microsoft Graph token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as GraphTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  bcc?: string[];
}): Promise<void> {
  const { senderEmail } = getAzureConfig();
  const token = await getAccessToken();

  const messageBody: Record<string, unknown> = {
    subject: params.subject,
    body: {
      contentType: "HTML",
      content: params.bodyHtml,
    },
    toRecipients: [
      {
        emailAddress: {
          address: params.to,
        },
      },
    ],
  };

  if (params.bcc && params.bcc.length > 0) {
    messageBody.bccRecipients = params.bcc.map((addr) => ({
      emailAddress: { address: addr },
    }));
  }

  const message = {
    message: messageBody,
    saveToSentItems: false,
  };

  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;

  const response = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "Microsoft Graph sendMail failed");
    throw new Error(`Failed to send email via Microsoft Graph: ${response.status} ${text}`);
  }

  logger.info({ to: params.to, subject: params.subject }, "Email sent via Microsoft Graph");
}

export function isEmailConfigured(): boolean {
  return !!(
    (process.env.AZURE_TENANT_ID || process.env.VITE_AZURE_TENANT_ID) &&
    (process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID) &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.MS_SENDER_EMAIL
  );
}

/* ─── Teams activity notifications ─── */

/**
 * Returns the correct Teams App ID for the current environment.
 * Development → TEAMS_APP_ID_TEST (test package, Replit preview URL)
 * Production  → TEAMS_APP_ID      (live package, project.ethinos.com)
 */
export function getTeamsAppId(): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return process.env.TEAMS_APP_ID_TEST || process.env.TEAMS_APP_ID;
  }
  return process.env.TEAMS_APP_ID;
}

/**
 * Returns the base URL for Teams deep-links, matching the environment.
 */
export function getTeamsBaseUrl(): string {
  if (process.env.NODE_ENV !== "production") {
    const devDomain = process.env.REPLIT_DEV_DOMAIN;
    return devDomain ? `https://${devDomain}` : "https://project.ethinos.com";
  }
  return "https://project.ethinos.com";
}

export function isTeamsConfigured(): boolean {
  return !!(getTeamsAppId() && isEmailConfigured());
}

const objectIdMemoryCache = new Map<string, string>();

/**
 * Resolve a user's Entra (Azure AD) Object ID from their email address.
 * Checks an in-memory cache first, then Firebase (users/{pmtUserId}/msObjectId),
 * then calls Graph API and caches the result for future lookups.
 */
export async function resolveEntraObjectId(
  email: string,
  pmtUserId?: string
): Promise<string | null> {
  const normalised = email.toLowerCase();

  if (objectIdMemoryCache.has(normalised)) {
    return objectIdMemoryCache.get(normalised)!;
  }

  // Firebase cache: stored in a flat keyed collection separate from the users array
  if (pmtUserId) {
    try {
      const stored = await readFirebasePath<string | null>(`userMeta/${pmtUserId}/msObjectId`);
      if (stored && typeof stored === "string") {
        objectIdMemoryCache.set(normalised, stored);
        return stored;
      }
    } catch {
      // Fall through to Graph API lookup
    }
  }

  try {
    const token = await getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(normalised)}?$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) {
      logger.warn(
        { status: resp.status, email: normalised },
        "[Teams] Graph user lookup failed"
      );
      return null;
    }
    const json = (await resp.json()) as { id?: string };
    if (!json.id) return null;

    objectIdMemoryCache.set(normalised, json.id);

    if (pmtUserId) {
      writeFirebasePath(`userMeta/${pmtUserId}/msObjectId`, json.id).catch((err) => {
        logger.warn({ err, pmtUserId }, "[Teams] Could not cache msObjectId in Firebase");
      });
    }

    return json.id;
  } catch (err) {
    logger.warn({ err, email: normalised }, "[Teams] resolveEntraObjectId threw");
    return null;
  }
}

/**
 * Send a Teams activity-feed notification to a user.
 * Requires TEAMS_APP_ID env var and TeamsActivity.Send Graph permission.
 * Failures are caught and logged — never throws, never blocks the email path.
 */
export async function sendTeamsActivityNotification(params: {
  recipientObjectId: string;
  mentionerName: string;
  taskName: string;
  clientName?: string;
  previewText: string;
  taskId?: string;
}): Promise<void> {
  const teamsAppId = getTeamsAppId();
  if (!teamsAppId) return;

  try {
    const token = await getAccessToken();
    const baseUrl = getTeamsBaseUrl();
    const deepLinkUrl = params.taskId
      ? `${baseUrl}/?task=${encodeURIComponent(params.taskId)}`
      : baseUrl;

    // Teams activity notification topic:
    // source "text" with a Teams deep-link webUrl is required for user-level notifications.
    // The webUrl must start with https://teams.microsoft.com/l/
    const teamsDeepLink = `https://teams.microsoft.com/l/entity/${teamsAppId}/home`;

    const body = {
      topic: {
        source: "text",
        value: params.taskName ? `Task: ${params.taskName}` : "Flow Pro Task",
        webUrl: teamsDeepLink,
      },
      activityType: "taskMention",
      previewText: {
        content: params.previewText,
      },
      // templateParameters must exactly match the activityTypes definition in the Teams app manifest.
      // Manifest templateText: "{mentionerName} mentioned you in \"{taskName}\""
      templateParameters: [
        { name: "mentionerName", value: params.mentionerName || "A teammate" },
        { name: "taskName", value: params.taskName || "a task" },
      ],
    };

    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${params.recipientObjectId}/teamwork/sendActivityNotification`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      logger.warn(
        { status: resp.status, body: text, recipientObjectId: params.recipientObjectId },
        "[Teams] sendActivityNotification failed"
      );
    } else {
      logger.info(
        { recipientObjectId: params.recipientObjectId, taskName: params.taskName },
        "[Teams] Activity notification sent"
      );
    }
  } catch (err) {
    logger.warn({ err }, "[Teams] sendActivityNotification threw — skipping");
  }
}
