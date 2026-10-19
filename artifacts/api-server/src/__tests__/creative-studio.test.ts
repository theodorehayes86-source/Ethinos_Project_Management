import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { automation as validateAutomation, automationSettings, editable, permissions, project, studioUrgency, timezone } from "../lib/creative-studio";

const state = vi.hoisted(() => ({ data: {} as Record<string, any>, writes: [] as string[], verify: vi.fn(), getUser: vi.fn(), send: vi.fn(), configured: vi.fn(),
  cold: false, retained: new Map<string, Set<Function>>(), beforeTransaction: null as null | (() => void) }));
vi.mock("../lib/firebase-admin", () => {
  const get = (path: string) => path.split("/").reduce((v, k) => v?.[k], state.data) ?? null;
  const put = (path: string, value: any) => {
    const parts = path.split("/"); let node = state.data;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)!] = value;
    state.writes.push(path);
  };
  const ref = (path: string): any => ({
    on: (_event: string, callback: Function) => {
      const listeners = state.retained.get(path) ?? new Set();
      listeners.add(callback); state.retained.set(path, listeners);
    },
    off: (_event: string, callback: Function) => { state.retained.get(path)?.delete(callback); },
    once: async () => ({ val: () => structuredClone(get(path)) }),
    set: async (value: any) => put(path, value),
    update: async (value: any) => put(path, { ...get(path), ...value }),
    transaction: async (fn: (current: any) => any) => {
      state.beforeTransaction?.();
      const cold = state.cold && path.startsWith("creativeStudio/items/") && !state.retained.get(path)?.size;
      const value = fn(cold ? null : structuredClone(get(path)));
      if (value === undefined) return { committed: false, snapshot: { val: () => get(path) } };
      put(path, value);
      return { committed: true, snapshot: { val: () => value } };
    },
  });
  return { getAdminDatabase: () => ({ ref }), getAdminAuth: () => ({ verifyIdToken: state.verify, getUser: state.getUser }) };
});
vi.mock("../lib/microsoft-graph", () => ({ sendEmail: state.send, isEmailConfigured: state.configured }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
import router from "../routes/creative-studio";
import { queueStudioEmail, renderStudioEmail, runStudioEmailWorker, studioEmailLink } from "../lib/creative-studio-email";
const app = express(); app.use(express.json()); app.use("/studio", router);
const api = (method: "get" | "post" | "patch" | "put", path: string, body?: object) => request(app)[method](`/studio${path}`).set("Authorization", "Bearer test").send(body);
const itemPath = "/clients/a/deliverables/item";
const external = { uid: "external", email: "client@example.test", email_verified: true };
const staffIdentity = { uid: "staffAuth", email: "admin@ethinos.com" };
const automation = { enabled: true, sendTime: "09:00", timezone: "Asia/Kolkata", cadenceDays: 1 };
function item() { return state.data.creativeStudio.items.a.item; }
function action(action: string, extra: object = {}) { return api("post", `${itemPath}/actions`, { revision: item().revision, action, ...extra }); }
beforeEach(() => {
  vi.clearAllMocks();
  state.cold = false; state.retained.clear(); state.beforeTransaction = null;
  delete process.env.CREATIVE_STUDIO_EMAIL_DELIVERY;
  state.verify.mockResolvedValue(staffIdentity);
  state.getUser.mockResolvedValue({ email: external.email, emailVerified: true, disabled: false });
  state.configured.mockReturnValue(true);
  state.data = {
    users: { staff: { id: "staff", name: "Administrator", email: staffIdentity.email, role: "Admin" }, editor: { id: "editor", name: "Editor", email: "editor@ethinos.com", role: "Executive", assignedProjects: ["Alpha"] }, bh: { id: "bh", email: "bh@ethinos.com", role: "Business Head" } },
    clients: { a: { id: "a", name: "Alpha", ownerIds: ["bh"] }, b: { id: "b", name: "Beta" } },
    clientPortalUsers: { external: { email: external.email, disabled: false, clientIds: ["a"] } },
    creativeStudio: {
      configs: { a: { enabled: true, editorIds: ["editor"], automation }, b: { enabled: false } },
      items: { a: { item: { id: "item", clientId: "a", title: "Campaign", type: "Post", ownerId: "staff", brief: "SECRET_BRIEF", caption: "Public caption", revision: 1, stage: "internal_draft", shared: false, archived: false, scheduled: null, timezone: "Asia/Kolkata", platforms: [], assets: { ref: { id: "ref", phase: "reference", kind: "main", label: "Reference", url: "https://example.test/ref", revision: 1 } }, createdAt: 1, updatedAt: 1 } } },
    },
  };
  state.writes = [];
});
describe("Creative Studio security and contracts", () => {
  it.each(["Social", "Design", " social ", "DESIGN"])("grants %s direct editing for assigned enabled clients only", async department => {
    state.verify.mockResolvedValue({ uid: "editorAuth", email: "editor@ethinos.com" });
    state.data.users.editor.department = department;
    state.data.creativeStudio.configs.a.editorIds = [];
    const bootstrap = await api("get", "/bootstrap");
    expect(bootstrap.body.capabilities).toMatchObject({ canAccessStudio: true, canEdit: true, canManageSettings: false, editableClientIds: ["a"] });
    expect((await api("patch", itemPath, { revision: 1, title: "Department edit" })).status).toBe(200);
    expect((await api("put", "/clients/a/config", {})).status).toBe(403);
    expect((await api("get", "/clients/b/deliverables")).status).toBe(403);
    state.data.creativeStudio.configs.a.enabled = false;
    expect((await api("get", "/clients/a/deliverables")).status).toBe(403);
    state.data.creativeStudio.configs.a.enabled = true;
    state.data.users.editor.assignedProjects = [];
    expect((await api("get", "/clients/a/deliverables")).status).toBe(403);
    expect((await api("get", "/bootstrap")).body.capabilities).toMatchObject({ canAccessStudio: true, canEdit: false });
    state.data.users.editor.disabled = true;
    expect((await api("get", "/bootstrap")).status).toBe(403);
  });
  it("revokes department-derived access when the staff department changes", async () => {
    state.verify.mockResolvedValue({ uid: "editorAuth", email: "editor@ethinos.com" });
    state.data.creativeStudio.configs.a.editorIds = [];
    state.data.users.editor.department = "Social";
    expect((await api("get", "/clients/a/deliverables")).status).toBe(200);
    state.data.users.editor.department = "Growth";
    expect((await api("get", "/clients/a/deliverables")).status).toBe(403);
    expect((await api("get", "/bootstrap")).body.capabilities.canAccessStudio).toBe(false);
  });
  it("returns identical client-safe Studio data to authorized preview without staff fields", async () => {
    item().shared = true;
    const preview = await api("get", "/clients/a/deliverables?preview=client");
    expect(preview.status).toBe(200);
    state.verify.mockResolvedValue(external);
    const actual = await api("get", "/clients/a/deliverables");
    expect(preview.body).toEqual(actual.body);
    expect(JSON.stringify(preview.body)).not.toContain("SECRET_BRIEF");
    expect(preview.body.deliverables[0].assets).toEqual([]);
    expect(state.writes).toEqual([]);
    state.verify.mockResolvedValue({ uid: "editorAuth", email: "editor@ethinos.com" });
    state.data.users.editor.assignedProjects = [];
    expect((await api("get", "/clients/a/deliverables?preview=client")).status).toBe(403);
  });
  it("shows an explicitly shared draft in the assigned client's list and detail without internal data", async () => {
    item().plannedAt = "2026-10-19T09:00:00.000Z";
    expect((await action("share")).status).toBe(200);
    state.verify.mockResolvedValue(external);
    const listed = await api("get", "/clients/a/deliverables");
    expect(listed.status).toBe(200);
    expect(listed.body.deliverables).toHaveLength(1);
    expect(listed.body.deliverables[0]).toMatchObject({
      id: "item", shared: true, stage: "internal_draft",
      plannedAt: "2026-10-19T09:00:00.000Z", timezone: "Asia/Kolkata",
    });
    expect(listed.body.deliverables[0]).not.toHaveProperty("brief");
    expect(listed.body.deliverables[0]).not.toHaveProperty("ownerId");
    expect(listed.body.deliverables[0].assets).toEqual([]);
    expect((await api("get", itemPath)).status).toBe(200);
    expect((await api("get", "/clients/b/deliverables")).status).toBe(403);
    item().archived = true;
    expect((await api("get", "/clients/a/deliverables")).body.deliverables).toEqual([]);
    expect((await api("get", itemPath)).status).toBe(404);
    item().archived = false; item().shared = false;
    expect((await api("get", "/clients/a/deliverables")).body.deliverables).toEqual([]);
    expect((await api("get", itemPath)).status).toBe(404);
  });
  it("shares an existing draft with a cold Firebase cache and releases its listener", async () => {
    state.cold = true;
    const response = await action("share");
    expect(response.status).toBe(200);
    expect(response.body.deliverable).toMatchObject({ shared: true, revision: 2 });
    expect(item().shared).toBe(true);
    expect(state.retained.get("creativeStudio/items/a/item")?.size).toBe(0);
  });
  it("retains genuine concurrent revision conflicts without overwriting changes", async () => {
    state.cold = true;
    state.beforeTransaction = () => { item().revision = 2; item().caption = "Concurrent edit"; };
    const response = await action("share");
    expect(response.status).toBe(409);
    expect(item()).toMatchObject({ shared: false, revision: 2, caption: "Concurrent edit" });
    expect(state.writes).toEqual([]);
    expect(state.retained.get("creativeStudio/items/a/item")?.size).toBe(0);
  });
  it("does not recreate an item deleted before the transaction and releases its listener", async () => {
    state.beforeTransaction = () => { delete state.data.creativeStudio.items.a.item; };
    expect((await action("share")).status).toBe(409);
    expect(item()).toBeUndefined();
    expect(state.writes).toEqual([]);
    expect(state.retained.get("creativeStudio/items/a/item")?.size).toBe(0);
  });
  it("releases the listener when the action is rejected by validation", async () => {
    // No final approval exists, so scheduling must fail from inside the transform.
    expect((await action("schedule")).status).toBe(409);
    expect(state.writes).toEqual([]);
    expect(state.retained.get("creativeStudio/items/a/item")?.size).toBe(0);
  });
  it("requires a revoked-token checked session", async () => {
    expect((await request(app).get("/studio/bootstrap")).status).toBe(401);
    state.verify.mockRejectedValue(new Error("revoked"));
    expect((await api("get", "/bootstrap")).status).toBe(401);
    expect(state.verify).toHaveBeenCalledWith("test", true);
    expect(state.writes).toEqual([]);
  });
  it("denies unverified and revoked memberships", async () => {
    state.verify.mockResolvedValue({ ...external, email_verified: false });
    expect((await api("get", "/bootstrap")).status).toBe(403);
    state.verify.mockResolvedValue(external);
    state.data.clientPortalUsers.external.disabled = true;
    expect((await api("get", "/bootstrap")).status).toBe(403);
  });
  it.each(["pending", "revoked", "processing"])("blocks %s onboarding from Studio and approver selection even with verified Auth", async status => {
    Object.assign(state.data.clientPortalUsers.external, { onboardingRequired: true,
      invitation: { status, expiresAt: Date.now() + 86400000 } });
    state.verify.mockResolvedValue(external);
    expect((await api("get", "/bootstrap")).status).toBe(403);
    expect((await api("get", itemPath)).status).toBe(403);
    state.verify.mockResolvedValue(staffIdentity);
    expect((await api("get", "/bootstrap")).body.approvers).toEqual([]);
    expect((await action("request_approval", { phase: "reference", approverUid: "external" })).status).toBe(403);
  });
  it("scopes external bootstrap and returns genuine empty collections", async () => {
    state.verify.mockResolvedValue(external);
    const response = await api("get", "/bootstrap");
    expect(response.body.clients).toEqual([{ id: "a", name: "Alpha" }]);
    expect(response.body.owners).toEqual([]);
    expect(response.body.approvers).toEqual([]);
    expect(response.body.capabilities.canManageSettings).toBe(false);
    expect((await api("get", "/clients/a/deliverables")).body.deliverables).toEqual([]);
    expect((await api("get", "/clients/b/deliverables")).status).toBe(403);
    expect((await api("get", itemPath)).status).toBe(404);
  });
  it("BH owner works without project membership; editor requires both project and creative grant", async () => {
    state.verify.mockResolvedValue({ uid: "bhAuth", email: "bh@ethinos.com" });
    expect((await api("get", "/bootstrap")).body.capabilities.manageableClientIds).toEqual(["a"]);
    state.verify.mockResolvedValue({ uid: "editorAuth", email: "editor@ethinos.com" });
    expect((await api("get", "/clients/a/deliverables")).status).toBe(200);
    expect((await api("get", "/clients/a/deliveries")).status).toBe(403);
    state.data.users.editor.assignedProjects = [];
    expect((await api("get", "/clients/a/deliverables")).status).toBe(403);
  });
  it("department alone grants no access; ordinary membership without creative role grants none", () => {
    expect(permissions({ id: "e", department: "Creative", assignedProjects: ["Alpha"] }, { name: "Alpha" }, {}).editor).toBe(false);
  });
  it("denies client settings, staff edits and internal threads, without leaking operational fields", async () => {
    item().shared = true; item().stage = "awaiting_reference";
    state.verify.mockResolvedValue(external);
    const result = await api("get", itemPath);
    expect(JSON.stringify(result.body)).not.toContain("SECRET_BRIEF");
    expect(result.body.deliverable).not.toHaveProperty("ownerId");
    expect((await api("get", `${itemPath}/messages/internal`)).status).toBe(403);
    expect((await api("get", `${itemPath}/activity`)).status).toBe(403);
    expect((await api("patch", itemPath, { revision: 1, title: "Attack" })).status).toBe(403);
    expect((await api("put", "/clients/a/config", {})).status).toBe(403);
  });
  it("disabled clients preserve records but block operations and external bootstrap", async () => {
    state.data.creativeStudio.configs.a.enabled = false;
    expect((await api("get", itemPath)).status).toBe(403);
    state.verify.mockResolvedValue(external);
    expect((await api("get", "/bootstrap")).body.clients).toEqual([]);
    expect(item().title).toBe("Campaign");
  });
  it("rejects unknown fields and unsafe links; validates timezone and deadlines", async () => {
    expect((await api("patch", itemPath, { revision: 1, shared: true })).status).toBe(400);
    expect((await api("post", `${itemPath}/assets`, { revision: 1, phase: "reference", kind: "main", label: "x", url: "javascript:alert(1)" })).status).toBe(400);
    expect(() => editable({ productionDueDate: "2026-02-30" })).toThrow();
    expect(() => timezone("Bogus/Zone")).toThrow();
    expect(timezone("America/New_York")).toBe("America/New_York");
  });
  it("writes exclusively isolated creative collections and creates unscheduled drafts", async () => {
    const response = await api("post", "/clients/a/deliverables", { title: "New", type: "Reel", ownerId: "staff", brief: "Brief" });
    expect(response.status).toBe(201);
    expect(response.body.deliverable.plannedAt).toBeNull();
    expect(response.body.deliverable.assets).toEqual([]);
    expect(state.writes.every(p => p.startsWith("creativeStudio/"))).toBe(true);
  });
  it("enforces server-only Firebase rules", () => {
    const rules = JSON.parse(readFileSync(new URL("../../../../database.rules.json", import.meta.url), "utf8"));
    expect(rules.rules.creativeStudio).toEqual({ ".read": false, ".write": false });
    expect(rules.rules[".read"]).toBe(false);
  });
  it("handles IST midnight and DST calendar-day urgency without frozen dates", () => {
    expect(studioUrgency({ plannedAt: "2026-01-04T18:00:00Z", timezone: "Asia/Kolkata" }, Date.parse("2026-01-01T18:15:00Z"))).toBe("near");
    expect(studioUrgency({ plannedAt: "2026-11-04T04:00:00Z", timezone: "America/New_York" }, Date.parse("2026-10-31T23:00:00Z"))).toBe("near");
    expect(studioUrgency({ plannedAt: "2026-01-01T10:00:00Z" }, Date.parse("2026-01-01T11:00:00Z"))).toBe("overdue");
    expect(studioUrgency({ plannedAt: "2026-01-01T10:00:00Z", scheduled: { at: 1 } })).toBe("none");
  });
  it("allows scoped owners settings but not defaults or other client configuration", async () => {
    state.verify.mockResolvedValue({ uid: "bhAuth", email: "bh@ethinos.com" });
    const config = { enabled: false, ownerIds: ["bh"], editorIds: ["editor"], timezone: "Asia/Kolkata", automation };
    expect((await api("put", "/clients/a/config", config)).status).toBe(200);
    expect(item().title).toBe("Campaign");
    expect((await api("put", "/clients/b/config", config)).status).toBe(403);
    expect((await api("put", "/defaults", automation)).status).toBe(403);
  });
});
describe("Creative Studio revisions and conversations", () => {
  it("supports full two-stage approval, scheduling, undo and immutable decision history", async () => {
    item().plannedAt = "2026-10-01T09:00:00Z"; item().platforms = ["Instagram"];
    await action("request_approval", { phase: "reference", approverUid: "external" });
    state.verify.mockResolvedValue(external);
    await action("decide", { phase: "reference", decision: "approved" });
    state.verify.mockResolvedValue(staffIdentity);
    await api("post", `${itemPath}/assets`, { revision: item().revision, phase: "final", kind: "main", label: "Final", url: "https://example.test/final" });
    await action("request_approval", { phase: "final", approverUid: "external" });
    state.verify.mockResolvedValue(external);
    await action("decide", { phase: "final", decision: "approved" });
    state.verify.mockResolvedValue(staffIdentity);
    expect((await action("schedule", { link: "https://example.test/calendar" })).status).toBe(200);
    expect(item().scheduled.actor).toBe("staffAuth");
    expect((await action("unschedule")).status).toBe(200);
    expect(item().scheduled).toBeNull();
    await api("patch", itemPath, { revision: item().revision, caption: "Revised copy" });
    expect(item().approvals).toEqual({});
    const history = (await api("get", `${itemPath}/activity`)).body.activity;
    expect(history.some((event: any) => event.details?.approvalBefore?.final?.status === "approved")).toBe(true);
    expect(history.some((event: any) => event.details?.approvalAfter?.final?.snapshot?.assets?.length === 1)).toBe(true);
  });
  it("enforces approval order, designated actors, stale revisions and complete scheduling fields", async () => {
    expect((await action("request_approval", { phase: "final", approverUid: "external" })).status).toBe(409);
    expect((await action("request_approval", { phase: "reference", approverUid: "external" })).status).toBe(200);
    const submittedRevision = item().revision;
    state.verify.mockResolvedValue(external);
    expect((await action("decide", { phase: "reference", decision: "approved" })).status).toBe(200);
    expect((await api("post", `${itemPath}/actions`, { revision: submittedRevision, action: "decide", phase: "reference", decision: "approved" })).status).toBe(409);
    state.verify.mockResolvedValue(staffIdentity);
    expect((await action("schedule")).status).toBe(409);
    const asset = await api("post", `${itemPath}/assets`, { revision: item().revision, phase: "final", kind: "video", label: "Final", url: "https://example.test/video" });
    expect(asset.status).toBe(200);
    await action("request_approval", { phase: "final", approverUid: "external" });
    state.verify.mockResolvedValue(external);
    await action("decide", { phase: "final", decision: "approved" });
    state.verify.mockResolvedValue(staffIdentity);
    expect((await action("schedule")).status).toBe(409);
    await api("patch", itemPath, { revision: item().revision, plannedAt: "2026-10-01T09:00:00Z" });
    // Platform changes are material and invalidate the final approval.
    await api("patch", itemPath, { revision: item().revision, platforms: ["Instagram"] });
    expect(item().stage).toBe("internal_draft");
    expect(item().scheduled).toBeNull();
  });
  it("rejects a client who is not designated and requires change feedback", async () => {
    await action("request_approval", { phase: "reference", approverUid: "external" });
    item().approvals.reference.approverUid = "someoneElse";
    state.verify.mockResolvedValue(external);
    expect((await action("decide", { phase: "reference", decision: "approved" })).status).toBe(403);
    expect((await action("decide", { phase: "reference", decision: "changes_requested" })).status).toBe(400);
  });
  it("preserves asset history and never exposes unpublished replacements", async () => {
    await action("request_approval", { phase: "reference", approverUid: "external" });
    const response = await api("post", `${itemPath}/assets`, { revision: item().revision, assetId: "ref", phase: "reference", kind: "main", label: "Replacement", url: "https://example.test/new" });
    expect(response.body.deliverable.assets[0].history).toHaveLength(1);
    expect(item().stage).toBe("internal_draft");
    expect(project(item(), true).assets).toEqual([]);
  });
  it("duplicates reset approvals, schedule, activity, chats and delivery identity", async () => {
    item().shared = true; item().stage = "final_approved"; item().scheduled = { at: 1 };
    const result = await action("duplicate");
    expect(result.status).toBe(201);
    expect(result.body.deliverable).toMatchObject({ stage: "internal_draft", shared: false, scheduled: null, revision: 1, approvals: {} });
    expect(result.body.deliverable.id).not.toBe("item");
  });
  it("message retries are idempotent and collisions are explicit", async () => {
    const path = `${itemPath}/messages/internal`;
    const a = await api("post", path, { idempotencyKey: "retry-1", text: "Hello" });
    const b = await api("post", path, { idempotencyKey: "retry-1", text: "Hello" });
    expect(a.body.message).toEqual(b.body.message);
    expect((await api("get", path)).body.messages).toHaveLength(1);
    expect((await api("post", path, { idempotencyKey: "retry-1", text: "Changed" })).status).toBe(409);
  });
  it("uses the authenticated client's account name for chat, not a role or request-supplied name", async () => {
    item().shared = true;
    state.verify.mockResolvedValue(external);
    state.getUser.mockResolvedValue({ email: external.email, emailVerified: true, displayName: "  Alex Example  " });
    const path = `${itemPath}/messages/client`;
    const result = await api("post", path, { idempotencyKey: "named-client", text: "Please revise" });
    expect(result.status).toBe(200);
    expect(result.body.message.author).toBe("Alex Example");
    expect((await api("get", path)).body.messages[0].author).toBe("Alex Example");
    expect((await api("post", path, { idempotencyKey: "spoof", text: "Hello", author: "Someone else" })).status).toBe(400);
  });
  it("resolves legacy client labels without rewriting history or exposing account fields", async () => {
    item().shared = true;
    state.verify.mockResolvedValue(external);
    state.data.creativeStudio.clientMessages = { a: { item: {
      legacy: { id: "legacy", author: "Client", authorUid: "external", at: 1, text: "Old message" },
      named: { id: "named", author: "Saved Name", authorUid: "external", at: 2, text: "Another" },
    } } };
    state.getUser.mockResolvedValue({ displayName: "Alex Example", email: external.email, customClaims: { private: true } });
    const result = await api("get", `${itemPath}/messages/client`);
    expect(result.status).toBe(200);
    expect(result.body.messages.map((m: any) => m.author)).toEqual(["Alex Example", "Saved Name"]);
    expect(JSON.stringify(result.body)).not.toContain(external.email);
    expect(JSON.stringify(result.body)).not.toContain("customClaims");
    expect(state.data.creativeStudio.clientMessages.a.item.legacy.author).toBe("Client");
    state.getUser.mockRejectedValueOnce(new Error("Profile unavailable"));
    expect((await api("get", `${itemPath}/messages/client`)).body.messages[0].author).toBe("Client");
  });
  it.each([undefined, "", "   ", "private@example.test"])("keeps a safe chat fallback when the account name is %s", async displayName => {
    item().shared = true;
    state.verify.mockResolvedValue(external);
    state.getUser.mockResolvedValue({ displayName });
    const result = await api("post", `${itemPath}/messages/client`, { idempotencyKey: "fallback", text: "Hello" });
    expect(result.status).toBe(200);
    expect(result.body.message.author).toBe("Client");
  });
});
describe("Creative Studio mail safety", () => {
  it("does not acquire a lock or perform database writes when Graph is unconfigured", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    state.configured.mockReturnValue(false);
    await runStudioEmailWorker();
    expect(state.writes).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("cancels every queued email kind when automation is disabled before delivery", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    item().plannedAt = new Date(Date.now() + 86400000).toISOString();
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await queueStudioEmail(item(), "reminder");
    await queueStudioEmail(item(), "escalation");
    state.data.creativeStudio.configs.a.automation = { ...automation, enabled: false };
    await runStudioEmailWorker();
    expect(state.send).not.toHaveBeenCalled();
    const deliveries = Object.values(state.data.creativeStudio.deliveries.a) as any[];
    expect(deliveries).toHaveLength(3);
    expect(deliveries.every(d => d.status === "cancelled")).toBe(true);
    item().approvals.reference.status = "approved";
    item().approvals.reference.decidedAt = Date.now();
    item().stage = "in_production";
    await queueStudioEmail(item(), "decision");
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).find(d => d.kind === "decision")).toMatchObject({ status: "suppressed", reason: "Client email automation is disabled." });
  });
  it("cancels a queued decision notification when automation is disabled", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    await action("request_approval", { phase: "reference", approverUid: "external" });
    state.verify.mockResolvedValue(external);
    await action("decide", { phase: "reference", decision: "approved" });
    state.data.creativeStudio.configs.a.automation = { ...automation, enabled: false };
    await runStudioEmailWorker();
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).find(d => d.kind === "decision").status).toBe("cancelled");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("resolves numeric master owner/client IDs against string deliverable IDs", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    state.data.users.staff.id = 42;
    state.data.clients.a.id = 7;
    state.data.creativeStudio.configs["7"] = state.data.creativeStudio.configs.a;
    state.data.clientPortalUsers.external.clientIds = ["7"];
    const record = { ...item(), ownerId: "42", clientId: "7", plannedAt: new Date(Date.now() + 86400000).toISOString(), shared: true, stage: "awaiting_reference", approvals: { reference: { status: "pending", revision: 2, approverUid: "external" } } };
    await queueStudioEmail(record, "escalation");
    const delivery = (Object.values(state.data.creativeStudio.deliveries["7"]) as any[])[0];
    expect(delivery).toMatchObject({ recipientUid: "42", status: "queued" });
  });
  it("uses the workspace deliverable query contract and distinguishes client from staff entry", () => {
    const clientLink = new URL(studioEmailLink({ id: "creative-123" }, "request"));
    const staffLink = new URL(studioEmailLink({ id: "creative-123" }, "decision"));
    expect(clientLink.searchParams.get("deliverable")).toBe("creative-123");
    expect(clientLink.searchParams.get("client")).toBe("1");
    expect(staffLink.searchParams.get("deliverable")).toBe("creative-123");
    expect(staffLink.searchParams.has("client")).toBe(false);
    expect(clientLink.searchParams.has("studioItem")).toBe(false);
  });
  it("cancels superseded requests and archived deliverables immediately before transport", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await api("patch", itemPath, { revision: item().revision, caption: "New material revision" });
    await runStudioEmailWorker();
    expect(state.send).not.toHaveBeenCalled();
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await action("archive");
    await runStudioEmailWorker();
    expect(state.send).not.toHaveBeenCalled();
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).every(d => d.status === "cancelled")).toBe(true);
  });
  it("suppresses real transport by default and deduplicates reminder windows", async () => {
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await queueStudioEmail(item(), "reminder");
    await queueStudioEmail(item(), "reminder");
    await runStudioEmailWorker();
    const deliveries = Object.values(state.data.creativeStudio.deliveries.a) as any[];
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every(d => d.status === "suppressed")).toBe(true);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("stops queued delivery on membership revocation and does not replay suppressed entries", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    await action("request_approval", { phase: "reference", approverUid: "external" });
    state.data.clientPortalUsers.external.disabled = true;
    await runStudioEmailWorker();
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[])[0].status).toBe("cancelled");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("cancels queued Studio email for pending onboarding despite verified Auth", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    await action("request_approval", { phase: "reference", approverUid: "external" });
    Object.assign(state.data.clientPortalUsers.external, { onboardingRequired: true,
      invitation: { status: "pending", expiresAt: Date.now() + 86400000 } });
    await runStudioEmailWorker();
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[])[0].status).toBe("cancelled");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("records a visible failure without ambiguous automatic email retries", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    state.send.mockRejectedValue(new Error("transport"));
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await runStudioEmailWorker();
    await runStudioEmailWorker();
    expect(state.send).toHaveBeenCalledTimes(1);
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[])[0].status).toBe("failed");
  });
});
describe("Creative Studio phase automation", () => {
  it("merges legacy settings and nested defaults; validates phase templates strictly", async () => {
    const settings = automationSettings(automation, { reference: { escalationDays: 8 } });
    expect(settings.reference).toMatchObject({ enabled: true, escalationDays: 8 });
    expect(settings.final).toMatchObject({ enabled: true, escalationDays: 2 });
    expect(settings.reference.subject).not.toBe(settings.final.subject);
    expect(validateAutomation(automation)).toEqual(automation);
    const phase = { ...settings.reference };
    expect(() => validateAutomation({ ...automation, reference: { ...phase, escalationDays: -1 } })).toThrow();
    expect(() => validateAutomation({ ...automation, reference: { ...phase, subject: "Hello\nBcc: victim" } })).toThrow();
    expect(() => validateAutomation({ ...automation, reference: { ...phase, subject: "{{url}}" } })).toThrow();
    expect(() => validateAutomation({ ...automation, reference: { ...phase, url: "https://evil.test" } })).toThrow();
    const response = await api("get", "/bootstrap");
    expect(response.body.configs.a.automation.reference.escalationDays).toBe(5);
    expect(state.writes).toEqual([]);
  });
  it("suppresses requests, reminders and escalations for a disabled phase at queue time", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    item().plannedAt = new Date(Date.now() + 86400000).toISOString();
    state.data.creativeStudio.configs.a.automation = { ...automation, reference: { enabled: false } };
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await queueStudioEmail(item(), "reminder");
    await queueStudioEmail(item(), "escalation");
    const deliveries = Object.values(state.data.creativeStudio.deliveries.a) as any[];
    expect(deliveries).toHaveLength(3);
    expect(deliveries.every(d => d.status === "suppressed")).toBe(true);
    await runStudioEmailWorker();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("cancels all queued phase notifications when the phase is disabled before transport", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    item().plannedAt = new Date(Date.now() + 86400000).toISOString();
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await queueStudioEmail(item(), "reminder");
    await queueStudioEmail(item(), "escalation");
    state.data.creativeStudio.configs.a.automation = { ...automation, reference: { enabled: false } };
    await runStudioEmailWorker();
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).every(d => d.status === "cancelled")).toBe(true);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("uses the phase-specific escalation window at queue and send, and checks revoked approvers", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    item().plannedAt = new Date(Date.now() + 4 * 86400000).toISOString();
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await queueStudioEmail(item(), "escalation");
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).find(d => d.kind === "escalation").status).toBe("queued");
    state.data.creativeStudio.configs.a.automation = { ...automation, reference: { escalationDays: 2 } };
    await runStudioEmailWorker();
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).find(d => d.kind === "escalation").status).toBe("cancelled");
    item().stage = "awaiting_final";
    item().approvals.final = { ...item().approvals.reference, revision: 3 };
    await queueStudioEmail(item(), "escalation");
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).filter(d => d.kind === "escalation")).toHaveLength(1);
    item().plannedAt = new Date(Date.now() + 86400000).toISOString();
    state.data.clientPortalUsers.external.disabled = true;
    await queueStudioEmail(item(), "escalation");
    expect((Object.values(state.data.creativeStudio.deliveries.a) as any[]).filter(d => d.kind === "escalation")).toHaveLength(1);
  });
  it("renders safe literal substitutions once and sends the same phase template with a trusted deep link", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    item().title = '<img src=x onerror="bad"> {{client}}\nInjected';
    item().plannedAt = "2026-11-10T10:00:00Z";
    item().productionDueDate = "2026-11-08";
    item().timezone = "America/New_York";
    const settings = automationSettings(automation);
    const rendered = renderStudioEmail(item(), { name: "Alpha" }, settings, "final");
    expect(rendered.subject).not.toContain("\n");
    expect(rendered.body).toContain("8 Nov 2026");
    expect(rendered.body).toContain("{{client}}");
    expect(rendered.bodyHtml).not.toContain("<img");
    expect(rendered.bodyHtml).toContain("&lt;img");
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await runStudioEmailWorker();
    const expected = renderStudioEmail(item(), { name: "Alpha" }, settings, "reference", "request");
    expect(state.send).toHaveBeenCalledWith({ to: external.email, subject: expected.subject, bodyHtml: expected.bodyHtml });
  });
  it("previews the selected phase using populated examples without writing or sending", async () => {
    const reference = await api("post", "/clients/a/preview", { phase: "reference" });
    const final = await api("post", "/clients/a/preview", { phase: "final" });
    expect(reference.body.subject).toBe("Action needed: approve references for Example campaign post");
    expect(final.body.subject).toContain("Final approval needed:");
    expect(final.body.body).toContain("Hi Alpha");
    expect(final.body.body).not.toContain("{{");
    expect(final.body.deliveryEnabled).toBe(false);
    expect((await api("post", "/clients/a/preview", { phase: "bad" })).status).toBe(400);
    expect((await api("post", "/clients/a/preview", { phase: "final", url: "https://evil.test" })).status).toBe(400);
    state.verify.mockResolvedValue({ uid: "editorAuth", email: "editor@ethinos.com" });
    expect((await api("post", "/clients/a/preview", { phase: "final" })).status).toBe(403);
    expect(state.writes).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
  });
  it("projects upcoming reminders read-only with full titles, phase, recipients, local schedule and cooldown", async () => {
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    item().title = "Full campaign title without truncation";
    state.getUser.mockResolvedValue({ email: external.email, emailVerified: true, disabled: false, displayName: "Client Approver" });
    await action("request_approval", { phase: "reference", approverUid: "external" });
    await queueStudioEmail(item(), "reminder");
    state.writes = [];
    const response = await api("get", "/clients/a/deliveries");
    expect(response.body.deliveries).toHaveLength(2);
    expect(response.body.upcoming).toHaveLength(1);
    const next = response.body.upcoming[0];
    expect(next).toMatchObject({ itemTitle: item().title, approvalPhase: "reference", recipientName: "Client Approver", status: "scheduled", kind: "reminder" });
    expect(next).not.toHaveProperty("sentAt");
    expect(next).not.toHaveProperty("openedAt");
    expect(next.scheduledAt).toBeGreaterThan(Date.now() + 86400000 - 1000);
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(next.scheduledAt)).toBe("09:00");
    state.data.clientPortalUsers.external.disabled = true;
    expect((await api("get", "/clients/a/deliveries")).body.upcoming).toEqual([]);
    expect(state.writes).toEqual([]);
  });
  it("does not project disabled, unshared, archived or unauthorized reminders", async () => {
    await action("request_approval", { phase: "reference", approverUid: "external" });
    expect((await api("get", "/clients/a/deliveries")).body.upcoming).toEqual([]);
    process.env.CREATIVE_STUDIO_EMAIL_DELIVERY = "enabled";
    item().shared = false;
    expect((await api("get", "/clients/a/deliveries")).body.upcoming).toEqual([]);
    item().shared = true; item().archived = true;
    expect((await api("get", "/clients/a/deliveries")).body.upcoming).toEqual([]);
    item().archived = false;
    state.data.creativeStudio.configs.a.automation = { ...automation, reference: { enabled: false } };
    expect((await api("get", "/clients/a/deliveries")).body.upcoming).toEqual([]);
  });
});
