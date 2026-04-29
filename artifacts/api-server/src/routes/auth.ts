import { Router, Request, Response, NextFunction, type IRouter } from "express";
import type admin from "firebase-admin";
import { getAdminAuth, getAdminDatabase } from "../lib/firebase-admin";
import { sendEmail, isEmailConfigured } from "../lib/microsoft-graph";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Firebase-backed rate limiter for the public /reset-password endpoint.
// Limits: max 3 requests per email per hour, max 10 requests per IP per hour.
// Counters are stored under rateLimits/{key} so they survive restarts and
// work across multiple instances.
// ---------------------------------------------------------------------------

const RESET_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RESET_MAX_PER_EMAIL = 3;
const RESET_MAX_PER_IP = 10;

interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

async function checkFirebaseRateLimit(
  key: string,
  max: number,
): Promise<{ limited: boolean }> {
  const db = getAdminDatabase();
  const ref = db.ref(`rateLimits/${key}`);
  const now = Date.now();
  let limited = false;

  await ref.transaction((current: RateLimitEntry | null) => {
    if (!current || current.expiresAt < now) {
      return { count: 1, expiresAt: now + RESET_WINDOW_MS };
    }
    const nextCount = current.count + 1;
    if (nextCount > max) {
      limited = true;
      return current;
    }
    return { count: nextCount, expiresAt: current.expiresAt };
  });

  return { limited };
}

async function checkResetRateLimit(
  email: string,
  ip: string,
): Promise<{ limited: boolean; reason?: string }> {
  const emailKey = `email_${Buffer.from(email).toString("base64url")}`;
  const ipKey = `ip_${Buffer.from(ip).toString("base64url")}`;

  const emailCheck = await checkFirebaseRateLimit(emailKey, RESET_MAX_PER_EMAIL);
  if (emailCheck.limited) {
    return { limited: true, reason: "Too many reset requests for this address. Please try again later." };
  }

  const ipCheck = await checkFirebaseRateLimit(ipKey, RESET_MAX_PER_IP);
  if (ipCheck.limited) {
    return { limited: true, reason: "Too many requests from your network. Please try again later." };
  }

  return { limited: false };
}

// ---------------------------------------------------------------------------
// Role constants — roles allowed to create users and trigger admin resets
// ---------------------------------------------------------------------------

const ADMIN_ROLES = new Set(["Super Admin", "Admin"]);

// ---------------------------------------------------------------------------
// Download links — read from Firebase /config/downloads with fallbacks.
// Admins can update these values in the database when a new version ships.
// ---------------------------------------------------------------------------

interface DownloadLinks {
  widgetVersion: string;
  winUrl: string;
  macUrl: string;
  mobileUrl: string;
}

const DEFAULT_DOWNLOADS: DownloadLinks = {
  widgetVersion: "1.0.22",
  winUrl: "https://github.com/theodorehayes86-source/Ethinos_Project_Management/releases/latest",
  macUrl: "https://github.com/theodorehayes86-source/Ethinos_Project_Management/releases/latest",
  mobileUrl: "https://pmt.ethinos.com/pmt-mobile/",
};

async function getDownloadLinks(db: admin.database.Database): Promise<DownloadLinks> {
  try {
    const snap = await db.ref("config/downloads").once("value");
    if (snap.exists()) {
      const val = snap.val() as Partial<DownloadLinks>;
      return { ...DEFAULT_DOWNLOADS, ...val };
    }
    await db.ref("config/downloads").set(DEFAULT_DOWNLOADS);
  } catch (err) {
    logger.warn({ err }, "[Auth] Could not read /config/downloads — using defaults");
  }
  return DEFAULT_DOWNLOADS;
}

// ---------------------------------------------------------------------------
// Welcome email HTML builder — used for both MS SSO first-login and
// admin-created accounts.
// ---------------------------------------------------------------------------

