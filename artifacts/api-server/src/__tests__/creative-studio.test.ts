import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { editable, permissions, project, studioUrgency, timezone } from "../lib/creative-studio";

const state = vi.hoisted(() => ({ data: {} as Record<string, any>, writes: [] as string[], verify: vi.fn(), getUser: vi.fn(), send: vi.fn(), configured: vi.fn() }));
vi.mock("../lib/firebase-admin", () => {
  const get = (path: string) => path.split("/").reduce((v, k) => v?.[k], state.data) ?? null;
  const put = (path: string, value: any) => {
    const parts = path.split("/"); let node = state.data;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)!] = value;
    state.writes.push(path);
  };
  const ref = (path: string): any => ({
    once: async () => ({ val: () => structuredClone(get(path)) }),
    set: async (value: any) => put(path, value),
    update: async (value: any) => put(path, { ...get(path), ...value }),
    transaction: async (fn: (current: any) => any) => {
      const value = fn(structuredClone(get(path)));
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
import { queueStudioEmail, runStudioEmailWorker, studioEmailLink } from "../lib/creative-studio-email";
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
    const record = { ...item(), ownerId: "42", clientId: "7", shared: true, stage: "awaiting_reference", approvals: { reference: { status: "pending", revision: 2 } } };
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
