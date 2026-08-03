import { logger } from "./logger";
import { readFirebasePath, writeFirebasePath } from "./firebase-admin";

/**
 * Typed error thrown by Graph API calls so callers can inspect the HTTP status code.
 */
export class GraphApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

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

/* ─── Teams app installation ─── */

/**
 * Check whether the Flow Pro Teams app is installed for a user (personal scope).
 * Returns the installation record ID if found, or null.
 * Requires TeamsAppInstallation.ReadWriteForUser.All application permission.
 */
export async function getTeamsAppInstallationId(userObjectId: string): Promise<string | null> {
  const teamsAppId = getTeamsAppId();
  if (!teamsAppId) return null;
  const token = await getAccessToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userObjectId}/teamwork/installedApps?$filter=teamsApp/externalId eq '${teamsAppId}'&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return null;
  const data = (await resp.json()) as { value?: { id: string }[] };
  return data.value?.[0]?.id ?? null;
}

/** @deprecated Use getTeamsAppInstallationId */
export async function checkTeamsAppInstalled(userObjectId: string): Promise<boolean> {
  return (await getTeamsAppInstallationId(userObjectId)) !== null;
}

/**
 * Programmatically install the Flow Pro Teams app for a user (personal scope).
 * Returns { ok, error? }.
 * Requires TeamsAppInstallation.ReadWriteForUser.All application permission in Azure AD.
 */
export async function installTeamsAppForUser(
  userObjectId: string
): Promise<{ ok: boolean; error?: string }> {
  const teamsAppId = getTeamsAppId();
  if (!teamsAppId) return { ok: false, error: "Teams app ID not configured on server." };

  try {
    const token = await getAccessToken();

    // Step 1: resolve the Graph-internal app catalog ID from the external manifest ID
    const catalogResp = await fetch(
      `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=externalId eq '${teamsAppId}'&$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!catalogResp.ok) {
      const text = await catalogResp.text();
      return { ok: false, error: `App catalog lookup failed (${catalogResp.status}): ${text.slice(0, 200)}` };
    }
    const catalogData = (await catalogResp.json()) as { value?: { id: string }[] };
    const catalogAppId = catalogData.value?.[0]?.id;
    if (!catalogAppId) {
      return { ok: false, error: "App not found in org app catalog. Make sure it has been uploaded and approved in Teams Admin Center." };
    }

    // Step 2: install for the user
    const installResp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userObjectId}/teamwork/installedApps`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          "teamsApp@odata.bind": `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogAppId}`,
        }),
      }
    );

    if (!installResp.ok) {
      const text = await installResp.text();
      // 409 = already installed — treat as success
      if (installResp.status === 409) return { ok: true };
      return { ok: false, error: `Install failed (${installResp.status}): ${text.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
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

    // Resolve the installation record ID so we can use entityUrl topic format.
    // entityUrl references the install directly — bypasses the internal catalog-ID lookup
    // that causes "Failed to find Teams application within installed applications" when
    // the external manifest ID is passed as teamsAppId.
    const installationId = await getTeamsAppInstallationId(params.recipientObjectId);

    let topic: Record<string, string>;
    if (installationId) {
      topic = {
        source: "entityUrl",
        value: `https://graph.microsoft.com/v1.0/users/${params.recipientObjectId}/teamwork/installedApps/${installationId}`,
      };
    } else {
      // Fallback: text topic with Teams deep-link (requires teamsAppId to resolve via catalog ID).
      const teamsDeepLink = `https://teams.microsoft.com/l/entity/${teamsAppId}/home`;
      topic = {
        source: "text",
        value: params.taskName ? `Task: ${params.taskName}` : "Flow Pro Task",
        webUrl: teamsDeepLink,
      };
    }

    const body: Record<string, unknown> = {
      topic,
      activityType: "taskMention",
      previewText: { content: params.previewText },
      // templateParameters must match the activityTypes in the Teams app manifest.
      // Manifest templateText: "{mentionerName} mentioned you in \"{taskName}\""
      templateParameters: [
        { name: "mentionerName", value: params.mentionerName || "A teammate" },
        { name: "taskName", value: params.taskName || "a task" },
      ],
    };

    // teamsAppId only needed for text-topic fallback to disambiguate apps sharing the same AAD ID.
    if (!installationId) {
      body.teamsAppId = teamsAppId;
    }

    logger.info(
      { recipientObjectId: params.recipientObjectId, installationId, topicSource: topic.source },
      "[Teams] Sending activity notification"
    );

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

