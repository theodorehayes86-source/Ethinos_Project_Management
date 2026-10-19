import { Router, type Request } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { createHash } from "node:crypto";
import {
  CreateClientTaskCollaborationEntryBody, CreateClientTaskCollaborationSubtaskBody,
  GetClientTaskCollaborationResponse, UpdateClientTaskCollaborationSubtaskBody,
  UpdateClientTaskCollaborationSubtaskResponse,
} from "@workspace/api-zod";
import { getAdminAuth, getAdminDatabase } from "../lib/firebase-admin";
import { isStaffEmail, membershipAllows, normalizeMembership, projectClientTask, safeKey } from "../lib/client-portal";
import { ids, permissions, values, type RecordData } from "../lib/creative-studio";

const router = Router({ mergeParams: true });
const db = () => getAdminDatabase();
const read = async (path: string) => (await db().ref(path).once("value")).val();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const MAX_ENTRIES = 200;
const MAX_SUBTASKS = 100;
class CollaborationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function fail(status: number, message: string): never { throw new CollaborationError(status, message); }
const root = (req: Request) => `clientTaskCollaboration/${req.params.clientId}/${req.params.taskId}`;

/** Re-read authoritative accounts, project access and the actual stable parent key.
 * Never use a body-supplied actor, a task's mutable id, or internal task messages. */
async function scope(req: Request) {
  const { clientId, taskId } = req.params;
  if (!safeKey(clientId) || !safeKey(taskId) || (req.params.subtaskId !== undefined && !safeKey(req.params.subtaskId))) {
    fail(400, "Invalid client, task or subtask key.");
  }
  if (clientId.startsWith("__")) fail(403, "Client access is not available.");
  const identity = (req as Request & { portalIdentity: DecodedIdToken }).portalIdentity;
  if (identity.email_verified !== true) fail(403, "A verified active account is required.");
  const authUser = await getAdminAuth().getUser(identity.uid);
  if (authUser.disabled || !authUser.emailVerified || authUser.email?.toLowerCase() !== identity.email!.toLowerCase()) {
    fail(403, "A verified active account is required.");
  }
  const membershipRaw = await read(`clientPortalUsers/${identity.uid}`);
  const client = values(await read("clients")).find(c => c.id === clientId && !c.deleted && !c.archived);
  if (!client) fail(403, "Client access is not available.");
  let authorName = "Client";
  if (!isStaffEmail(identity.email) || membershipRaw != null) {
    if (isStaffEmail(identity.email) || !membershipAllows(normalizeMembership(membershipRaw), identity.email!, clientId)) {
      fail(403, "Verified active assigned client access is required.");
    }
    authorName = authUser.displayName || "Client";
  } else {
    const staff = values(await read("users")).find(u =>
      String(u.email).toLowerCase() === identity.email!.toLowerCase() &&
      u.disabled !== true && u.active !== false && !u.archived);
    // Same authoritative directory/project/owner predicates as Creative Studio.
    // Collaboration does not require enabling Creative Studio or its editor list.
    if (!staff || (!permissions(staff, client!, {}).manager && !ids(staff.assignedProjects).includes(client!.name))) {
      fail(403, "Active staff project access is required.");
    }
    authorName = typeof staff.name === "string" ? staff.name : "Staff";
  }
  // Do not accidentally turn an email-shaped display name into a public identifier.
  if (authorName.includes("@")) authorName = isStaffEmail(identity.email) ? "Staff" : "Client";
  authorName = authorName.trim().slice(0, 100) || "Client";
  const parent = await read(`clientLogs/${clientId}/${taskId}`);
  if (!parent || !projectClientTask(taskId, parent, clientId)) fail(404, "Shared task not found.");
  return { uid: identity.uid, authorName };
}

function entryProjection(id: string, value: RecordData) {
  return { id, type: value.type, text: value.text, url: value.url ?? null,
    authorName: value.authorName, createdAt: value.createdAt };
}
function subtaskProjection(id: string, value: RecordData) {
  return { id, title: value.title, completed: value.completed,
    authorName: value.authorName, createdAt: value.createdAt };
}
function list(raw: RecordData | null, max: number, project: typeof entryProjection | typeof subtaskProjection) {
  return Object.entries(raw ?? {}).sort(([a, x], [b, y]) => x.createdAt - y.createdAt || a.localeCompare(b))
    .slice(0, max).map(([id, value]) => project(id, value));
}
async function limit(uid: string) {
  const now = Date.now();
  const result = await db().ref(`rateLimits/clientTaskCollaboration_${uid}`).transaction(current => {
    if (!current || current.expiresAt <= now) return { count: 1, expiresAt: now + 60_000 };
    if (current.count >= 60) return;
    return { ...current, count: current.count + 1 };
  });
  if (!result.committed) fail(429, "Too many collaboration changes. Try again in a minute.");
}

/** One transaction makes request-id reservation and append indivisible. Records
 * are keyed by a hash of actor+request, so neither IDs nor responses expose UIDs. */
