/**
 * Teams OAuth2 delegated auth routes.
 *
 * POST /api/teams/auth-url   — returns the Microsoft OAuth2 authorization URL
 * GET  /api/teams/callback   — handles the redirect from Microsoft, stores refresh token
 * DELETE /api/teams/disconnect — removes stored refresh token for the current user
 * GET  /api/teams/status     — returns { connected: boolean } for the current user
 *
 * Delegated scopes requested: Chat.Create ChatMessage.Send offline_access
 * These allow the server to send 1:1 Teams DMs on behalf of the user.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { getAdminAuth } from "../lib/firebase-admin";
import { readFirebasePath, writeFirebasePath } from "../lib/firebase-admin";
import { getUserDelegatedToken, resolveEntraObjectId, sendTeamsActivityNotification } from "../lib/microsoft-graph";
import { logger } from "../lib/logger";

async function requireFirebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Missing Authorization header" }); return; }
  try { await getAdminAuth().verifyIdToken(authHeader.slice(7)); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

const router = Router();

/* ─── helpers ─── */

function getAzureCfg() {
  return {
    tenantId: process.env.AZURE_TENANT_ID || process.env.VITE_AZURE_TENANT_ID || "",
    clientId: process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID || "",
    clientSecret: process.env.AZURE_CLIENT_SECRET || "",
  };
}

function getRedirectUri(): string {
  // Use explicit override if configured (e.g. for dev testing)
  if (process.env.TEAMS_OAUTH_REDIRECT_URI) return process.env.TEAMS_OAUTH_REDIRECT_URI;
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (process.env.NODE_ENV !== "production" && devDomain) {
    return `https://${devDomain}/api/teams/callback`;
  }
  return "https://project.ethinos.com/api/teams/callback";
}

function getFrontendBaseUrl(): string {
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (process.env.NODE_ENV !== "production" && devDomain) return `https://${devDomain}`;
  return "https://project.ethinos.com";
}

const HMAC_SECRET = process.env.SESSION_SECRET || "pmt-teams-oauth-fallback";
const DELEGATED_SCOPES = "Chat.Create ChatMessage.Send offline_access";

function signState(pmtUserId: string | number): string {
  const ts = Date.now();
  const payload = `${pmtUserId}|${ts}`;
  const sig = createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

function verifyState(state: string): { pmtUserId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length !== 3) return null;
    const [pmtUserId, ts, sig] = parts;
    // Reject states older than 10 minutes
    if (Date.now() - Number(ts) > 10 * 60 * 1000) return null;
    const expectedSig = createHmac("sha256", HMAC_SECRET)
      .update(`${pmtUserId}|${ts}`)
      .digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { pmtUserId };
  } catch {
    return null;
  }
}

/** Verify Firebase ID token and return the decoded user */
async function verifyFirebaseToken(req: Request): Promise<{ email?: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return await getAdminAuth().verifyIdToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

/** Look up a PMT user by email from the Firebase users array */
async function getPmtUserByEmail(email: string): Promise<{ id: string | number } | null> {
  type PmtUser = { id?: string | number; email?: string; emailAddress?: string };
  const raw = await readFirebasePath<PmtUser[] | Record<string, PmtUser> | null>("users");
  const arr: PmtUser[] = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];
  const match = arr.find(
    (u) => u?.email?.toLowerCase() === email.toLowerCase() ||
           u?.emailAddress?.toLowerCase() === email.toLowerCase()
  );
  return match && match.id != null ? { id: match.id } : null;
}

/* ─── routes ─── */

/**
 * POST /api/teams/auth-url
 * Requires Firebase auth. Returns { url } — the Microsoft OAuth2 authorization URL.
 * The frontend opens this URL in a popup to start the delegated auth flow.
 */
router.post("/teams/auth-url", async (req: Request, res: Response) => {
  const decoded = await verifyFirebaseToken(req);
  if (!decoded || !decoded.email) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const pmtUser = await getPmtUserByEmail(decoded.email);
  if (!pmtUser) {
    res.status(404).json({ error: "PMT user not found for this account" });
    return;
  }

  const { tenantId, clientId } = getAzureCfg();
  const redirectUri = getRedirectUri();
  const state = signState(pmtUser.id);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: DELEGATED_SCOPES,
    state,
    response_mode: "query",
  });

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
  logger.info({ pmtUserId: pmtUser.id }, "[Teams Auth] Auth URL generated");
  res.json({ url });
});

/**
 * GET /api/teams/callback
 * No auth — Microsoft redirects the user's browser here with ?code=&state=
 * Exchanges the code for tokens, stores the refresh token, and closes the popup.
 */
