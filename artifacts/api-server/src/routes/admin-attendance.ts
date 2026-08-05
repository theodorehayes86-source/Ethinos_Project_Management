import { Router, type Request, type Response, type NextFunction } from "express";
import admin from "firebase-admin";
import { readFirebasePath } from "../lib/firebase-admin";
import { syncAttendanceToday } from "../lib/keka-client";
import { logger } from "../lib/logger";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

const router = Router();

// ── Per-admin in-memory rate limit (5 min cooldown) ──────────────────────────
const RATE_LIMIT_MS = 5 * 60 * 1000;
const lastCallByAdmin = new Map<string, number>();

// Extend request to carry the resolved admin identifier
interface AuthedRequest extends Request {
  adminEmail?: string;
}

async function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Internal API key bypass (scripts / scheduler tests)
  const internalKey = process.env.PMT_EXPORT_API_KEY;
  if (internalKey && req.headers["x-api-key"] === internalKey) {
    req.adminEmail = "internal";
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const idToken = authHeader.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const firebaseUser = await admin.auth().getUser(decoded.uid);
    const email = firebaseUser.email?.toLowerCase();

    const usersRaw = await readFirebasePath<unknown>("users");
    const users = usersRaw
      ? (
          Array.isArray(usersRaw)
            ? (usersRaw as Array<{ email?: string; role?: string }>)
            : Object.values(
                usersRaw as Record<string, { email?: string; role?: string }>
              )
        ).filter(Boolean)
      : [];

    const matched = users.find((u) => u.email?.toLowerCase() === email);
    if (
      !matched ||
      !["Super Admin", "Admin", "Director"].includes(matched.role ?? "")
    ) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    req.adminEmail = email ?? decoded.uid;
    next();
  } catch (err) {
    logger.warn({ err }, "[AdminAttendance] Auth verification failed");
    res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

/**
 * POST /admin/attendance/sync-now
 *
 * Manually triggers an attendance sync for today (same logic as the nightly
 * scheduler and the run-attendance-sync-now.mjs script).
 *
 * Rate-limited to 1 call per 5 minutes per admin to protect the Keka API.
 */
router.post(
  "/admin/attendance/sync-now",
  requireAdmin,
  async (req: AuthedRequest, res: Response) => {
    const adminKey = req.adminEmail ?? "unknown";

    // Enforce rate limit
    const lastCall = lastCallByAdmin.get(adminKey);
    const now = Date.now();
    if (lastCall !== undefined && now - lastCall < RATE_LIMIT_MS) {
      const retryAfterSec = Math.ceil((RATE_LIMIT_MS - (now - lastCall)) / 1000);
      res.status(429).json({
        error: `Rate limited — please wait ${retryAfterSec}s before trying again.`,
        retryAfterSec,
      });
      return;
    }
    lastCallByAdmin.set(adminKey, now);

    logger.info({ admin: adminKey }, "[AdminAttendance] Manual sync triggered");

    try {
      // Resolve timezone from the same setting the scheduler uses so the
      // date key written to Firebase matches the daily scheduled runs.
      const schedRaw = await readFirebasePath<{
        scheduleTimezone?: string;
      }>("settings/notifications/reminders-schedule").catch(() => null);
      const tz =
        (schedRaw as { scheduleTimezone?: string } | null)
          ?.scheduleTimezone ?? "Asia/Kolkata";
      const today = format(toZonedTime(new Date(), tz), "yyyy-MM-dd");

      const result = await syncAttendanceToday(tz, today);
      res.json(result);
    } catch (err) {
      logger.error({ err }, "[AdminAttendance] Manual sync failed");
      res
        .status(500)
        .json({ error: "Attendance sync failed", details: String(err) });
    }
  }
);

export default router;