/* ─── Teams 1:1 Chat (direct messaging via Graph) ─── */

export interface GraphChatMessage {
  id: string;
  from?: { user?: { id: string; displayName: string } };
  body: { content: string; contentType: string };
  createdDateTime: string;
}

/**
 * Find an existing 1:1 chat between two users, or create one.
 * Uses POST /chats which is idempotent for oneOnOne chats.
 */
export async function findOrCreateOneOnOneChat(
  user1ObjectId: string,
  user2ObjectId: string
): Promise<string> {
  const token = await getAccessToken();
  const resp = await fetch("https://graph.microsoft.com/v1.0/chats", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      chatType: "oneOnOne",
      members: [
        {
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${user1ObjectId}')`,
        },
        {
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${user2ObjectId}')`,
        },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[Graph] findOrCreateOneOnOneChat: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as { id: string };
  return data.id;
}

/** Fetch recent messages from a 1:1 chat (returned oldest to newest). */
export async function getChatMessages(chatId: string, top = 50): Promise<GraphChatMessage[]> {
  const token = await getAccessToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/messages?$top=${top}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[Graph] getChatMessages: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as { value: GraphChatMessage[] };
  return (data.value || []).reverse();
}

/** Fetch a single message from a chat by its Graph message ID. */
export async function getChatMessage(chatId: string, messageId: string): Promise<GraphChatMessage | null> {
  try {
    const token = await getAccessToken();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return null;
    return (await resp.json()) as GraphChatMessage;
  } catch {
    return null;
  }
}

// ── Bot Connector ────────────────────────────────────────────────────────────

let cachedBotToken: { token: string; expiresAt: number } | null = null;

/** Get a Bot Framework token (different audience from Graph). */
async function getBotFrameworkToken(): Promise<string> {
  if (cachedBotToken && Date.now() < cachedBotToken.expiresAt) {
    return cachedBotToken.token;
  }
  const { clientId, clientSecret } = getAzureConfig();
  const resp = await fetch(
    "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://api.botframework.com/.default",
      }).toString(),
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[Bot] Token fetch failed: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as GraphTokenResponse;
  cachedBotToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedBotToken.token;
}

/**
 * Get the Graph chat ID for the bot's 1:1 with a user.
 * Tries every known app external ID so dev/prod mismatches don't block delivery.
 */
export async function getBotUserChatId(userObjectId: string): Promise<string | null> {
  const token = await getAccessToken();

  // Collect all distinct app external IDs across env vars + hardcoded prod default.
  const candidates = [
    process.env.TEAMS_APP_ID_LIVE,
    process.env.TEAMS_APP_ID,
    process.env.TEAMS_APP_ID_TEST,
    TEAMS_APP_ID_PROD_DEFAULT,
  ].filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i);

  for (const externalId of candidates) {
    try {
      const listResp = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userObjectId}/teamwork/installedApps?$filter=teamsApp/externalId eq '${externalId}'&$select=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!listResp.ok) continue;
      const listData = (await listResp.json()) as { value?: { id: string }[] };
      const installationId = listData.value?.[0]?.id;
      if (!installationId) continue;

      const chatResp = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userObjectId}/teamwork/installedApps/${installationId}/chat`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!chatResp.ok) continue;
      const chatData = (await chatResp.json()) as { id?: string };
      if (chatData.id) {
        logger.info({ externalId, userObjectId }, "[Bot] Found bot-user chat via app ID");
        return chatData.id;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Regional service URLs in preference order (India tenant → AMER → EMEA → APAC)
const BOT_SERVICE_URLS = [
  "https://smba.trafficmanager.net/in/",
  "https://smba.trafficmanager.net/amer/",
  "https://smba.trafficmanager.net/emea/",
  "https://smba.trafficmanager.net/apac/",
];

/**
 * Remembers which service URL worked last time so we skip the sequential
 * fallback on every call after the first successful delivery.
 */
let lastSuccessfulBotServiceUrl: string | null = null;

/**
 * Send a proactive Bot Connector message to a user's 1:1 bot chat.
 * The message appears in Teams as a message from the Flow Pro bot.
 */
export async function sendBotProactiveMessage(
  recipientAadId: string,
  senderDisplayName: string,
  messageText: string
): Promise<void> {
  const { clientId } = getAzureConfig();

  const conversationId = await getBotUserChatId(recipientAadId);
  if (!conversationId) {
    throw new Error(`[Bot] No bot-user chat found for recipient ${recipientAadId} — app may not be installed`);
  }

  const botToken = await getBotFrameworkToken();
  const activity = {
    type: "message",
    text: `**${senderDisplayName}** (via Flow Pro):\n\n${messageText}`,
    from: { id: `28:${clientId}`, name: "Flow Pro" },
    recipient: { id: `29:${recipientAadId}` },
    channelData: { notification: { alert: true } },
  };

  // Try the last-successful URL first to avoid the sequential fallback on
  // every call. On first use (or after a server restart) this is null and we
  // fall through to the full list.
  const orderedUrls = lastSuccessfulBotServiceUrl
    ? [lastSuccessfulBotServiceUrl, ...BOT_SERVICE_URLS.filter(u => u !== lastSuccessfulBotServiceUrl)]
    : BOT_SERVICE_URLS;

  let lastErr: Error = new Error("[Bot] No service URLs tried");
  for (const serviceUrl of orderedUrls) {
    try {
      const sendResp = await fetch(
        `${serviceUrl}v3/conversations/${encodeURIComponent(conversationId)}/activities`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(activity),
        }
      );
      if (sendResp.ok) {
        lastSuccessfulBotServiceUrl = serviceUrl; // cache for next call
        logger.info({ serviceUrl, recipientAadId }, "[Bot] Proactive message sent");
        return;
      }
      const text = await sendResp.text();
      lastErr = new Error(`[Bot] ${serviceUrl}: ${sendResp.status} ${text}`);
      logger.warn({ serviceUrl, status: sendResp.status, text }, "[Bot] Service URL failed, trying next");
    } catch (err) {
      lastErr = err as Error;
      logger.warn({ serviceUrl, err }, "[Bot] Service URL threw, trying next");
    }
  }
  throw lastErr;
}

/**
 * Get the two members of a 1:1 chat.
 * Returns array of { aadObjectId, displayName } — useful to find the recipient from rawChatId.
 */
export async function getChatMembers(
  chatId: string
): Promise<{ aadObjectId: string; displayName: string }[]> {
  const token = await getAccessToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/members`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[Graph] getChatMembers: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as {
    value: { userId?: string; displayName?: string }[];
  };
  return data.value
    .filter((m) => m.userId)
    .map((m) => ({ aadObjectId: m.userId!, displayName: m.displayName ?? "" }));
}

