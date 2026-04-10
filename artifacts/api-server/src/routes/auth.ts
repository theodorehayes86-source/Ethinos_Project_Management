import { Router, Request, Response, NextFunction, type IRouter } from "express";
import admin from "firebase-admin";
import { sendEmail, isEmailConfigured } from "../lib/microsoft-graph";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter for the public /reset-password endpoint.
// Limits: max 3 requests per email per hour, max 10 requests per IP per hour.
// ---------------------------------------------------------------------------

const RESET_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RESET_MAX_PER_EMAIL = 3;
const RESET_MAX_PER_IP = 10;

const resetByEmail = new Map<string, { count: number; resetAt: number }>();
const resetByIp = new Map<string, { count: number; resetAt: number }>();

function checkResetRateLimit(email: string, ip: string): { limited: boolean; reason?: string } {
  const now = Date.now();

  const emailEntry = resetByEmail.get(email) ?? { count: 0, resetAt: now + RESET_WINDOW_MS };
  if (emailEntry.resetAt < now) {
    emailEntry.count = 0;
    emailEntry.resetAt = now + RESET_WINDOW_MS;
  }
  emailEntry.count += 1;
  resetByEmail.set(email, emailEntry);
  if (emailEntry.count > RESET_MAX_PER_EMAIL) {
    return { limited: true, reason: "Too many reset requests for this address. Please try again later." };
  }

  const ipEntry = resetByIp.get(ip) ?? { count: 0, resetAt: now + RESET_WINDOW_MS };
  if (ipEntry.resetAt < now) {
    ipEntry.count = 0;
    ipEntry.resetAt = now + RESET_WINDOW_MS;
  }
  ipEntry.count += 1;
  resetByIp.set(ip, ipEntry);
  if (ipEntry.count > RESET_MAX_PER_IP) {
    return { limited: true, reason: "Too many requests from your network. Please try again later." };
  }

  return { limited: false };
}

// ---------------------------------------------------------------------------
// Firebase Admin initialisation (lazy, idempotent)
// ---------------------------------------------------------------------------

type FirebaseAdminServices = {
  auth: admin.auth.Auth;
  db: admin.database.Database;
};

function getFirebaseAdmin(): FirebaseAdminServices {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL;

  if (!databaseURL) throw new Error("VITE_FIREBASE_DATABASE_URL is not set");
  if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");

  if (admin.apps.length === 0) {
    let serviceAccount: admin.ServiceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    });
  }

  return { auth: admin.auth(), db: admin.database() };
}

// ---------------------------------------------------------------------------
// Role constants — roles allowed to create users and trigger admin resets
// ---------------------------------------------------------------------------