function buildWelcomeEmail(d: {
  firstName: string;
  email: string;
  resetLink: string;
  links: DownloadLinks;
  isAdminCreated?: boolean;
}): string {
  const intro = d.isAdminCreated
    ? `Your Ethinos PMT account has been created by an administrator. Click the button below to set your password and sign in.`
    : `You've signed into Ethinos PMT with your Microsoft account. Welcome aboard! Use the link below to set a password so you can also log into the <strong>Ethinos Timer Pro</strong> desktop widget and the mobile companion app.`;

  const downloadSection = `
    <div style="margin-top:28px;">
      <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.06em;">Download the apps</p>
      <p style="margin:0 0 12px;font-size:13px;color:#64748b;">Timer Pro widget v${d.links.widgetVersion}</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="padding-right:10px;">
            <a href="${d.links.winUrl}" style="display:inline-block;background:#0078d4;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:7px;">
              ⬇ Windows (.exe)
            </a>
          </td>
          <td>
            <a href="${d.links.macUrl}" style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:7px;">
              ⬇ macOS (.dmg)
            </a>
          </td>
        </tr>
      </table>
      <a href="${d.links.mobileUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:7px;">
        📱 Open Mobile App
      </a>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e3a8a,#312e81);padding:28px 32px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.65);">Ethinos PMT</p>
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Welcome, ${d.firstName}!</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">${intro}</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:8px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Your Login Details</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#64748b;width:120px;">Email</td>
            <td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:600;">${d.email}</td>
          </tr>
        </table>
      </div>

      <div style="margin:20px 0;">
        <a href="${d.resetLink}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:8px;">Set My Password</a>
      </div>
      <p style="margin:0 0 24px;font-size:12px;color:#94a3b8;">This link expires in 24 hours. If it has expired, use the "Forgot Password" option on the sign-in page.</p>

      ${downloadSection}

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f1f5f9;">
        <a href="https://pmt.ethinos.com" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Open PMT Web App</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated notification from the Ethinos PMT. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Look up a user's PMT role from the Firebase Realtime Database by email.
 * Returns null if no matching record is found.
 */
async function getPmtRole(db: admin.database.Database, email: string): Promise<string | null> {
  const snapshot = await db.ref("users").orderByChild("email").equalTo(email).limitToFirst(1).once("value");
  if (!snapshot.exists()) return null;
  let role: string | null = null;
  snapshot.forEach((child) => {
    role = (child.val() as { role?: string }).role ?? null;
  });
  return role;
}

/**
 * Write the user's role into the userRoles/{uid} path so that Firebase RTDB
 * security rules can reference it via root.child('userRoles').child(auth.uid).
 * This is a fire-and-forget write — any error is logged but does not block the
 * calling request.
 */
async function syncUserRole(uid: string, role: string | null): Promise<void> {
  try {
    const db = getAdminDatabase();
    if (role) {
      await db.ref(`userRoles/${uid}`).set(role);
    } else {
      await db.ref(`userRoles/${uid}`).remove();
    }
  } catch (err) {
    logger.warn({ err, uid }, "[Auth] Failed to sync userRoles — DB rules may not reflect current role until next sync");
  }
}

// ---------------------------------------------------------------------------
// Middleware: verify Firebase Bearer token + look up PMT admin role
// ---------------------------------------------------------------------------

type AuthenticatedRequest = Request & {
  firebaseUser: admin.auth.DecodedIdToken;
};

async function requireAdminRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    res.status(401).json({ error: "Empty Bearer token" });
    return;
  }

  try {
    const auth = getAdminAuth();
    const db = getAdminDatabase();
    const decoded = await auth.verifyIdToken(idToken);

    const callerEmail = (decoded.email || "").toLowerCase();
    if (!callerEmail.endsWith("@ethinos.com")) {
      logger.warn({ callerEmail }, "Rejected — not an @ethinos.com account");
      res.status(403).json({ error: "Only Ethinos staff can perform this action" });
      return;
    }

    const role = await getPmtRole(db, callerEmail);
    if (!role || !ADMIN_ROLES.has(role)) {
      logger.warn({ callerEmail, role }, "Rejected — insufficient PMT role");
      res.status(403).json({ error: "Admin role required to perform this action" });
      return;
    }

    // Keep userRoles/{uid} fresh so RTDB security rules reflect the current role.
    void syncUserRole(decoded.uid, role);

    (req as AuthenticatedRequest).firebaseUser = decoded;
    next();
  } catch (err: unknown) {
    const e = err as Error;
    logger.warn({ err: e.message }, "Firebase ID token verification failed");
    res.status(401).json({ error: "Invalid or expired Firebase ID token" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/create-user
//
// Protected — caller must be a Firebase-authenticated PMT admin (Super Admin
// or Admin role, verified from the database).
// Creates a Firebase account for the target email (must be @ethinos.com),
// generates a password-reset link, and sends a welcome email.
// ---------------------------------------------------------------------------

router.post("/create-user", requireAdminRole, async (req, res) => {
  try {
    const { email, name } = req.body as { email?: string; name?: string };

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.endsWith("@ethinos.com")) {
      res.status(400).json({ error: "Only @ethinos.com accounts may be created" });
      return;
    }

    const auth = getAdminAuth();

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await auth.createUser({
        email: normalizedEmail,
        displayName: name?.trim() || undefined,
        emailVerified: false,
      });
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === "auth/email-already-exists") {
        res.status(409).json({ error: "auth/email-already-in-use" });
        return;
      }
      throw err;
    }

    let resetLink: string;
    try {
      resetLink = await auth.generatePasswordResetLink(normalizedEmail);
    } catch (err) {
      logger.error({ err, email: normalizedEmail }, "Failed to generate password reset link — user still created");
      res.json({
        uid: userRecord.uid,
        email: userRecord.email,
        warning: "User created, but a password setup link could not be generated. The user can use 'Forgot Password' to set their password.",
      });
      return;
    }

    let emailWarning: string | undefined;

    if (isEmailConfigured()) {
      try {
        const firstName = name?.trim().split(" ")[0] || "there";
        const db = getAdminDatabase();
        const links = await getDownloadLinks(db);
        await sendEmail({
          to: normalizedEmail,
          subject: "Welcome to Ethinos PMT – Set Your Password & Download the Apps",
          bodyHtml: buildWelcomeEmail({
            firstName,
            email: normalizedEmail,
            resetLink,
            links,
            isAdminCreated: true,
          }),
        });
        logger.info({ email: normalizedEmail }, "Welcome email sent to new user");
      } catch (emailErr) {
        logger.error({ err: emailErr, email: normalizedEmail }, "Failed to send welcome email — user still created");
        emailWarning = "User created, but the welcome email could not be sent. Please share the login details with the user manually.";
      }
    } else {
      logger.warn({ email: normalizedEmail }, "Microsoft Graph not configured — skipping welcome email");
      emailWarning = "User created, but email is not configured. Please share the login details with the user manually.";
    }

    res.json({
      uid: userRecord.uid,
      email: userRecord.email,
      ...(emailWarning ? { warning: emailWarning } : {}),
    });
  } catch (err) {
    logger.error({ err }, "POST /auth/create-user error");
    res.status(500).json({ error: "Failed to create user" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
//
// Public endpoint (no session required) — used for self-service "Forgot
// Password" from the login screen. Generates a Firebase password-reset link
// and delivers it via Microsoft Graph. Only @ethinos.com addresses accepted.
// ---------------------------------------------------------------------------

router.post("/reset-password", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.endsWith("@ethinos.com")) {
      res.status(400).json({ error: "Password reset is only available for Ethinos work accounts" });
      return;
    }

    const clientIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? "unknown";

    let rateCheck: { limited: boolean; reason?: string };
    try {
      rateCheck = await checkResetRateLimit(normalizedEmail, clientIp);
    } catch (err) {
      logger.error({ err }, "Rate limit check failed — failing closed to protect the endpoint");
      res.status(503).json({ error: "Password reset is temporarily unavailable. Please try again shortly." });
      return;
    }

    if (rateCheck.limited) {
      res.status(429).json({ error: rateCheck.reason });
      return;
    }

    const auth = getAdminAuth();

    let resetLink: string;
    try {
      resetLink = await auth.generatePasswordResetLink(normalizedEmail);
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === "auth/user-not-found") {
        logger.info({ email: normalizedEmail }, "Password reset requested for unknown email — silent no-op");
        res.json({ ok: true });
        return;
      }
      throw err;
    }

    if (!isEmailConfigured()) {
      logger.warn({ email: normalizedEmail }, "Microsoft Graph not configured — cannot email password reset link");
      res.status(503).json({ error: "Email service not configured. Contact your administrator." });
      return;
    }

    await sendEmail({
      to: normalizedEmail,
      subject: "Ethinos PMT – Password Reset Link",
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px 24px; border-radius: 12px;">
          <div style="background: white; border-radius: 10px; padding: 32px; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e293b; margin: 0 0 8px;">Reset your password</h2>
            <p style="color: #475569; margin: 0 0 24px;">We received a request to reset the password for your Ethinos PMT account (<strong>${normalizedEmail}</strong>).</p>
            <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #ef4444, #6366f1); color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin-bottom: 24px;">Reset Password</a>
            <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="color: #6366f1; font-size: 12px; word-break: break-all; margin: 0 0 24px;">${resetLink}</p>
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        </div>
      `,
    });

    logger.info({ email: normalizedEmail }, "Password reset email sent");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /auth/reset-password error");
    res.status(500).json({ error: "Failed to send password reset email" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/ms-code-exchange
//
// Public — called by the browser after Azure redirects back with ?code=.
// The browser cannot call Azure's token endpoint directly when the redirect
// URI is registered as a Web-type platform in Azure (AADSTS9002326 error).
// This endpoint performs the exchange server-to-server using AZURE_CLIENT_SECRET,
// then validates the resulting access token via Microsoft Graph, and returns a
// Firebase custom token.
// ---------------------------------------------------------------------------

router.post("/ms-code-exchange", async (req, res) => {
  try {
    const { code, verifier, redirectUri } = req.body as {
      code?: string;
      verifier?: string;
      redirectUri?: string;
    };

    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "code is required" });
      return;
    }
    if (!verifier || typeof verifier !== "string") {
      res.status(400).json({ error: "verifier is required" });
      return;
    }
    if (!redirectUri || typeof redirectUri !== "string") {
      res.status(400).json({ error: "redirectUri is required" });
      return;
    }

    const clientId     = process.env.VITE_AZURE_CLIENT_ID;
    const tenantId     = process.env.VITE_AZURE_TENANT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!clientId || !tenantId || !clientSecret) {
      logger.error("Azure credentials not configured on server");
      res.status(500).json({ error: "Microsoft login is not configured on this server" });
      return;
    }

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:     "authorization_code",
          client_id:      clientId,
          client_secret:  clientSecret,
          code,
          redirect_uri:   redirectUri,
          code_verifier:  verifier,
        }),
      },
    );

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      logger.warn({ azureError: tokenData.error, desc: tokenData.error_description }, "Azure token exchange failed");
      res.status(401).json({ error: tokenData.error_description || tokenData.error || "Azure token exchange failed" });
      return;
    }

    const graphResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!graphResp.ok) {
      const body = await graphResp.text();
      logger.warn({ status: graphResp.status, body }, "Microsoft Graph /me rejected access token");
      res.status(401).json({ error: "Invalid or expired Microsoft token" });
      return;
    }

    const graphUser = (await graphResp.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };

    const verifiedEmail = (graphUser.mail || graphUser.userPrincipalName || "").trim().toLowerCase();
    const displayName   = graphUser.displayName?.trim() || undefined;

    if (!verifiedEmail || !verifiedEmail.endsWith("@ethinos.com")) {
      res.status(403).json({ error: "Only @ethinos.com accounts are allowed" });
      return;
    }

    const auth = getAdminAuth();
    const db = getAdminDatabase();

    let uid: string;
    try {
      const existingUser = await auth.getUserByEmail(verifiedEmail);
      uid = existingUser.uid;
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === "auth/user-not-found") {
        const newUser = await auth.createUser({
          email: verifiedEmail,
          emailVerified: true,
          displayName,
        });
        uid = newUser.uid;
        logger.info({ email: verifiedEmail }, "Auto-provisioned Firebase user for Microsoft SSO login");

        if (isEmailConfigured()) {
          try {
            const resetLink = await auth.generatePasswordResetLink(verifiedEmail);
            const firstName = displayName?.split(" ")[0] || "there";
            const links = await getDownloadLinks(db);
            await sendEmail({
              to: verifiedEmail,
              subject: "Welcome to Ethinos PMT – Set Your Password & Download the Apps",
              bodyHtml: buildWelcomeEmail({
                firstName,
                email: verifiedEmail,
                resetLink,
                links,
                isAdminCreated: false,
              }),
            });
            logger.info({ email: verifiedEmail }, "Welcome email sent to new MS SSO user");
          } catch (emailErr) {
            logger.error({ err: emailErr, email: verifiedEmail }, "Failed to send welcome email — user still created");
          }
        }
      } else {
        throw err;
      }
    }

    // Sync the user's PMT role to userRoles/{uid} so RTDB rules can enforce it.
    const role = await getPmtRole(db, verifiedEmail);
    void syncUserRole(uid, role);

    const customToken = await auth.createCustomToken(uid, { provider: "microsoft" });

    logger.info({ email: verifiedEmail }, "Microsoft code exchange successful");
    res.json({ customToken });
  } catch (err) {
    logger.error({ err }, "POST /auth/ms-code-exchange error");
    res.status(500).json({ error: "Failed to exchange Microsoft authorisation code" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/ms-token-exchange  (legacy — kept for backward compatibility)
//
// Validates a Microsoft access token via Graph /me and returns a Firebase
// custom token. New login flow uses /ms-code-exchange instead.
// ---------------------------------------------------------------------------

router.post("/ms-token-exchange", async (req, res) => {
  try {
    const { msAccessToken } = req.body as { msAccessToken?: string };

    if (!msAccessToken || typeof msAccessToken !== "string") {
      res.status(400).json({ error: "msAccessToken is required" });
      return;
    }

    const graphResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${msAccessToken}` },
    });

    if (!graphResp.ok) {
      const body = await graphResp.text();
      logger.warn({ status: graphResp.status, body }, "Microsoft Graph /me rejected access token");
      res.status(401).json({ error: "Invalid or expired Microsoft token" });
      return;
    }

    const graphUser = (await graphResp.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };

    const verifiedEmail = (graphUser.mail || graphUser.userPrincipalName || "").trim().toLowerCase();
    const displayName   = graphUser.displayName?.trim() || undefined;

    if (!verifiedEmail || !verifiedEmail.endsWith("@ethinos.com")) {
      res.status(403).json({ error: "Only @ethinos.com accounts are allowed" });
      return;
    }

    const auth = getAdminAuth();
    const db = getAdminDatabase();

    let uid: string;
    try {
      const existingUser = await auth.getUserByEmail(verifiedEmail);
      uid = existingUser.uid;
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === "auth/user-not-found") {
        const newUser = await auth.createUser({
          email: verifiedEmail,
          emailVerified: true,
          displayName,
        });
        uid = newUser.uid;
        logger.info({ email: verifiedEmail }, "Auto-provisioned Firebase user for Microsoft login");
      } else {
        throw err;
      }
    }

    // Sync the user's PMT role to userRoles/{uid} so RTDB rules can enforce it.
    const role = await getPmtRole(db, verifiedEmail);
    void syncUserRole(uid, role);

    const customToken = await auth.createCustomToken(uid, { provider: "microsoft" });

    logger.info({ email: verifiedEmail }, "Microsoft token exchange successful");
    res.json({ customToken });
  } catch (err) {
    logger.error({ err }, "POST /auth/ms-token-exchange error");
    res.status(500).json({ error: "Failed to exchange Microsoft token" });
  }
});

export default router;