router.get("/teams/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    logger.warn({ error, error_description }, "[Teams Auth] OAuth2 error from Microsoft");
    res.status(400).send(closePopupHtml("error", `Microsoft returned an error: ${error_description || error}`));
    return;
  }

  if (!code || !state) {
    res.status(400).send(closePopupHtml("error", "Missing code or state."));
    return;
  }

  const verified = verifyState(state);
  if (!verified) {
    res.status(400).send(closePopupHtml("error", "Invalid or expired state. Please try again."));
    return;
  }

  const { pmtUserId } = verified;
  const { tenantId, clientId, clientSecret } = getAzureCfg();
  const redirectUri = getRedirectUri();

  // Exchange code for tokens
  const tokenResp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        scope: DELEGATED_SCOPES,
      }),
    }
  );

  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResp.ok || !tokenData.refresh_token) {
    logger.warn({ pmtUserId, error: tokenData.error }, "[Teams Auth] Token exchange failed");
    res.status(400).send(closePopupHtml("error", `Token exchange failed: ${tokenData.error_description || tokenData.error || "unknown"}`));
    return;
  }

  // Verify the token actually works before storing it
  const testToken = await getUserDelegatedToken(tokenData.refresh_token).catch(() => null);
  if (!testToken) {
    res.status(400).send(closePopupHtml("error", "Token obtained but could not be verified. Please try again."));
    return;
  }

  // Store refresh token and mark user as connected
  await writeFirebasePath(`userMeta/${pmtUserId}/msRefreshToken`, tokenData.refresh_token);
  await writeFirebasePath(`userMeta/${pmtUserId}/teamsConnected`, true);

  logger.info({ pmtUserId }, "[Teams Auth] Refresh token stored — Teams DM enabled");
  res.send(closePopupHtml("success", "Teams connected! You can close this window."));
});

/**
 * DELETE /api/teams/disconnect
 * Requires Firebase auth. Removes the stored refresh token.
 */
router.delete("/teams/disconnect", async (req: Request, res: Response) => {
  const decoded = await verifyFirebaseToken(req);
  if (!decoded || !decoded.email) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const pmtUser = await getPmtUserByEmail(decoded.email);
  if (!pmtUser) {
    res.status(404).json({ error: "PMT user not found" });
    return;
  }

  await writeFirebasePath(`userMeta/${pmtUser.id}/msRefreshToken`, null);
  await writeFirebasePath(`userMeta/${pmtUser.id}/teamsConnected`, false);
  logger.info({ pmtUserId: pmtUser.id }, "[Teams Auth] Refresh token removed — Teams DM disabled");
  res.json({ disconnected: true });
});

/**
 * GET /api/teams/status
 * Requires Firebase auth. Returns { connected: boolean }.
 */
router.get("/teams/status", async (req: Request, res: Response) => {
  const decoded = await verifyFirebaseToken(req);
  if (!decoded || !decoded.email) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const pmtUser = await getPmtUserByEmail(decoded.email);
  if (!pmtUser) {
    res.json({ connected: false });
    return;
  }

  const connected = await readFirebasePath<boolean | null>(`userMeta/${pmtUser.id}/teamsConnected`);
  res.json({ connected: !!connected });
});

/* ─── popup HTML helpers ─── */

function closePopupHtml(status: "success" | "error", message: string): string {
  const isSuccess = status === "success";
  const color = isSuccess ? "#16a34a" : "#dc2626";
  const icon = isSuccess ? "✅" : "❌";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${isSuccess ? "Teams Connected" : "Connection Failed"}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.10); max-width: 360px; width: 90%; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: ${color}; font-size: 20px; margin: 0 0 8px; }
    p { color: #64748b; font-size: 14px; margin: 0 0 24px; }
    button { background: #2563eb; color: white; border: none; border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${isSuccess ? "Teams Connected!" : "Connection Failed"}</h1>
    <p>${message}</p>
    <button onclick="finish()">Close</button>
  </div>
  <script>
    function finish() {
      if (window.opener) {
        window.opener.postMessage({ type: 'teamsAuthResult', status: '${status}' }, '*');
      }
      window.close();
    }
    // Auto-close on success after a short delay
    ${isSuccess ? "setTimeout(finish, 1500);" : ""}
  </script>
</body>
</html>`;
}

/* ─── Test ping endpoint ─── */

router.post("/test-ping", requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization!;
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    const email = decoded.email;
    if (!email) { res.status(400).json({ error: "No email in token" }); return; }

    type FBUser = { id?: string; email?: string; emailAddress?: string };
    const usersRaw = await readFirebasePath<FBUser[] | Record<string, FBUser> | null>("users");
    const usersArr: FBUser[] = Array.isArray(usersRaw)
      ? usersRaw : usersRaw ? Object.values(usersRaw) : [];
    const userRecord = usersArr.find(u => u && (u.email === email || u.emailAddress === email));
    const userId = userRecord ? String(userRecord.id ?? "") : "";

    const objectId = await resolveEntraObjectId(email, userId);
    if (!objectId) {
      res.status(404).json({ error: "Could not resolve your Teams user ID. Make sure your Ethinos Microsoft account email matches your PMT account." });
      return;
    }

    await sendTeamsActivityNotification({
      recipientObjectId: objectId,
      mentionerName: "Flow Pro",
      taskName: "Test Notification",
      clientName: "Ethinos",
      previewText: "✅ Teams activity notifications are working.",
      taskId: undefined,
    });

    logger.info({ email }, "[Teams] Test ping sent successfully");
    res.json({ sent: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[Teams] Test ping failed");
    res.status(500).json({ error: msg });
  }
});

export default router;