const ADMIN_ROLES = new Set(["Super Admin", "Admin"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
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
    const { auth, db } = getFirebaseAdmin();
    const decoded = await auth.verifyIdToken(idToken);

    const callerEmail = (decoded.email || "").toLowerCase();
    if (!callerEmail.endsWith("@ethinos.com")) {
      logger.warn({ callerEmail }, "Rejected — not an @ethinos.com account");
      res.status(403).json({ error: "Only Ethinos staff can perform this action" });
      return;
    }

    // Verify the caller's PMT role from the trusted database (not from client claims)
    const role = await getPmtRole(db, callerEmail);
    if (!role || !ADMIN_ROLES.has(role)) {
      logger.warn({ callerEmail, role }, "Rejected — insufficient PMT role");
      res.status(403).json({ error: "Admin role required to perform this action" });
      return;
    }

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
// auto-generates a temporary password, and sends a welcome email.
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

    const { auth } = getFirebaseAdmin();
    const tempPassword = generatePassword();

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await auth.createUser({
        email: normalizedEmail,
        password: tempPassword,
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

    let emailWarning: string | undefined;

    if (isEmailConfigured()) {
      try {
        const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi,";
        await sendEmail({
          to: normalizedEmail,
          subject: "Welcome to Ethinos PMT – Your Login Details",
          bodyHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px 24px; border-radius: 12px;">
              <div style="background: white; border-radius: 10px; padding: 32px; border: 1px solid #e2e8f0;">
                <h2 style="color: #1e293b; margin: 0 0 8px;">${greeting}</h2>
                <p style="color: #475569; margin: 0 0 24px;">Your Ethinos Project Management Tool account has been created by an administrator.</p>
                <div style="background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
                  <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Your login details</p>
                  <p style="margin: 0 0 6px; color: #1e293b;"><strong>Email:</strong> ${normalizedEmail}</p>
                  <p style="margin: 0; color: #1e293b;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 15px;">${tempPassword}</code></p>
                </div>
                <p style="color: #475569; margin: 0 0 16px;">Please sign in and change your password as soon as possible.</p>
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">If you did not expect this email, please contact your IT administrator.</p>
              </div>
            </div>
          `,
        });
        logger.info({ email: normalizedEmail }, "Welcome email sent to new user");
      } catch (emailErr) {
        logger.error({ err: emailErr, email: normalizedEmail }, "Failed to send welcome email — user still created");
        emailWarning = "User created, but the welcome email could not be sent. Please share the login credentials with the user manually.";
      }
    } else {
      logger.warn({ email: normalizedEmail }, "Microsoft Graph not configured — skipping welcome email");
      emailWarning = "User created, but email is not configured. Please share the login credentials with the user manually.";
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
    const rateCheck = checkResetRateLimit(normalizedEmail, clientIp);
    if (rateCheck.limited) {
      res.status(429).json({ error: rateCheck.reason });
      return;
    }

    const { auth } = getFirebaseAdmin();

    let resetLink: string;
    try {
      resetLink = await auth.generatePasswordResetLink(normalizedEmail);
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === "auth/user-not-found") {
        // Return a uniform success response to prevent account enumeration.
        // The user will simply not receive an email.
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

    // Exchange the authorization code for tokens — server-to-server, no CORS issues.
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

    // Validate the access token and get the user's profile from Microsoft Graph.
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

    const { auth } = getFirebaseAdmin();

    let uid: string;
    try {
      const existingUser = await auth.getUserByEmail(verifiedEmail);
      uid = existingUser.uid;
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === "auth/user-not-found") {
        // Auto-provision a new Firebase account for first-time MS SSO users.
        // Also generate and email a temporary password so they can log into
        // the Electron widget (which only supports email/password login).
        const tempPassword = generatePassword();
        const newUser = await auth.createUser({
          email: verifiedEmail,
          emailVerified: true,
          displayName,
          password: tempPassword,
        });
        uid = newUser.uid;
        logger.info({ email: verifiedEmail }, "Auto-provisioned Firebase user for Microsoft SSO login");

        // Send the temp password via email so the user can also use the widget.
        if (isEmailConfigured()) {
          try {
            const firstName = displayName?.split(" ")[0] || "there";
            await sendEmail({
              to: verifiedEmail,
              subject: "Welcome to Ethinos PMT – Your Widget Login Details",
              bodyHtml: `
                <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 32px 24px; border-radius: 12px;">
                  <div style="background: white; border-radius: 10px; padding: 32px; border: 1px solid #e2e8f0;">
                    <h2 style="color: #1e293b; margin: 0 0 8px;">Hi ${firstName},</h2>
                    <p style="color: #475569; margin: 0 0 16px;">You've signed into Ethinos PMT with your Microsoft account. Welcome aboard!</p>
                    <p style="color: #475569; margin: 0 0 16px;">To also use the <strong>Ethinos Timer Pro</strong> desktop widget, you'll need these credentials:</p>
                    <div style="background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
                      <p style="margin: 0 0 6px; color: #1e293b;"><strong>Email:</strong> ${verifiedEmail}</p>
                      <p style="margin: 0; color: #1e293b;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 15px;">${tempPassword}</code></p>
                    </div>
                    <p style="color: #475569; margin: 0 0 16px;">Please change this password after your first widget login. You can continue using Microsoft sign-in for the web app.</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">If you didn't sign into Ethinos PMT, please contact your administrator.</p>
                  </div>
                </div>
              `,
            });
            logger.info({ email: verifiedEmail }, "Widget credentials email sent to new MS SSO user");
          } catch (emailErr) {
            logger.error({ err: emailErr, email: verifiedEmail }, "Failed to send widget credentials email — user still created");
          }
        }
      } else {
        throw err;
      }
    }

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

    const { auth } = getFirebaseAdmin();

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

    const customToken = await auth.createCustomToken(uid, { provider: "microsoft" });

    logger.info({ email: verifiedEmail }, "Microsoft token exchange successful");
    res.json({ customToken });
  } catch (err) {
    logger.error({ err }, "POST /auth/ms-token-exchange error");
    res.status(500).json({ error: "Failed to exchange Microsoft token" });
  }
});

export default router;