async function append(req: Request, kind: "entries" | "subtasks", requestId: string, content: RecordData) {
  const actor = await scope(req);
  await limit(actor.uid);
  const id = hash(`${actor.uid}\0${requestId.toLowerCase()}`);
  const fingerprint = hash(JSON.stringify({ kind, ...content }));
  const ref = db().ref(root(req));
  await ref.once("value");
  const liveActor = await scope(req);
  const record = { ...content, authorUid: liveActor.uid, authorName: liveActor.authorName, createdAt: Date.now() };
  let conflict = false, full = false;
  const result = await ref.transaction(current => {
    conflict = false; full = false;
    const data = current ?? {};
    const previous = data.requests?.[id];
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.kind !== kind || !data[kind]?.[id]) {
        conflict = true; return;
      }
      return data;
    }
    if (Object.keys(data[kind] ?? {}).length >= (kind === "entries" ? MAX_ENTRIES : MAX_SUBTASKS)) {
      full = true; return;
    }
    return { ...data, [kind]: { ...data[kind], [id]: record },
      requests: { ...data.requests, [id]: { kind, fingerprint } } };
  }, undefined, false);
  if (!result.committed) fail(409, conflict ? "This requestId was already used for different content."
    : full ? "This task has reached its collaboration limit." : "Collaboration changed. Try again.");
  await scope(req);
  return { id, record: result.snapshot.val()[kind][id] as RecordData };
}

router.get("/", async (req, res) => {
  await scope(req);
  const data = await read(root(req));
  await scope(req);
  res.json(GetClientTaskCollaborationResponse.parse({
    entries: list(data?.entries, MAX_ENTRIES, entryProjection),
    subtasks: list(data?.subtasks, MAX_SUBTASKS, subtaskProjection),
  }));
});
router.post("/entries", async (req, res) => {
  const parsed = CreateClientTaskCollaborationEntryBody.strict().safeParse(req.body);
  if (!parsed.success) fail(400, "Provide a type, text (up to 4000 characters), optional link URL and UUID requestId only.");
  const body = parsed.data!;
  const text = body.text.trim();
  let url: string | null = null;
  if (body.type === "link") {
    try {
      const value = new URL(body.url ?? "");
      if (!/^https?:\/\//i.test(body.url ?? "") || !["http:", "https:"].includes(value.protocol) || value.username || value.password ||
          /[\u0000-\u0020\u007f]/.test(body.url ?? "")) throw new Error();
      url = value.href;
    } catch { fail(400, "Links require an HTTP or HTTPS URL without credentials."); }
  } else if (!text || body.url !== undefined) fail(400, "Messages and notes require text and must not contain a URL field.");
  const saved = await append(req, "entries", body.requestId, { type: body.type, text, url });
  res.status(201).json({ entry: GetClientTaskCollaborationResponse.shape.entries.element.parse(entryProjection(saved.id, saved.record)) });
});
router.post("/subtasks", async (req, res) => {
  const parsed = CreateClientTaskCollaborationSubtaskBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim()) fail(400, "Provide a subtask title (up to 200 characters) and UUID requestId only.");
  const saved = await append(req, "subtasks", parsed.data!.requestId, { title: parsed.data!.title.trim(), completed: false });
  res.status(201).json({ subtask: GetClientTaskCollaborationResponse.shape.subtasks.element.parse(subtaskProjection(saved.id, saved.record)) });
});
router.patch("/subtasks/:subtaskId", async (req, res) => {
  const parsed = UpdateClientTaskCollaborationSubtaskBody.strict().safeParse(req.body);
  if (!parsed.success) fail(400, "Provide only completed: true or false.");
  const actor = await scope(req);
  await limit(actor.uid);
  const ref = db().ref(`${root(req)}/subtasks/${req.params.subtaskId}`);
  // once() alone can release Firebase's local cache when its listener detaches.
  // Retain a value listener across the read AND transaction so an existing
  // subtask cannot spuriously hit our null/missing abort on a cold first callback.
  const retainValue = () => {};
  ref.on("value", retainValue, () => {});
  try {
    await ref.once("value");
    await scope(req);
    const result = await ref.transaction(current => {
      if (!current || typeof current !== "object") return;
      return { ...current, completed: parsed.data!.completed };
    }, undefined, false);
    if (!result.committed) fail(404, "Shared subtask not found.");
    await scope(req);
    res.json(UpdateClientTaskCollaborationSubtaskResponse.parse({
      subtask: subtaskProjection(String(req.params.subtaskId), result.snapshot.val()),
    }));
  } finally {
    ref.off("value", retainValue);
  }
});
router.use((error: unknown, _req: Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof CollaborationError) { res.status(error.status).json({ error: error.message }); return; }
  if ((error as { code?: string })?.code === "auth/user-not-found") {
    res.status(403).json({ error: "Active account required." }); return;
  }
  next(error);
});

export default router;
