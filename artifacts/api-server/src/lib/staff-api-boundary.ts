import type { Request, Response, NextFunction } from "express";
import { getAdminAuth, getAdminDatabase } from "./firebase-admin";
import { isStaffEmail } from "./client-portal";

/** Existing public callbacks/API-key routes keep their auth. Firebase callers must be staff.
 * Mount AFTER the isolated client router, BEFORE every staff router.
 */
export async function staffApiBoundary(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) { next(); return; }
  // Export accepts its own server API key, not Firebase identity.
  if (req.path === "/export" || req.path.startsWith("/export/")) { next(); return; }
  try {
    const user = await getAdminAuth().verifyIdToken(header.slice(7), true);
    if (!isStaffEmail(user.email)) { res.status(403).json({ error: "Staff access required." }); return; }
    if ((await getAdminDatabase().ref(`clientPortalUsers/${user.uid}`).once("value")).exists()) {
      res.status(403).json({ error: "Staff access required." }); return;
    }
    next();
  } catch { res.status(401).json({ error: "Invalid or expired session." }); }
}