/**
 * Subscribe to new messages in a 1:1 chat via Graph change notifications.
 *
 * Graph subscription lifetime for /chats/{id}/messages (app-only, no resource data):
 *   Maximum: 60 minutes  (confirmed in Graph docs for chat message subscriptions)
 *   We request 55 minutes to stay safely within the limit.
 *
 * Lifecycle notifications are not required for this subscription type at the durations used.
 */
export async function subscribeToChatMessages(
  chatId: string,
  notificationUrl: string,
  clientState: string
): Promise<{ id: string; expiresDateTime: string }> {
  const token = await getAccessToken();
  const expiresDateTime = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  const resp = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl,
      resource: `/chats/${chatId}/messages`,
      expirationDateTime: expiresDateTime,
      clientState,
      latestSupportedTlsVersion: "v1_2",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new GraphApiError(resp.status, `[Graph] subscribeToChatMessages: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as { id: string; expirationDateTime: string };
  return { id: data.id, expiresDateTime: data.expirationDateTime };
}

/**
 * Renew an existing Graph change-notification subscription.
 * Returns the actual expiry ISO string confirmed by Graph's response.
 *
 * Throws GraphApiError so callers can inspect the HTTP status (e.g. 404 = dead subscription).
 */
export async function renewChatSubscription(subscriptionId: string): Promise<string> {
  const token = await getAccessToken();
  const requestedExpiry = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expirationDateTime: requestedExpiry }),
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new GraphApiError(resp.status, `[Graph] renewChatSubscription: ${resp.status} ${text}`);
  }
  // Use the expiry Graph actually assigned — it may differ from the requested value.
  const data = (await resp.json()) as { expirationDateTime?: string };
  return data.expirationDateTime ?? requestedExpiry;
}
