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

/* ─── Delegated token exchange ─── */

/**
 * Exchange a stored refresh token for a fresh delegated access token.
 * Used to send 1:1 Teams DMs as the user (not the app).
 */
export async function getUserDelegatedToken(refreshToken: string): Promise<string | null> {
  try {
    const { tenantId, clientId, clientSecret } = getAzureConfig();
    const resp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          scope: "Chat.Create ChatMessage.Send offline_access",
        }),
      }
    );
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "[Teams Auth] Refresh token exchange failed");
      return null;
    }
    const data = (await resp.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    logger.warn({ err }, "[Teams Auth] getUserDelegatedToken threw");
    return null;
  }
}

/* ─── Teams 1:1 direct messages ─── */

/**
 * Send a 1:1 Teams direct message from the mentioner to the recipient.
 * Requires Chat.Create application permission in Azure.
 * Failures are caught and logged — never throws.
 */
export async function sendTeamsDirectMessage(params: {
  mentionerObjectId: string;
  recipientObjectId: string;
  mentionerName: string;
  taskName: string;
  clientName?: string;
  messageText?: string;
  taskId?: string;
  /** When provided, sends the DM as the mentioner (appears from their Teams account) */
  delegatedToken?: string;
}): Promise<void> {
  try {
    // Use delegated token (sends as the user) if available, otherwise fall back to app token
    const token = params.delegatedToken ?? await getAccessToken();
    const baseUrl = getTeamsBaseUrl();
    const taskUrl = params.taskId
      ? `${baseUrl}/?task=${encodeURIComponent(params.taskId)}`
      : baseUrl;

    // Step 1: Create or retrieve a 1:1 chat between the two users
    const chatResp = await fetch("https://graph.microsoft.com/v1.0/chats", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${params.mentionerObjectId}')`,
          },
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${params.recipientObjectId}')`,
          },
        ],
      }),
    });

    if (!chatResp.ok) {
      const text = await chatResp.text();
      logger.warn({ status: chatResp.status, body: text }, "[Teams DM] Chat create/retrieve failed");
      return;
    }

    const chatData = (await chatResp.json()) as { id: string };
    const chatId = chatData.id;

    // Step 2: Send the message
    const taskLabel = params.taskName ? `<b>${params.taskName}</b>` : "a task";
    const clientLabel = params.clientName ? ` (${params.clientName})` : "";
    const preview = params.messageText
      ? `<blockquote>${params.messageText}</blockquote>`
      : "";

    const msgResp = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        body: {
          contentType: "html",
          content:
            `<p>👋 <b>${params.mentionerName}</b> mentioned you in ${taskLabel}${clientLabel}.</p>` +
            preview +
            `<p><a href="${taskUrl}">Open in Flow Pro →</a></p>`,
        },
      }),
    });

    if (!msgResp.ok) {
      const text = await msgResp.text();
      logger.warn({ status: msgResp.status, body: text }, "[Teams DM] Message send failed");
    } else {
      logger.info(
        { chatId, mentionerObjectId: params.mentionerObjectId, recipientObjectId: params.recipientObjectId },
        "[Teams DM] Direct message sent"
      );
    }
  } catch (err) {
    logger.warn({ err }, "[Teams DM] sendTeamsDirectMessage threw — skipping");
  }
}

/* ─── Teams activity notifications ─── */

/**
 * Returns the correct Teams App ID for the current environment.
 * Development → TEAMS_APP_ID_TEST (test package, Replit preview URL)
 * Production  → TEAMS_APP_ID      (live package, project.ethinos.com)
 */
// The live Teams app manifest ID — not sensitive (it's in the public manifest).
// Overridable via env var; hardcoded here as a reliable production fallback.
const TEAMS_APP_ID_PROD_DEFAULT = "357151d3-0f6a-4270-a942-0bdf9202fc05";

export function getTeamsAppId(): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return process.env.TEAMS_APP_ID_TEST || process.env.TEAMS_APP_ID || process.env.TEAMS_APP_ID_LIVE;
  }
  return (
    process.env.TEAMS_APP_ID_LIVE ||
    process.env.TEAMS_APP_ID ||
    process.env.TEAMS_APP_ID_TEST ||
    TEAMS_APP_ID_PROD_DEFAULT
  );
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

export interface TeamsNotificationResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Send a Teams activity-feed notification to a user.
 * Requires TEAMS_APP_ID env var and TeamsActivity.Send Graph permission.
 * Never throws — returns { ok: false, error } on failure so callers can report it.
 */
export async function sendTeamsActivityNotification(params: {
  recipientObjectId: string;
  mentionerName: string;
  taskName: string;
  clientName?: string;
  previewText: string;
  taskId?: string;
}): Promise<TeamsNotificationResult> {
  const teamsAppId = getTeamsAppId();
  if (!teamsAppId) {
    return {
      ok: false,
      error:
        "Teams app ID is not configured on the server. " +
        "Set TEAMS_APP_ID (live) or TEAMS_APP_ID_TEST (dev) in your environment secrets and redeploy.",
    };
  }

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
      // teamsAppId disambiguates when multiple Teams apps share the same AAD app ID (e.g. TEST + LIVE).
      // Without it, Graph returns 409 "Found multiple applications with the same AAD App ID".
      teamsAppId,
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

      // Map well-known Graph error codes to user-friendly messages
      let friendlyError: string;
      if (resp.status === 403 || (resp.status === 400 && text.includes("installed applications"))) {
        friendlyError = "Teams app not installed in your personal scope — open Teams → Apps, find Flow Pro, and click Add for yourself.";
      } else if (resp.status === 409) {
        friendlyError = "Multiple Teams apps share the same AAD App ID — check your TEAMS_APP_ID configuration.";
      } else if (resp.status === 404) {
        friendlyError = "Teams user not found — make sure the recipient has a Teams account.";
      } else {
        friendlyError = `Graph API error ${resp.status}: ${text.slice(0, 200)}`;
      }

      return { ok: false, status: resp.status, error: friendlyError };
    }

    logger.info(
      { recipientObjectId: params.recipientObjectId, taskName: params.taskName },
      "[Teams] Activity notification sent"
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[Teams] sendActivityNotification threw — skipping");
    return { ok: false, error: msg };
  }
}
