import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { getAdminAuth, getAdminDatabase } from "../lib/firebase-admin";
import { isStaffEmail, membershipAllows, normalizeMembership, safeKey } from "../lib/client-portal";
import { audit, automation, automationSettings, editable, fail, https, ids, invalidate, permissions, project, strict, StudioError, text, timezone, values, type RecordData } from "../lib/creative-studio";
import { deliveryEnabled, queueStudioEmail, renderStudioEmail, studioDeliveries } from "../lib/creative-studio-email";

const router = Router();
const db = () => getAdminDatabase();
const read = async (path: string) => (await db().ref(path).once("value")).val();
type Context = { uid: string; email: string; external: boolean; user: RecordData; clients: RecordData[]; configs: RecordData; users: RecordData[] };
const ctx = (req: Request): Context => (req as any).studio;
const route = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next); };
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use((req, _res, next) => { (async () => {
  const token = req.headers.authorization;
  if (!token?.startsWith("Bearer ")) fail(401, "Sign in to continue.");
  let identity;
  try { identity = await getAdminAuth().verifyIdToken(token!.slice(7), true); } catch { fail(401, "Your session has expired."); }
  if (!identity!.email || !safeKey(identity!.uid)) fail(403, "Access denied.");
  const membership = normalizeMembership(await read(`clientPortalUsers/${identity!.uid}`));
  const external = !isStaffEmail(identity!.email) || !!membership;
  if (external && (identity!.email_verified !== true || !membershipAllows(membership, identity!.email!))) fail(403, "Verified active client membership required.");
  const users = external ? [] : values(await read("users"));
  const user = external ? {} : users.find(u => String(u.email).toLowerCase() === identity!.email!.toLowerCase() && u.disabled !== true && u.active !== false && !u.archived);
  if (!external && !user) fail(403, "Active staff account required.");
  const clients = values(await read("clients")).filter(c => safeKey(c.id) && !c.id.startsWith("__") && !c.deleted && !c.archived);
  (req as any).studio = { uid: identity!.uid, email: identity!.email!, external, user, clients, users, configs: await read("creativeStudio/configs") ?? {} };
  next();
})().catch(next); });

async function scope(req: Request, manage = false) {
  const c = ctx(req), clientId = String(req.params.clientId);
  if (!safeKey(clientId)) fail(400, "Invalid client.");
  const client = values(await read("clients")).find(x => x.id === clientId && !x.deleted && !x.archived);
  if (!client) fail(403, "Client unavailable.");
  const config = await read(`creativeStudio/configs/${clientId}`) ?? {};
  if (c.external) {
    if (manage || !config.enabled || !membershipAllows(normalizeMembership(await read(`clientPortalUsers/${c.uid}`)), c.email, clientId)) fail(403, "Client unavailable.");
  } else {
    // Recheck live staff status/project membership, not just the middleware snapshot.
    const liveUser = values(await read("users")).find(u => String(u.email).toLowerCase() === c.email.toLowerCase() && u.disabled !== true && u.active !== false && !u.archived);
    if (!liveUser || await read(`clientPortalUsers/${c.uid}`)) fail(403, "Staff access is no longer available.");
    c.user = liveUser!;
    const permission = permissions(c.user, client!, config);
    if (manage ? !permission.manager : !permission.editor || !config.enabled) fail(403, "Creative Studio access denied.");
  }
  return { client: client!, config, clientId };
}
async function itemFor(req: Request) {
  const { clientId } = await scope(req);
  if (!safeKey(req.params.id)) fail(400, "Invalid deliverable.");
  const item = await read(`creativeStudio/items/${clientId}/${req.params.id}`);
  if (!item || (ctx(req).external && (!item.shared || item.archived || item.stage === "internal_draft"))) fail(404, "Deliverable not available.");
  return item as RecordData;
}
function staff(req: Request) { if (ctx(req).external) fail(403, "Staff action required."); }
async function checkOwner(req: Request, ownerId: string) {
  const { client, config } = await scope(req);
  const user = values(await read("users")).find(u => String(u.id) === ownerId && u.disabled !== true && u.active !== false && !u.archived);
  if (!user || !permissions(user, client, config).editor) fail(400, "Select an authorized active creative owner.");
}
async function checkApprover(clientId: string, uid: string) {
  if (!safeKey(uid)) fail(400, "Invalid approver.");
  const membership = normalizeMembership(await read(`clientPortalUsers/${uid}`));
  if (!membership || isStaffEmail(membership.email) || !membershipAllows(membership, membership.email, clientId)) fail(403, "Approver membership unavailable.");
  const authUser = await getAdminAuth().getUser(uid);
  if (!authUser.emailVerified || authUser.disabled || authUser.email?.toLowerCase() !== membership!.email.toLowerCase()) fail(403, "A verified active approver is required.");
}
async function mutate(req: Request, transform: (item: RecordData) => void, action: string) {
  await itemFor(req);
  if (!Number.isInteger(req.body.revision) || req.body.revision < 1) fail(400, "Current revision required.");
  await scope(req);
  const c = ctx(req), now = Date.now();
  const ref = db().ref(`creativeStudio/items/${req.params.clientId}/${req.params.id}`);
  // A one-shot read detaches its listener, allowing the RTDB cache to be
  // discarded. Keep this exact item cached until the transaction finishes:
  // otherwise a cold initial null aborts even when the item exists remotely.
  const retainValue = () => {};
  ref.on("value", retainValue, () => {});
  try {
    await ref.once("value");
    await scope(req);
    const result = await ref.transaction(raw => {
      if (!raw || raw.revision !== req.body.revision) return;
      if (c.external && (!raw.shared || raw.archived || raw.stage === "internal_draft")) return;
      const item = structuredClone(raw);
      transform(item);
      item.revision++;
      item.updatedAt = now;
      const approvalChanged = JSON.stringify(raw.approvals ?? {}) !== JSON.stringify(item.approvals ?? {});
      audit(item, c.uid, action, now, approvalChanged ? { approvalBefore: raw.approvals ?? {}, approvalAfter: item.approvals ?? {} } : undefined);
      return item;
    }, undefined, false);
    if (!result.committed) fail(409, "This deliverable changed. Reload before trying again.");
    return result.snapshot.val() as RecordData;
  } finally {
    ref.off("value", retainValue);
  }
}

