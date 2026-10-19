import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { format } from "date-fns";
import {
  CreateClientPortalTaskBody,
  UpdateClientPortalTaskBody, UpdateClientPortalTaskParams, UpdateClientPortalTaskResponse,
  GetClientPortalMeResponse, ListClientPortalTasksResponse, ListClientPortalTasksParams,
  InviteClientPortalUserBody, ListClientPortalUsersResponse,
  UpdateClientPortalUserBody, UpdateClientPortalUserParams, UpdateClientPortalUserResponse,
  DeleteClientPortalUserResponse,
} from "@workspace/api-zod";
import { getAdminAuth, getAdminDatabase } from "../lib/firebase-admin";
import { createHash } from "node:crypto";
import { acceptInvitation, assertClientIdentity, inspectInvitation, InvitationError, issueInvitation, revokeInvitation } from "../lib/client-invitations";
import { logger } from "../lib/logger";
import { clientDirectory, clientTaskStatusEditReason, isStaffEmail, membershipAllows, normalizeDueDate, normalizeMembership, projectClientTask, safeKey, type PortalMembership } from "../lib/client-portal";
import { deleteClientAccount } from "../lib/client-account-deletion";
import clientTaskCollaborationRouter from "./client-task-collaboration";

const router: IRouter = Router();
type PortalRequest = Request & { portalIdentity: DecodedIdToken };
const identity = (req: Request) => (req as PortalRequest).portalIdentity;
const database = () => getAdminDatabase();
const membershipRef = (uid: string) => database().ref(`clientPortalUsers/${uid}`);

router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
// Public mailbox-token endpoints intentionally precede the session middleware.
for (const action of ["inspect", "accept"] as const) router.post(`/invitations/${action}`, async (req, res): Promise<void> => {
  const ipHash = createHash("sha256").update(req.ip ?? "unknown").digest("hex");
  if (!await rateLimit(`public_${action}_${ipHash}`, 30, 60_000)) {
    res.status(429).json({ error: "Too many invitation requests. Try again in a minute." }); return;
  }
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
      Object.keys(req.body).some(k => !(action === "inspect" ? ["token"] : ["token", "displayName", "password"]).includes(k))) {
    res.status(400).json({ error: "Invalid invitation request." }); return;
  }
  let user: DecodedIdToken | undefined;
  if (action === "accept" && req.headers.authorization) {
    try {
      if (!req.headers.authorization.startsWith("Bearer ")) throw new Error("Invalid session");
      user = await getAdminAuth().verifyIdToken(req.headers.authorization.slice(7), true);
    } catch { res.status(401).json({ error: "Sign in again to accept your invitation." }); return; }
  }
  res.json(action === "inspect" ? await inspectInvitation(req.body.token) : await acceptInvitation(req.body, user));
});
router.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization;
  if (!token?.startsWith("Bearer ")) { res.status(401).json({ error: "Sign in to continue." }); return; }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token.slice(7), true);
    if (!decoded.email || !safeKey(decoded.uid)) { res.status(403).json({ error: "Access denied." }); return; }
    (req as PortalRequest).portalIdentity = decoded;
    next();
  } catch { res.status(401).json({ error: "Your session has expired. Sign in again." }); }
});

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = identity(req);
  if (!isStaffEmail(user.email)) { res.status(403).json({ error: "Administrator access required." }); return; }
  if ((await membershipRef(user.uid).once("value")).exists()) {
    res.status(403).json({ error: "Administrator access required." }); return;
  }
  const users = (await database().ref("users").orderByChild("email").equalTo(user.email!.toLowerCase()).once("value")).val();
  const allowed = Object.values(users ?? {}).some((value) => {
    const staff = value as Record<string, unknown>;
    return ["Admin", "Super Admin"].includes(String(staff.role)) && staff.disabled !== true && staff.active !== false;
  });
  if (!allowed) { res.status(403).json({ error: "Administrator access required." }); return; }
  next();
}
router.use("/admin", requireAdmin);
router.use("/clients/:clientId/tasks/:taskId/collaboration", clientTaskCollaborationRouter);