router.get("/bootstrap", route(async (req, res) => {
  const c = ctx(req), manageableClientIds: string[] = [], editableClientIds: string[] = [];
  const membership = c.external ? normalizeMembership(await read(`clientPortalUsers/${c.uid}`)) : null;
  const clients = c.clients.filter(client => {
    const config = c.configs[client.id] ?? {};
    if (c.external) return config.enabled === true && membershipAllows(membership, c.email, client.id);
    const p = permissions(c.user, client, config);
    if (p.manager) manageableClientIds.push(client.id);
    if (p.editor && config.enabled) editableClientIds.push(client.id);
    return p.manager || (p.editor && config.enabled);
  }).map(({ id, name }) => ({ id, name }));
  const authorized = new Set(clients.map(c => c.id));
  const defaults = c.external ? null : automationSettings(await read("creativeStudio/defaults"));
  const configs = Object.fromEntries(clients.map(client => {
    const config = c.configs[client.id] ?? {};
    return [client.id, c.external ? { enabled: true, timezone: config.timezone ?? "Asia/Kolkata" } : { ...config, enabled: config.enabled === true, ownerIds: ids(config.ownerIds), editorIds: ids(config.editorIds), timezone: config.timezone ?? "Asia/Kolkata", automation: automationSettings(defaults, config.automation) }];
  }));
  const owners = c.external ? [] : c.users.filter(u => u.disabled !== true && u.active !== false && !u.archived).map(u => ({ id: String(u.id), name: u.name ?? "Staff", clientIds: c.clients.filter(cl => authorized.has(cl.id) && permissions(u, cl, c.configs[cl.id] ?? {}).editor).map(cl => cl.id) })).filter(u => u.clientIds.length);
  const staffCandidates = c.external ? [] : c.users.filter(u => u.disabled !== true && u.active !== false && !u.archived).map(u => ({ id: String(u.id), name: u.name ?? "Staff", clientIds: c.clients.filter(cl => manageableClientIds.includes(cl.id) && (ids(u.assignedProjects).includes(cl.name) || permissions(u, cl, c.configs[cl.id] ?? {}).manager)).map(cl => cl.id) })).filter(u => u.clientIds.length);
  const approvers: RecordData[] = [];
  if (!c.external) for (const [uid, raw] of Object.entries(await read("clientPortalUsers") ?? {})) {
    const m = normalizeMembership(raw), clientIds = m?.clientIds.filter(id => authorized.has(id)) ?? [];
    if (!m || !membershipAllows(m, m.email) || !clientIds.length || isStaffEmail(m.email)) continue;
    try { const u = await getAdminAuth().getUser(uid); if (u.emailVerified && !u.disabled && u.email?.toLowerCase() === m.email.toLowerCase()) approvers.push({ uid, name: u.displayName ?? m.email, clientIds }); } catch { /* unavailable auth accounts are not eligible */ }
  }
  res.json({ clients, configs, owners, staffCandidates, approvers, defaults, capabilities: { isClient: c.external, canManageSettings: manageableClientIds.length > 0, canManageDefaults: !c.external && ["Admin", "Super Admin"].includes(c.user.role), canEdit: editableClientIds.length > 0, manageableClientIds, editableClientIds } });
}));
router.put("/defaults", route(async (req, res) => {
  staff(req);
  if (!["Admin", "Super Admin"].includes(ctx(req).user.role)) fail(403, "Administrator required.");
  const defaults = automation(req.body);
  await db().ref("creativeStudio/defaults").set(defaults);
  res.json({ defaults: automationSettings(defaults) });
}));
router.put("/clients/:clientId/config", route(async (req, res) => {
  const { clientId, client, config: previous } = await scope(req, true);
  strict(req.body, ["enabled", "ownerIds", "editorIds", "timezone", "automation"]);
  if (typeof req.body.enabled !== "boolean") fail(400, "Enabled must be a boolean.");
  for (const key of ["ownerIds", "editorIds"]) {
    if (!Array.isArray(req.body[key]) || req.body[key].length > 100 || req.body[key].some((id: any) => !safeKey(id) || !ctx(req).users.some(u => String(u.id) === id && u.disabled !== true && u.active !== false && !u.archived))) fail(400, "Select active staff only.");
  }
  if ([...req.body.editorIds, ...req.body.ownerIds].some((id: string) => {
    const u = ctx(req).users.find(u => String(u.id) === id)!;
    return !ids(u.assignedProjects).includes(client.name) && !permissions(u, client, {}).manager;
  })) fail(400, "Creative owners/editors need existing project membership or master-client ownership.");
  const config = { enabled: req.body.enabled, ownerIds: [...new Set(req.body.ownerIds)], editorIds: [...new Set(req.body.editorIds)], timezone: timezone(req.body.timezone), automation: automation(req.body.automation), enabledAt: req.body.enabled && !previous.enabled ? Date.now() : previous.enabledAt ?? 0, updatedAt: Date.now(), updatedBy: ctx(req).uid };
  await db().ref(`creativeStudio/configs/${clientId}`).set(config);
  res.json({ config: { ...config, automation: automationSettings(await read("creativeStudio/defaults"), config.automation) } });
}));
router.get("/clients/:clientId/deliverables", route(async (req, res) => {
  const { clientId } = await scope(req);
  const deliverables = values(await read(`creativeStudio/items/${clientId}`)).filter(i => !ctx(req).external || (i.shared && !i.archived && i.stage !== "internal_draft")).map(i => project(i, ctx(req).external));
  await scope(req);
  res.json({ deliverables });
}));
router.post("/clients/:clientId/deliverables", route(async (req, res) => {
  staff(req); const { clientId } = await scope(req);
  const data = editable(req.body, true); await checkOwner(req, data.ownerId);
  const now = Date.now(), id = randomUUID();
  const item = { ...data, id, clientId, revision: 1, stage: "internal_draft", shared: false, archived: false, scheduled: null, assets: {}, approvals: {}, createdAt: now, updatedAt: now };
  audit(item, ctx(req).uid, "created", now);
  await db().ref(`creativeStudio/items/${clientId}/${id}`).set(item);
  res.status(201).json({ deliverable: project(item, false) });
}));
router.get("/clients/:clientId/deliverables/:id", route(async (req, res) => { const item = await itemFor(req); await scope(req); res.json({ deliverable: project(item, ctx(req).external) }); }));
router.patch("/clients/:clientId/deliverables/:id", route(async (req, res) => {
  staff(req); const data = editable(req.body);
  if (data.ownerId) await checkOwner(req, data.ownerId);
  const item = await mutate(req, i => {
    if (i.archived) fail(409, "Restore before editing.");
    const material = ["title", "type", "brief", "caption", "platforms"].some(k => k in data && JSON.stringify(i[k]) !== JSON.stringify(data[k]));
    Object.assign(i, data);
    if (material) invalidate(i);
    if (["plannedAt", "timezone"].some(k => k in data)) i.scheduled = null;
  }, "edited");
  res.json({ deliverable: project(item, false) });
}));
router.post("/clients/:clientId/deliverables/:id/assets", route(async (req, res) => {
  staff(req); strict(req.body, ["revision", "assetId", "phase", "kind", "label", "url"]);
  const b = req.body;
  if (!["reference", "final"].includes(b.phase) || !["thumbnail", "main", "video", "copy", "file"].includes(b.kind) || (b.assetId !== undefined && !safeKey(b.assetId))) fail(400, "Invalid asset.");
  const label = text(b.label, 200, true), url = https(b.url), id = b.assetId ?? randomUUID(), now = Date.now();
  const item = await mutate(req, i => {
    if (i.archived) fail(409, "Restore before editing.");
    i.assets ??= {};
    const previous = i.assets[id];
    if (b.assetId && (!previous || previous.phase !== b.phase)) fail(400, "Asset does not exist in this phase.");
    const history = previous?.history ?? {};
    if (previous) { const { history: _history, ...version } = previous; history[String(previous.revision)] = version; }
    i.assets[id] = { id, phase: b.phase, kind: b.kind, label, url, revision: (previous?.revision ?? 0) + 1, updatedAt: now, updatedBy: ctx(req).uid, history };
    invalidate(i, b.phase);
  }, "asset_revision");
  res.json({ deliverable: project(item, false) });
}));
router.post("/clients/:clientId/deliverables/:id/actions", route(async (req, res) => {
  strict(req.body, ["revision", "action", "phase", "approverUid", "decision", "feedback", "link"]);
  const b = req.body, c = ctx(req);
  if (!["share", "unshare", "archive", "restore", "duplicate", "request_approval", "decide", "schedule", "unschedule", "remind"].includes(b.action)) fail(400, "Unknown action.");
  if (b.action !== "decide") staff(req);
  if (["request_approval", "decide"].includes(b.action) && !["reference", "final"].includes(b.phase)) fail(400, "Invalid approval phase.");
  if (b.action === "request_approval") await checkApprover(String(req.params.clientId), b.approverUid);
  if (b.action === "decide" && (!c.external || !["approved", "changes_requested"].includes(b.decision))) fail(403, "Assigned client approver required.");
  const feedback = b.feedback === undefined ? "" : text(b.feedback, 5000);
  if (b.decision === "changes_requested" && !feedback) fail(400, "Feedback is required.");
  const link = b.link ? https(b.link) : null;
  if (b.action === "duplicate") {
    const original = await itemFor(req);
    if (original.revision !== b.revision) fail(409, "Reload the current revision.");
    const id = randomUUID(), now = Date.now();
    const copy: RecordData = { ...Object.fromEntries(["title", "type", "ownerId", "brief", "caption", "platforms", "productionDueDate", "plannedAt", "timezone"].map(k => [k, original[k] ?? null])), id, clientId: original.clientId, title: `${original.title} (copy)`, revision: 1, stage: "internal_draft", shared: false, archived: false, scheduled: null, approvals: {}, assets: {}, createdAt: now, updatedAt: now };
    for (const asset of values(original.assets)) { const aid = randomUUID(); copy.assets[aid] = { ...asset, id: aid, history: {}, revision: 1, updatedAt: now, updatedBy: c.uid }; }
    audit(copy, c.uid, "duplicated", now);
    await db().ref(`creativeStudio/items/${original.clientId}/${id}`).set(copy);
    res.status(201).json({ deliverable: project(copy, false) }); return;
  }
  const item = await mutate(req, i => {
    if (i.archived && b.action !== "restore") fail(409, "Restore before changing this deliverable.");
    if (b.action === "share") i.shared = true;
    if (b.action === "unshare") { i.shared = false; invalidate(i); }
    if (b.action === "archive") { i.archived = true; i.scheduled = null; i.reminderEpoch = Date.now(); }
    if (b.action === "restore") { i.archived = false; i.reminderEpoch = Date.now(); }
    if (b.action === "request_approval") {
      if (b.phase === "final" && i.approvals?.reference?.status !== "approved") fail(409, "Reference approval is required first.");
      const assets = values(i.assets).filter(a => a.phase === b.phase);
      if (!assets.length) fail(400, "Add an asset for this approval phase.");
      if (b.phase === "reference") invalidate(i);
      i.shared = true; i.scheduled = null; i.approvals ??= {};
      i.approvals[b.phase] = { revision: i.revision + 1, approverUid: b.approverUid, status: "pending", requestedAt: Date.now(), snapshot: { caption: i.caption ?? "", assets: assets.map(a => ({ id: a.id, revision: a.revision, label: a.label, url: a.url, kind: a.kind })) } };
      i.stage = b.phase === "reference" ? "awaiting_reference" : "awaiting_final";
    }
    if (b.action === "decide") {
      const a = i.approvals?.[b.phase];
      if (!a || a.status !== "pending" || a.approverUid !== c.uid || i.stage !== `awaiting_${b.phase}`) fail(403, "No pending approval assigned to you.");
      Object.assign(a, { status: b.decision, feedback, decidedAt: Date.now(), actor: c.uid });
      i.stage = b.decision === "changes_requested" ? `${b.phase}_changes` : b.phase === "reference" ? "in_production" : "final_approved";
    }
    if (b.action === "schedule") {
      if (i.stage !== "final_approved" || i.approvals?.final?.status !== "approved" || !i.plannedAt || !i.platforms?.length) fail(409, "Current final approval, posting time and platforms required.");
      i.scheduled = { at: Date.now(), actor: c.uid, link };
    }
    if (b.action === "unschedule") i.scheduled = null;
    if (b.action === "remind" && !["awaiting_reference", "awaiting_final"].includes(i.stage)) fail(409, "No pending approval.");
  }, b.action);
  let emailError: string | undefined;
  if (["request_approval", "remind", "decide"].includes(b.action)) {
    try { await queueStudioEmail(item, b.action === "decide" ? "decision" : b.action === "request_approval" ? "request" : "reminder"); }
    catch { emailError = "The deliverable was saved, but its notification could not be queued."; }
  }
  res.json({ deliverable: project(item, c.external), ...(emailError ? { emailError } : {}) });
}));
router.get("/clients/:clientId/deliverables/:id/activity", route(async (req, res) => { staff(req); const item = await itemFor(req); res.json({ activity: values(item.activity).sort((a, b) => a.at - b.at) }); }));
router.get("/clients/:clientId/deliverables/:id/messages/:thread", route(async (req, res) => {
  const item = await itemFor(req), thread = String(req.params.thread);
  if (!["internal", "client"].includes(thread) || (ctx(req).external && thread !== "client")) fail(403, "Thread access denied.");
  const messages = values(await read(`creativeStudio/${thread}Messages/${item.clientId}/${item.id}`));
  await itemFor(req);
  res.json({ messages: messages.sort((a, b) => a.at - b.at) });
}));
router.post("/clients/:clientId/deliverables/:id/messages/:thread", route(async (req, res) => {
  const item = await itemFor(req), thread = String(req.params.thread), c = ctx(req);
  if (!["internal", "client"].includes(thread) || (c.external && thread !== "client")) fail(403, "Thread access denied.");
  strict(req.body, ["idempotencyKey", "text"]);
  if (!safeKey(req.body.idempotencyKey)) fail(400, "A stable retry key is required.");
  const message = { id: `${c.uid}_${req.body.idempotencyKey}`, text: text(req.body.text, 5000, true), author: c.external ? "Client" : c.user.name ?? "Staff", authorUid: c.uid, at: Date.now() };
  const ref = db().ref(`creativeStudio/${thread}Messages/${item.clientId}/${item.id}/${message.id}`);
  await itemFor(req);
  const result = await ref.transaction(current => current ?? message);
  const saved = result.snapshot.val();
  if (saved.text !== message.text) fail(409, "Retry key already used for another message.");
  res.json({ message: saved });
}));
router.get("/clients/:clientId/deliveries", route(async (req, res) => {
  const { clientId } = await scope(req, true);
  const result = await studioDeliveries(clientId);
  await scope(req, true);
  res.json(result);
}));
router.post("/clients/:clientId/preview", route(async (req, res) => {
  const { client, config } = await scope(req, true);
  strict(req.body, ["phase"]);
  const phase = req.body.phase;
  if (!["reference", "final"].includes(phase)) fail(400, "Select reference or final approval phase.");
  const settings = automationSettings(await read("creativeStudio/defaults"), config.automation);
  const now = Date.now();
  const example = { id: "preview-example", title: "Example campaign post", type: "Post", timezone: settings.timezone, plannedAt: new Date(now + 7 * 86400000).toISOString(), productionDueDate: new Date(now + 5 * 86400000).toISOString().slice(0, 10) };
  const { subject, body } = renderStudioEmail(example, client, settings, phase);
  res.json({ subject, body, deliveryEnabled: deliveryEnabled() && config.enabled === true && settings.enabled && settings[phase as "reference" | "final"].enabled });
}));
router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error instanceof StudioError ? error.status : 500).json({ error: error instanceof StudioError ? error.message : "Creative Studio is unavailable. Try again later." });
});
export default router;