async function getMembership(req: Request, res: Response, clientId?: string): Promise<PortalMembership | null> {
  const user = identity(req);
  if (isStaffEmail(user.email) || user.email_verified !== true) {
    res.status(403).json({ error: "A verified invited client email is required." }); return null;
  }
  const membership = normalizeMembership((await membershipRef(user.uid).once("value")).val());
  if (!membershipAllows(membership, user.email!, clientId)) {
    res.status(403).json({ error: "Client access is not available. Contact your account team." }); return null;
  }
  return membership;
}

async function directory() { return clientDirectory((await database().ref("clients").once("value")).val()); }
async function validClients(ids: string[]) {
  const available = new Set((await directory()).map(c => c.id));
  return ids.every(id => available.has(id));
}

async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const result = await database().ref(`rateLimits/clientPortal_${key}`).transaction(current => {
    if (!current || current.expiresAt <= now) return { count: 1, expiresAt: now + windowMs };
    if (current.count >= max) return;
    return { ...current, count: current.count + 1 };
  });
  return result.committed;
}

router.get("/me", async (req, res): Promise<void> => {
  const membership = await getMembership(req, res);
  if (!membership) return;
  res.json(GetClientPortalMeResponse.parse({ clients: (await directory()).filter(c => membership.clientIds.includes(c.id)) }));
});

router.get("/clients/:clientId/tasks", async (req, res): Promise<void> => {
  const params = ListClientPortalTasksParams.safeParse(req.params);
  if (!params.success || !safeKey(params.data.clientId)) { res.status(400).json({ error: "Invalid client." }); return; }
  const { clientId } = params.data;
  if (!await getMembership(req, res, clientId)) return;
  if (!await validClients([clientId])) { res.status(403).json({ error: "Client access is not available." }); return; }
  const raw = (await database().ref(`clientLogs/${clientId}`).once("value")).val();
  const tasks = Object.entries(raw ?? {}).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") return [];
    const task = projectClientTask(key, value as Record<string, unknown>, clientId);
    return task ? [task] : [];
  });
  // Recheck after loading to avoid serving a read that raced a membership revocation.
  if (!await getMembership(req, res, clientId)) return;
  res.json(ListClientPortalTasksResponse.parse({ tasks }));
});

router.post("/clients/:clientId/tasks", async (req, res): Promise<void> => {
  const params = ListClientPortalTasksParams.safeParse(req.params);
  const body = CreateClientPortalTaskBody.strict().safeParse(req.body);
  if (!params.success || !safeKey(params.data.clientId) || !body.success || !body.data.title.trim() ||
      (body.data.dueDate && normalizeDueDate(body.data.dueDate) !== body.data.dueDate)) {
    res.status(400).json({ error: "Provide a task title, description, optional category (up to 100 characters) and optional valid due date only." }); return;
  }
  const { clientId } = params.data;
  if (!await getMembership(req, res, clientId)) return;
  if (!await validClients([clientId])) { res.status(403).json({ error: "Client access is not available." }); return; }
  if (!await rateLimit(`task_${identity(req).uid}`, 30, 60_000)) {
    res.status(429).json({ error: "Too many tasks submitted. Try again in a minute." }); return;
  }
  const ref = database().ref(`clientLogs/${clientId}`).push();
  const task = {
    id: ref.key!, name: body.data.title.trim(), clientDescription: body.data.description.trim(),
    category: body.data.category?.trim() ?? "",
    comment: "", visibility: "client", status: "Pending", taskType: "task",
    date: format(new Date(), "do MMM yyyy"),
    dueDate: body.data.dueDate ? format(new Date(`${body.data.dueDate}T12:00:00`), "do MMM yyyy") : null,
    creatorId: identity(req).uid, creatorRole: "Client", creatorName: "Client",
    source: "client-portal", clientId, assigneeId: null, assigneeName: "Unassigned",
    repeatFrequency: "Once", timerState: "idle", elapsedMs: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  if (!await getMembership(req, res, clientId)) return;
  await ref.update(task);
  const projected = ListClientPortalTasksResponse.shape.tasks.element.parse(projectClientTask(ref.key!, task));
  res.status(201).json({ task: projected });
});

router.patch("/clients/:clientId/tasks/:taskId", async (req, res): Promise<void> => {
  const params = UpdateClientPortalTaskParams.safeParse(req.params);
  const body = UpdateClientPortalTaskBody.strict().safeParse(req.body);
  if (!params.success || !safeKey(params.data.clientId) || !safeKey(params.data.taskId) || !body.success) {
    res.status(400).json({ error: "Provide a valid task and only status: Pending, In Progress or Completed." }); return;
  }
  const { clientId, taskId } = params.data;
  if (!await getMembership(req, res, clientId)) return;
  if (!await validClients([clientId])) { res.status(403).json({ error: "Client access is not available." }); return; }
  // Use the stable storage key, never a task's mutable id or an entire client collection.
  const ref = database().ref(`clientLogs/${clientId}/${taskId}`);
  // Prime Firebase's local transaction cache; an uncached existing task can
  // otherwise appear as null in the first callback. Never write this read back.
  await ref.once("value");
  // Recheck membership immediately before the write, not just at request entry.
  if (!await getMembership(req, res, clientId)) return;
  const status = { Pending: "Pending", "In Progress": "WIP", Completed: "Done" }[body.data.status];
  let blockedReason = "";
  const result = await ref.transaction(current => {
    // Firebase may retry this callback with concurrent staff edits. Always recheck
    // visibility and lifecycle on that current value and preserve every other field.
    blockedReason = "";
    if (!current || typeof current !== "object" ||
        (current.clientId != null && current.clientId !== clientId) || !projectClientTask(taskId, current)) return;
    blockedReason = clientTaskStatusEditReason(current);
    if (blockedReason) return;
    return { ...current, status, updatedAt: Date.now() };
  }, undefined, false);
  if (!result.committed) {
    res.status(blockedReason ? 409 : 404).json({ error: blockedReason || "Shared task not found." }); return;
  }
  // A revoked client must not receive task data if access changed during the write.
  if (!await getMembership(req, res, clientId)) return;
  res.json(UpdateClientPortalTaskResponse.parse({ task: projectClientTask(taskId, result.snapshot.val()) }));
});

router.get("/admin/users", async (_req, res): Promise<void> => {
  const raw = (await database().ref("clientPortalUsers").once("value")).val();
  const users = Object.entries(raw ?? {}).flatMap(([uid, value]) => {
    const membership = normalizeMembership(value);
    if (!membership) return [];
    const { onboardingRequired: _private, ...publicMembership } = membership;
    return [{ uid, ...publicMembership }];
  });
  res.json(ListClientPortalUsersResponse.parse({ users }));
});

async function sendInvitation(uid: string) {
  if (!await rateLimit(`invite_${uid}`, 5, 3_600_000)) throw new Error("Invitation rate limit");
  await issueInvitation(uid);
}

router.post("/admin/users", async (req, res): Promise<void> => {
  const parsed = InviteClientPortalUserBody.strict().safeParse(req.body);
  if (!parsed.success || isStaffEmail(parsed.data.email)) {
    res.status(400).json({ error: "Provide an external client email and assigned clients." }); return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const clientIds = [...new Set(parsed.data.clientIds)];
  if (!await validClients(clientIds)) { res.status(400).json({ error: "Select existing clients only." }); return; }
  const staffDirectory = (await database().ref("users").once("value")).val();
  if (Object.values(staffDirectory ?? {}).some(row =>
    (row as { email?: string })?.email?.toLowerCase() === email)) {
    res.status(409).json({ error: "Staff identities cannot be invited as clients." }); return;
  }
  let user, created = false;
  try { user = await getAdminAuth().getUserByEmail(email); }
  catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    user = await getAdminAuth().createUser({ email, emailVerified: false });
    created = true;
  }
  if (!safeKey(user.uid)) { res.status(400).json({ error: "This account cannot be invited." }); return; }
  const existing = (await membershipRef(user.uid).once("value")).val();
  const staffRole = (await database().ref(`userRoles/${user.uid}`).once("value")).val();
  if (existing || staffRole != null || user.disabled) {
    res.status(409).json({ error: "This account already exists or is unavailable. Manage existing client access instead." }); return;
  }
  await assertClientIdentity(user.uid, email);
  const membership: PortalMembership = { email, clientIds, disabled: false };
  const saved = await membershipRef(user.uid).transaction(current => current ? undefined :
    { ...membership, onboardingRequired: true, invitationIdentityCreated: created,
      invitation: { status: "revoked", expiresAt: Date.now(), requiresSignIn: !created } });
  if (!saved.committed) { res.status(409).json({ error: "This membership already exists." }); return; }
  let invitationSent = false;
  try { await sendInvitation(user.uid); invitationSent = true; }
  catch { logger.warn("Client membership saved but invitation email was not delivered"); }
  res.status(201).json({ ...UpdateClientPortalUserResponse.parse({ user: { uid: user.uid, ...membership } }), invitationSent });
});

router.delete("/admin/users/:uid", async (req, res): Promise<void> => {
  res.json(DeleteClientPortalUserResponse.parse(await deleteClientAccount(req.params.uid)));
});

router.patch("/admin/users/:uid", async (req, res): Promise<void> => {
  const params = UpdateClientPortalUserParams.safeParse(req.params);
  const body = UpdateClientPortalUserBody.strict().safeParse(req.body);
  if (!params.success || !safeKey(params.data.uid) || !body.success) {
    res.status(400).json({ error: "Invalid client access settings." }); return;
  }
  const { uid } = params.data;
  const existing = normalizeMembership((await membershipRef(uid).once("value")).val());
  if (!existing || isStaffEmail(existing.email)) { res.status(404).json({ error: "Client account not found." }); return; }
  if (!await validClients(body.data.clientIds)) { res.status(400).json({ error: "Select existing clients only." }); return; }
  const membership = { email: existing.email, clientIds: [...new Set(body.data.clientIds)], disabled: body.data.disabled };
  // Membership removal is effective immediately, even if Firebase Auth revocation fails.
  const changed = await membershipRef(uid).transaction(current => current && !current.deletionInProgress ? { ...current, ...membership,
    ...(membership.disabled && current.invitation && ["pending", "processing"].includes(current.invitation.status)
      ? { invitation: { ...current.invitation, status: "revoked", claim: null } } : {}) } : undefined);
  if (!changed.committed) { res.status(409).json({ error: "Membership changed. Try again." }); return; }
  if (membership.disabled) await getAdminAuth().revokeRefreshTokens(uid);
  res.json(UpdateClientPortalUserResponse.parse({ user: { uid, ...membership } }));
});

router.post("/admin/users/:uid/invite", async (req, res): Promise<void> => {
  const uid = req.params.uid;
  if (!safeKey(uid)) { res.status(400).json({ error: "Invalid account." }); return; }
  const membership = normalizeMembership((await membershipRef(uid).once("value")).val());
  if (!membership || membership.disabled || isStaffEmail(membership.email)) {
    res.status(404).json({ error: "Active client account not found." }); return;
  }
  try { await sendInvitation(uid); res.json({ invitationSent: true }); }
  catch { res.status(503).json({ error: "Invitation could not be sent. Check email delivery or try again later." }); }
});

router.post("/admin/users/:uid/invite/revoke", async (req, res): Promise<void> => {
  if (!safeKey(req.params.uid)) { res.status(400).json({ error: "Invalid account." }); return; }
  await revokeInvitation(req.params.uid);
  res.json({ revoked: true });
});

router.use((_req, res) => { res.status(403).json({ error: "This action is not available in the client workspace." }); });
router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof InvitationError) { res.status(error.status).json({ error: error.message }); return; }
  logger.error({ errorType: error instanceof Error ? error.name : "Unknown" }, "Client portal request failed");
  res.status(500).json({ error: "The client workspace is temporarily unavailable. Try again later." });
});

export default router;
