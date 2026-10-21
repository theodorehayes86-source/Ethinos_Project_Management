import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { clientDirectory, membershipAllows, normalizeMembership, projectClientTask } from "../lib/client-portal";

const state = vi.hoisted(() => ({
  data: {} as Record<string, any>,
  writes: [] as string[],
  reads: [] as string[],
  verify: vi.fn(),
  mail: vi.fn(),
  revoke: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
  authUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  cold: false,
  retained: new Map<string, Set<Function>>(),
}));

vi.mock("../lib/firebase-admin", () => {
  const ref = (path = "", valueFilter?: string): any => ({
    key: path.split("/").at(-1),
    on: (_event: string, listener: () => void) => {
      const listeners = state.retained.get(path) ?? new Set();
      listeners.add(listener); state.retained.set(path, listeners); listener();
    },
    off: (_event: string, listener: () => void) => { state.retained.get(path)?.delete(listener); },
    once: async () => {
      state.reads.push(path);
      if (path === "clientPortalInvitationHashes") {
        const hashes = Object.fromEntries(Object.entries(state.data)
          .filter(([key, value]) => key.startsWith(`${path}/`) && (valueFilter === undefined || value === valueFilter))
          .map(([key, value]) => [key.slice(path.length + 1), value]));
        return { val: () => hashes, exists: () => Object.keys(hashes).length > 0 };
      }
      return { val: () => state.data[path] ?? null, exists: () => state.data[path] != null };
    },
    orderByChild: () => ({ equalTo: () => ref(path) }),
    orderByValue: () => ({ equalTo: (value: string) => ref(path, value) }),
    push: () => ref(`${path}/new-task`),
    update: async (value: any) => {
      await state.update(path, value);
      state.writes.push(path);
      if (!path) { Object.assign(state.data, value); }
      else { state.data[path] = { ...state.data[path], ...value }; }
    },
    set: async (value: any) => { await state.set(path); state.data[path] = value; },
    transaction: async (fn: (current: any) => any) => {
      await state.transaction(path);
      const value = fn(state.cold && !state.retained.get(path)?.size ? null : state.data[path] ?? null);
      if (value === undefined) return { committed: false };
      state.data[path] = value; return { committed: true, snapshot: { val: () => value } };
    },
  });
  return {
    getAdminDatabase: () => ({ ref }),
    getAdminAuth: () => ({
      verifyIdToken: state.verify, getUserByEmail: state.getUser, createUser: state.createUser,
      revokeRefreshTokens: state.revoke,
      getUser: state.authUser, updateUser: state.updateUser,
      deleteUser: state.deleteUser,
    }),
  };
});
vi.mock("../lib/microsoft-graph", () => ({
  sendEmail: state.mail, isEmailConfigured: () => true,
  isTeamsConfigured: () => false, resolveEntraObjectId: vi.fn().mockResolvedValue(null),
  sendTeamsActivityNotification: vi.fn().mockResolvedValue({ ok: false }),
}));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import portalRouter from "../routes/client-portal";
import { staffApiBoundary } from "../lib/staff-api-boundary";
const app = express();
app.use(express.json());
app.use("/api/client-portal", portalRouter);
app.use(staffApiBoundary);
app.post("/api/notify", (_req, res) => res.json({ staff: true }));
app.post("/api/teams-chat/open", (_req, res) => res.json({ staff: true }));

const client = { uid: "client-a", email: "client@example.test", email_verified: true };
const membership = { email: client.email, disabled: false, clientIds: ["alpha"] };
const api = "/api/client-portal";
const get = (path: string) => request(app).get(`${api}${path}`).set("Authorization", "Bearer test");
const post = (path: string, body: object) => request(app).post(`${api}${path}`).set("Authorization", "Bearer test").send(body);
const patchTask = (body: object, clientId = "alpha", taskId = "shared") =>
  request(app).patch(`${api}/clients/${clientId}/tasks/${taskId}`).set("Authorization", "Bearer test").send(body);
const sharedTask = {
  name: "Shared deliverable", clientDescription: "Approved copy", visibility: "client",
  status: "Pending", dueDate: "15th Oct 2026", comment: "INTERNAL_SECRET",
  messages: [{ text: "PRIVATE_CHAT" }], assigneeEmail: "STAFF_SECRET", elapsedMs: 999,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.data = {
    "clientPortalUsers/client-a": { ...membership },
    clients: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "OTHER_CLIENT" }],
    "clientLogs/alpha": {
      shared: sharedTask, internal: { name: "HIDDEN_TASK" },
      checklist: { ...sharedTask, taskType: "checklist" },
      grouped: { ...sharedTask, taskGroupId: "g" },
      archived: { ...sharedTask, archived: true },
    },
    users: [{ email: "admin@ethinos.com", role: "Admin" }],
  };
  state.reads = []; state.writes = [];
  state.verify.mockResolvedValue(client);
  state.mail.mockResolvedValue(undefined);
  state.getUser.mockResolvedValue({ uid: "new-client", email: "new@example.test", disabled: false });
  state.authUser.mockImplementation(async (uid: string) => ({
    uid, email: state.data[`clientPortalUsers/${uid}`]?.email ?? "new@example.test", disabled: false, emailVerified: true,
  }));
  state.updateUser.mockResolvedValue({});
  state.deleteUser.mockResolvedValue(undefined);
  state.transaction.mockReset();
  state.update.mockReset();
  state.cold = false; state.retained.clear();
  state.set.mockReset();
  state.createUser.mockResolvedValue({ uid: "new-client", email: "new@example.test", disabled: false });
});

describe("client task API boundary", () => {
  it("uses the identical safe task projection for staff preview and actual clients", async () => {
    const actual = await get("/clients/alpha/tasks");
    state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" });
    const preview = await get("/clients/alpha/tasks?preview=client");
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual(actual.body);
    expect(state.writes).toEqual([]);
  });
  it("denies preview to clients and unrelated or disabled staff", async () => {
    expect((await get("/clients/alpha/tasks?preview=client")).status).toBe(403);
    state.verify.mockResolvedValue({ uid: "staff", email: "staff@ethinos.com" });
    state.data.users = [{ email: "staff@ethinos.com", role: "Employee", assignedProjects: ["OTHER_CLIENT"] }];
    expect((await get("/clients/alpha/tasks?preview=client")).status).toBe(403);
    state.data.users[0].assignedProjects = ["Alpha"];
    expect((await get("/clients/alpha/tasks?preview=client")).status).toBe(200);
    state.data.users[0].disabled = true;
    expect((await get("/clients/alpha/tasks?preview=client")).status).toBe(403);
  });
  it("does not let the preview query enable client task writes by staff", async () => {
    state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" });
    expect((await post("/clients/alpha/tasks?preview=client", { title: "Forbidden", description: "" })).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it("requires a token before reading anything", async () => {
    expect((await request(app).get(`${api}/me`)).status).toBe(401);
    expect(state.reads).toEqual([]);
  });
  it("checks token revocation and rejects expired/disabled auth", async () => {
    state.verify.mockRejectedValue(new Error("revoked"));
    expect((await get("/me")).status).toBe(401);
    expect(state.verify).toHaveBeenCalledWith("test", true);
    expect(state.reads).toEqual([]);
  });
  it("rejects unverified emails, even with membership", async () => {
    state.verify.mockResolvedValue({ ...client, email_verified: false });
    expect((await get("/me")).status).toBe(403);
  });
  it("lists only explicitly assigned clients, no metadata", async () => {
    const res = await get("/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clients: [{ id: "alpha", name: "Alpha" }] });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
  it("never grants access by email domain alone", async () => {
    state.verify.mockResolvedValue({ ...client, uid: "uninvited" });
    expect((await get("/me")).status).toBe(403);
  });
  it.each(["beta", "missing", "__personal__", "__ethinos__"])("denies client %s before reading its tasks", async id => {
    expect((await get(`/clients/${id}/tasks`)).status).toBe(403);
    expect(state.reads).not.toContain(`clientLogs/${id}`);
  });
  it("projects shared fields only, excluding internal/checklist/archive/group tasks", async () => {
    const res = await get("/clients/alpha/tasks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [{
      id: "shared", title: "Shared deliverable", description: "Approved copy", status: "Pending", dueDate: "2026-10-15",
      category: "", statusEditable: true, statusEditReason: "",
    }] });
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|PRIVATE|HIDDEN/);
  });
  it("does not fall back to internal descriptions", () => {
    expect(projectClientTask("a", { name: "A", visibility: "client", comment: "secret", description: "private" })?.description).toBe("");
    expect(projectClientTask("a", { name: "A" })).toBeNull();
  });
  it("removes tasks returned to Internal on next read", async () => {
    state.data["clientLogs/alpha"].shared = { ...sharedTask, visibility: "internal" };
    expect((await get("/clients/alpha/tasks")).body.tasks).toEqual([]);
  });
  it.each([
    { ...membership, disabled: true }, { ...membership, clientIds: [] },
    { ...membership, email: "changed@example.test" }, null,
  ])("denies revoked/changed membership", async value => {
    state.data["clientPortalUsers/client-a"] = value;
    expect((await get("/clients/alpha/tasks")).status).toBe(403);
    expect((await post("/clients/alpha/tasks", { title: "A", description: "" })).status).toBe(403);
  });
  it("creates only a Pending ordinary task with server-owned fields and a unique key", async () => {
    const res = await post("/clients/alpha/tasks", { title: "  New brief ", description: "Client details", dueDate: "2026-10-16" });
    expect(res.status).toBe(201);
    expect(state.writes).toEqual(["clientLogs/alpha/new-task"]);
    expect(state.data["clientLogs/alpha/new-task"]).toMatchObject({
      id: "new-task", name: "New brief", clientDescription: "Client details", comment: "",
      visibility: "client", status: "Pending", taskType: "task", creatorId: client.uid,
      clientId: "alpha", assigneeId: null, dueDate: "16th Oct 2026", repeatFrequency: "Once",
    });
    expect(res.body.task).toMatchObject({ category: "", statusEditable: true, statusEditReason: "" });
    expect(Object.keys(res.body.task).sort()).toEqual(["category", "description", "dueDate", "id", "status", "statusEditReason", "statusEditable", "title"]);
  });
  it("creates reminders, links and subtasks together as client-safe collaboration", async () => {
    state.authUser.mockResolvedValue({ email: client.email, emailVerified: true, displayName: "Alex Example" });
    const result = await post("/clients/alpha/tasks", {
      title: "Client brief", description: "Please review", dueDate: "2026-11-03",
      reminderDate: "2026-11-01", reminderTime: "14:30", reminderTimezone: "America/New_York",
      subtasks: ["  Check copy  ", "Approve design"], links: [{ text: "  Brief  ", url: "https://example.test/brief" }],
    });
    expect(result.status).toBe(201);
    expect(state.writes).toEqual([""]);
    expect(state.data["clientLogs/alpha/new-task"]).toMatchObject({
      reminderOffsets: ["-2"], reminderTime: "14:30", reminderTimezone: "America/New_York",
      visibility: "client", taskType: "task", creatorName: "Alex Example", assigneeId: null,
    });
    const collaboration = state.data["clientTaskCollaboration/alpha/new-task"];
    expect(Object.values(collaboration.subtasks)).toEqual([
      expect.objectContaining({ title: "Check copy", completed: false, authorName: "Alex Example", authorUid: client.uid }),
      expect.objectContaining({ title: "Approve design", completed: false }),
    ]);
    expect(Object.values(collaboration.entries)).toEqual([
      expect.objectContaining({ type: "link", text: "Brief", url: "https://example.test/brief" }),
    ]);
    expect(state.data["clientLogs/alpha/new-task"]).not.toHaveProperty("steps");
    expect(result.body.task).toMatchObject({ reminderDate: "2026-11-01", reminderTime: "14:30", reminderTimezone: "America/New_York" });
    const detail = await get("/clients/alpha/tasks/new-task/collaboration");
    expect(detail.status).toBe(200);
    expect(detail.body.subtasks.map((s: any) => s.title)).toEqual(["Check copy", "Approve design"]);
    expect(detail.body.entries[0]).toMatchObject({ type: "link", text: "Brief", url: "https://example.test/brief" });
  });
  it("uses IST and 09:00 when a client sets only a reminder date", async () => {
    expect((await post("/clients/alpha/tasks", {
      title: "Due today", description: "", dueDate: "2026-10-19", reminderDate: "2026-10-19",
    })).status).toBe(201);
    expect(state.data["clientLogs/alpha/new-task"]).toMatchObject({
      reminderOffsets: ["0"], reminderTime: "09:00", reminderTimezone: "Asia/Kolkata",
    });
  });
  it("sends a client task creation notification only after saving the task", async () => {
    state.data.users = [{ id: "team", email: "team@ethinos.com", assignedProjects: ["Alpha"] }];
    state.mail.mockImplementationOnce(async () => {
      expect(state.data["clientLogs/alpha/new-task"]).toMatchObject({ source: "client-portal", creatorId: client.uid });
    });
    const response = await post("/clients/alpha/tasks", { title: "Please create a campaign", description: "Client brief" });
    expect(response.status).toBe(201);
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.mail.mock.calls[0][0]).toMatchObject({ to: "team@ethinos.com", subject: "New client task — Alpha", sensitive: true });
  });
  it("keeps task creation successful when its notification fails", async () => {
    state.data.users = [{ id: "team", email: "team@ethinos.com", assignedProjects: ["Alpha"] }];
    state.mail.mockRejectedValueOnce(new Error("Delivery unavailable"));
    const response = await post("/clients/alpha/tasks", { title: "Saved task", description: "" });
    expect(response.status).toBe(201);
    expect(state.data["clientLogs/alpha/new-task"].name).toBe("Saved task");
  });
  it("does not leave a parent task or collaboration behind when the atomic update fails", async () => {
    state.update.mockRejectedValueOnce(new Error("Database unavailable"));
    const result = await post("/clients/alpha/tasks", { title: "Task", description: "", subtasks: ["First"] });
    expect(result.status).toBe(500);
    expect(state.writes).toEqual([]);
    expect(state.data["clientLogs/alpha/new-task"]).toBeUndefined();
    expect(state.data["clientTaskCollaboration/alpha/new-task"]).toBeUndefined();
  });
  it("does not write a task when membership is revoked while preparing its collaboration", async () => {
    state.authUser.mockImplementationOnce(async () => {
      state.data["clientPortalUsers/client-a"] = { ...membership, disabled: true };
      return { email: client.email, emailVerified: true };
    });
    expect((await post("/clients/alpha/tasks", { title: "Task", description: "", subtasks: ["First"] })).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it.each([
    { reminderDate: "2026-10-20" },
    { dueDate: "2026-10-20", reminderDate: "2026-10-21" },
    { dueDate: "2026-03-01", reminderDate: "2026-02-30" },
    { reminderTime: "09:00" }, { reminderTimezone: "Asia/Kolkata" },
    { dueDate: "2026-10-20", reminderDate: "2026-10-20", reminderTime: "25:00" },
    { dueDate: "2026-10-20", reminderDate: "2026-10-20", reminderTimezone: "Invented/Zone" },
    { dueDate: "2026-10-20", reminderDate: "2026-10-20", reminderTimezone: "" },
    { subtasks: ["   "] }, { subtasks: ["x".repeat(301)] },
    { subtasks: Array(101).fill("Task") },
    { links: [{ text: "Unsafe", url: "javascript:alert(1)" }] },
    { links: [{ text: "Unsafe", url: "https://user:password@example.test" }] },
    { links: [{ text: "", url: "https://example.test" }] },
    { links: [{ text: "Whitespace", url: "https://example.test/a b" }] },
    { links: [{ text: "Extra fields", url: "https://example.test", authorUid: "forged" }] },
    { links: Array(51).fill({ text: "Link", url: "https://example.test" }) },
  ])("rejects invalid create-task options without writing: %j", async options => {
    expect((await post("/clients/alpha/tasks", { title: "Task", description: "", ...options })).status).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it.each(["visibility", "clientId", "creatorId", "status", "assigneeId", "taskType", "steps", "templateId", "taskGroupId", "repeatFrequency"])(
    "rejects forged %s", async field => {
      expect((await post("/clients/alpha/tasks", { title: "A", description: "", [field]: "forged" })).status).toBe(400);
      expect(state.writes).toEqual([]);
    },
  );
  it.each(["2026-02-30", "2026-13-01", "not-a-date"])("rejects invalid due date %s", async dueDate => {
    expect((await post("/clients/alpha/tasks", { title: "A", description: "", dueDate })).status).toBe(400);
  });
  it("rejects blank titles and oversized descriptions", async () => {
    expect((await post("/clients/alpha/tasks", { title: "  ", description: "" })).status).toBe(400);
    expect((await post("/clients/alpha/tasks", { title: "A", description: "x".repeat(5001) })).status).toBe(400);
  });
  it.each(["/checklists", "/templates", "/clients/alpha/templates", "/admin/users"])("denies unsupported action %s", async path => {
    expect((await post(path, {})).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it("denies internal status names and deletion", async () => {
    expect((await patchTask({ status: "Done" })).status).toBe(400);
    expect((await request(app).delete(`${api}/clients/alpha/tasks/shared`).set("Authorization", "Bearer test")).status).toBe(403);
  });
  it("rate limits task creation", async () => {
    state.data["rateLimits/clientPortal_task_client-a"] = { count: 30, expiresAt: Date.now() + 60_000 };
    expect((await post("/clients/alpha/tasks", { title: "A", description: "" })).status).toBe(429);
  });
  it.each(["/api/notify", "/api/teams-chat/open"])("blocks clients from staff API %s", async path => {
    expect((await request(app).post(path).set("Authorization", "Bearer test")).status).toBe(403);
  });
  it("blocks portal identities even after changing their email to a staff domain", async () => {
    state.verify.mockResolvedValue({ ...client, email: "changed@ethinos.com" });
    expect((await request(app).post("/api/notify").set("Authorization", "Bearer test")).status).toBe(403);
    expect((await get("/admin/users")).status).toBe(403);
  });
  it("preserves staff API access", async () => {
    state.verify.mockResolvedValue({ uid: "staff", email: "staff@ethinos.com" });
    expect((await request(app).post("/api/notify").set("Authorization", "Bearer test")).status).toBe(200);
  });
});

describe("client task category and atomic status updates (mocked Firebase only)", () => {
  beforeEach(() => {
    state.data["clientLogs/alpha/shared"] = structuredClone(sharedTask);
  });
  it("persists optional categories and projects them without internal descriptions", async () => {
    const created = await post("/clients/alpha/tasks", { title: "Brief", description: "", category: "  Design  " });
    expect(created.status).toBe(201);
    expect(created.body.task.category).toBe("Design");
    expect(created.body.task.description).toBe("");
    expect(state.data["clientLogs/alpha/new-task"].category).toBe("Design");
    expect((await post("/clients/alpha/tasks", { title: "Brief", description: "", category: "x".repeat(101) })).status).toBe(400);
    expect((await post("/clients/alpha/tasks", { title: "Brief", description: "", category: 1 })).status).toBe(400);
    state.data["clientLogs/alpha"].shared = { ...sharedTask, category: "Content", clientDescription: undefined, description: "INTERNAL_SECRET" };
    expect((await get("/clients/alpha/tasks")).body.tasks[0]).toMatchObject({ category: "Content", description: "" });
  });
  it("defaults a created category to empty", async () => {
    const created = await post("/clients/alpha/tasks", { title: "Brief", description: "" });
    expect(created.body.task.category).toBe("");
    expect(state.data["clientLogs/alpha/new-task"].category).toBe("");
  });
  it.each([["Pending", "Pending"], ["In Progress", "WIP"], ["Completed", "Done"]])(
    "maps %s to canonical %s while preserving every other stored field", async (input, stored) => {
      const path = "clientLogs/alpha/shared";
      const original = { ...sharedTask, id: "not-the-storage-key", category: "Design", timerState: "stopped",
        timerStartedAt: null, timeTaken: "1h", completionDate: "retained", completedAt: 123,
        internalCustomField: { secret: true } };
      state.data[path] = original;
      const res = await patchTask({ status: input });
      expect(res.status).toBe(200);
      expect(state.data[path]).toEqual(input === "Pending" ? original : {
        ...original, status: stored, updatedAt: expect.any(Number),
        clientUpdateEvent: { id: expect.any(String), actorUid: client.uid, at: expect.any(Number),
          kind: "status", before: "Pending", after: stored },
      });
      expect(res.body.task).toMatchObject({ id: "shared", status: stored, category: "Design", statusEditable: true });
      expect(JSON.stringify(res.body)).not.toMatch(/SECRET|PRIVATE|internalCustomField|elapsedMs|completedAt|completionDate/);
      expect(state.transaction).toHaveBeenCalledExactlyOnceWith(path);
      expect(state.writes).toEqual([]);
      expect(state.mail).not.toHaveBeenCalled();
    },
  );
  it.each([{}, { status: "On Hold" }, { status: "WIP" }, { status: "Done" }, { status: "completed" },
    { status: "Completed", category: "forged" }, { status: "Completed", visibility: "client" },
    { status: "Completed", comment: "forged" }, { status: null }])("rejects strict unsupported body %j", async body => {
    expect((await patchTask(body)).status).toBe(400);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each(["bad.key", "bad%2Fkey", "x".repeat(129)])("rejects invalid stable key %s", async key => {
    expect((await patchTask({ status: "Completed" }, "alpha", key)).status).toBe(400);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each([null, { ...sharedTask, visibility: "internal" }, { ...sharedTask, taskType: "checklist" },
    { ...sharedTask, taskType: "taskgroup" }, { ...sharedTask, taskGroupId: "group" },
    { ...sharedTask, archived: true }, { ...sharedTask, clientId: "beta" }])("rejects non-shared ordinary task %j", async value => {
    state.data["clientLogs/alpha/shared"] = value;
    expect((await patchTask({ status: "Completed" })).status).toBe(404);
    expect(state.data["clientLogs/alpha/shared"]).toEqual(value);
  });
  it.each([{ timerState: "running" }, { timerState: "paused" }, { qcEnabled: true },
    { qcStatus: "sent" }, { qcStatus: "approved" }, { qcStatus: "rejected" }])("blocks lifecycle managed by staff %j", async fields => {
    const value = { ...sharedTask, ...fields };
    state.data["clientLogs/alpha/shared"] = value;
    state.data["clientLogs/alpha"].shared = value;
    const listed = (await get("/clients/alpha/tasks")).body.tasks[0];
    expect(listed.statusEditable).toBe(false);
    expect(listed.statusEditReason).toMatch(/account team/);
    const res = await patchTask({ status: "Completed" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(listed.statusEditReason);
    expect(state.data["clientLogs/alpha/shared"]).toEqual(value);
  });
  it.each(["beta", "missing", "__personal__"])("rejects foreign client %s before its task transaction", async id => {
    expect((await patchTask({ status: "Completed" }, id)).status).toBe(403);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each([{ ...membership, disabled: true }, { ...membership, clientIds: [] }, null,
    { ...membership, deletionInProgress: true },
    { ...membership, onboardingRequired: true, invitation: { status: "revoked" } }])("rejects revoked membership %j", async value => {
    state.data["clientPortalUsers/client-a"] = value;
    expect((await patchTask({ status: "Completed" })).status).toBe(403);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rejects an unverified or revoked session", async () => {
    state.verify.mockResolvedValueOnce({ ...client, email_verified: false });
    expect((await patchTask({ status: "Completed" })).status).toBe(403);
    state.verify.mockRejectedValueOnce(new Error("revoked"));
    expect((await patchTask({ status: "Completed" })).status).toBe(401);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rechecks current visibility inside the transaction after concurrent staff edits", async () => {
    state.transaction.mockImplementationOnce(() => {
      state.data["clientLogs/alpha/shared"] = { ...sharedTask, visibility: "internal" };
    });
    expect((await patchTask({ status: "Completed" })).status).toBe(404);
    expect(state.data["clientLogs/alpha/shared"].status).toBe("Pending");
  });
  it("preserves concurrent staff fields from the current transaction value", async () => {
    state.transaction.mockImplementationOnce(() => {
      state.data["clientLogs/alpha/shared"] = { ...sharedTask, category: "Updated", comment: "NEW_SECRET", elapsedMs: 4567 };
    });
    expect((await patchTask({ status: "In Progress" })).status).toBe(200);
    expect(state.data["clientLogs/alpha/shared"]).toMatchObject({ category: "Updated", comment: "NEW_SECRET", elapsedMs: 4567, status: "WIP" });
  });
  it("rechecks membership immediately before writing", async () => {
    // Directory access happens between the first and second membership reads.
    const clients = state.data.clients;
    Object.defineProperty(state.data, "clients", { configurable: true, get: () => {
      state.data["clientPortalUsers/client-a"] = { ...membership, disabled: true };
      return clients;
    } });
    expect((await patchTask({ status: "Completed" })).status).toBe(403);
    expect(state.transaction).not.toHaveBeenCalled();
  });
});

describe("admin invitations and access lifecycle", () => {
  beforeEach(() => { state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" }); });
  it("lists and re-enables memberships whose empty clientIds array was removed by RTDB", async () => {
    const cleared = { email: client.email, disabled: true }; // Actual RTDB representation, NOT [].
    state.data.clientPortalUsers = { "client-a": cleared };
    state.data["clientPortalUsers/client-a"] = cleared;
    const listed = await get("/admin/users");
    expect(listed.status).toBe(200);
    expect(listed.body.users).toEqual([{ uid: "client-a", email: client.email, disabled: true, clientIds: [], invitationStatus: "accepted" }]);
    const restored = await request(app).patch(`${api}/admin/users/client-a`).set("Authorization", "Bearer test").send({ clientIds: ["alpha"], disabled: false });
    expect(restored.status).toBe(200);
    state.verify.mockResolvedValue(client);
    expect((await get("/me")).body.clients).toEqual([{ id: "alpha", name: "Alpha" }]);
  });
  it("treats an absent clientIds child as zero access, not an invalid membership", async () => {
    state.data["clientPortalUsers/client-a"] = { email: client.email, disabled: false };
    state.verify.mockResolvedValue(client);
    expect((await get("/me")).body.clients).toEqual([]);
    expect((await get("/clients/alpha/tasks")).status).toBe(403);
  });
  it("rejects non-admin staff", async () => {
    state.data.users[0].role = "Employee";
    expect((await get("/admin/users")).status).toBe(403);
  });
  it("invites only external emails and valid clients", async () => {
    expect((await post("/admin/users", { email: "staff@ethinos.com", clientIds: ["alpha"] })).status).toBe(400);
    expect((await post("/admin/users", { email: "new@example.test", clientIds: ["missing"] })).status).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it("creates a pending membership and sends only one opaque invitation link", async () => {
    const res = await post("/admin/users", { email: "new@example.test", clientIds: ["alpha", "beta"] });
    expect(res.status).toBe(201);
    expect(res.body.invitationSent).toBe(true);
    expect(state.data["clientPortalUsers/new-client"].onboardingRequired).toBe(true);
    const html = state.mail.mock.calls[0][0].bodyHtml;
    expect(html.match(/href=/g)).toHaveLength(1);
    expect(html).toMatch(/https:\/\/project.ethinos.com\/\?client=1#invite=[A-Za-z0-9_-]{43}/);
    expect(html).not.toMatch(/password|verify/);
  });
  it("saves first and last names, lists them, and personalizes the invitation", async () => {
    const response = await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"],
      firstName: " Alex ", lastName: " Morgan " });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ firstName: "Alex", lastName: "Morgan" });
    expect(state.data["clientPortalUsers/new-client"]).toMatchObject({ firstName: "Alex", lastName: "Morgan" });
    state.data.clientPortalUsers = { "new-client": state.data["clientPortalUsers/new-client"] };
    expect((await get("/admin/users")).body.users).toEqual(expect.arrayContaining([expect.objectContaining({ firstName: "Alex", lastName: "Morgan" })]));
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("Hi Alex Morgan,");
  });
  it("prefills invite names and saves confirmed signup names with the Auth display name", async () => {
    state.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    const created = await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"], firstName: "Alex", lastName: "Morgan" });
    expect(created.status).toBe(201);
    const token = state.mail.mock.calls.at(-1)![0].bodyHtml.match(/#invite=([A-Za-z0-9_-]{43})/)![1];
    const inspected = await request(app).post(`${api}/invitations/inspect`).send({ token });
    expect(inspected.body).toMatchObject({ firstName: "Alex", lastName: "Morgan" });
    const accepted = await request(app).post(`${api}/invitations/accept`).send({ token, password: "secure-long-password", firstName: "Alexander", lastName: "Morgan" });
    expect(accepted.status).toBe(200);
    expect(state.data["clientPortalUsers/new-client"]).toMatchObject({ firstName: "Alexander", lastName: "Morgan" });
    expect(state.updateUser).toHaveBeenCalledWith("new-client", expect.objectContaining({ displayName: "Alexander Morgan" }));
  });
  it("edits contact names without dropping membership or invitation fields, and preserves them on disable", async () => {
    const path = "clientPortalUsers/client-a";
    state.data[path].invitation = { status: "accepted", expiresAt: 1 };
    const result = await request(app).patch(`${api}/admin/users/client-a`).set("Authorization", "Bearer test")
      .send({ clientIds: ["alpha"], disabled: false, firstName: "Renée", lastName: "O’Connor" });
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({ firstName: "Renée", lastName: "O’Connor" });
    expect(state.data[path].invitation.status).toBe("accepted");
    const disabled = await request(app).patch(`${api}/admin/users/client-a`).set("Authorization", "Bearer test")
      .send({ clientIds: ["alpha"], disabled: true });
    expect(disabled.body.user).toMatchObject({ firstName: "Renée", lastName: "O’Connor", disabled: true });
  });
  it.each([
    { firstName: "Only" }, { firstName: " ", lastName: "Name" },
    { firstName: "A\nB", lastName: "Name" }, { firstName: "A".repeat(51), lastName: "Name" },
  ])("rejects invalid or partial contact names without writing", async names => {
    expect((await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"], ...names })).status).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it("explicitly reports delivery failure without losing membership", async () => {
    state.mail.mockRejectedValue(new Error("no delivery"));
    const res = await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"] });
    expect(res.status).toBe(201);
    expect(res.body.invitationSent).toBe(false);
  });
  it("never overwrites an existing membership through invite", async () => {
    state.data["clientPortalUsers/new-client"] = membership;
    expect((await post("/admin/users", { email: "new@example.test", clientIds: ["beta"] })).status).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it("never converts a privileged Firebase identity to a client", async () => {
    state.data["userRoles/new-client"] = "Admin";
    expect((await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"] })).status).toBe(409);
  });
  it("saves revocation before token invalidation", async () => {
    const res = await request(app).patch(`${api}/admin/users/client-a`).set("Authorization", "Bearer test").send({ clientIds: [], disabled: true });
    expect(res.status).toBe(200);
    expect(state.data["clientPortalUsers/client-a"].disabled).toBe(true);
    expect(state.revoke).toHaveBeenCalledWith("client-a");
    state.verify.mockResolvedValue(client);
    expect((await get("/me")).status).toBe(403);
  });
  it("resends invitations only to active managed accounts", async () => {
    state.data["clientPortalUsers/client-a"].disabled = true;
    expect((await post("/admin/users/client-a/invite", {})).status).toBe(404);
    expect(state.mail).not.toHaveBeenCalled();
  });
});

describe("permanent client login deletion (mocked Firebase only)", () => {
  const remove = (uid = "client-a") => request(app).delete(`${api}/admin/users/${uid}`).set("Authorization", "Bearer test");
  const patch = () => request(app).patch(`${api}/admin/users/client-a`).set("Authorization", "Bearer test")
    .send({ clientIds: ["alpha"], disabled: false });
  const admin = () => state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" });
  const missingAuth = () => state.authUser.mockRejectedValue({ code: "auth/user-not-found" });
  beforeEach(admin);

  it("deletes a client and its invitation hashes on a cold cache without touching other records", async () => {
    state.cold = true;
    state.data["clientPortalInvitationHashes/own"] = client.uid;
    state.data["clientPortalInvitationHashes/other"] = "another-client";
    const tasksBefore = structuredClone(state.data["clientLogs/alpha"]);
    expect((await remove()).body).toEqual({ deleted: true });
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(client.uid);
    expect(state.data["clientPortalUsers/client-a"]).toBeNull();
    expect(state.data["clientPortalInvitationHashes/own"]).toBeNull();
    expect(state.data["clientPortalInvitationHashes/other"]).toBe("another-client");
    expect(state.data["clientLogs/alpha"]).toEqual(tasksBefore);
    expect([...state.retained.values()].every(listeners => listeners.size === 0)).toBe(true);
  });

  it("still rejects a real membership identity change and releases its listener", async () => {
    state.cold = true;
    state.transaction.mockImplementationOnce(() => {
      state.data["clientPortalUsers/client-a"] = { ...state.data["clientPortalUsers/client-a"], email: "replacement@example.test" };
    });
    expect((await remove()).status).toBe(409);
    expect(state.deleteUser).not.toHaveBeenCalled();
    expect(state.data["clientPortalUsers/client-a"].email).toBe("replacement@example.test");
    expect([...state.retained.values()].every(listeners => listeners.size === 0)).toBe(true);
  });

  it("releases the retained membership on Auth failure and keeps access blocked", async () => {
    state.cold = true;
    state.deleteUser.mockRejectedValueOnce(new Error("Auth offline"));
    expect((await remove()).status).toBe(503);
    expect(state.data["clientPortalUsers/client-a"]).toMatchObject({ disabled: true, deletionInProgress: true });
    expect([...state.retained.values()].every(listeners => listeners.size === 0)).toBe(true);
  });

  it("does not remove an invitation hash reassigned before cleanup", async () => {
    state.cold = true;
    state.data["clientPortalInvitationHashes/own"] = client.uid;
    state.transaction.mockImplementation((path: string) => {
      if (path === "clientPortalInvitationHashes/own") state.data[path] = "another-client";
    });
    expect((await remove()).body).toEqual({ deleted: true });
    expect(state.data["clientPortalInvitationHashes/own"]).toBe("another-client");
    expect([...state.retained.values()].every(listeners => listeners.size === 0)).toBe(true);
  });

  it("requires authentication and rejects clients and non-admin staff", async () => {
    expect((await request(app).delete(`${api}/admin/users/client-a`)).status).toBe(401);
    state.verify.mockResolvedValue(client);
    expect((await remove()).status).toBe(403);
    state.verify.mockResolvedValue({ uid: "staff", email: "staff@ethinos.com" });
    state.data.users[0].role = "Employee";
    expect((await remove()).status).toBe(403);
    expect(state.deleteUser).not.toHaveBeenCalled();
    expect(state.data["clientPortalUsers/client-a"].disabled).toBe(false);
  });

  it.each(["bad.uid", "bad%2Fuid", "x".repeat(129)])("rejects invalid UID %s", async uid => {
    expect((await remove(uid)).status).toBe(400);
    expect(state.deleteUser).not.toHaveBeenCalled();
  });

  it.each(["domain", "membership-domain", "role", "claims", "directory-email", "directory-key", "directory-uid", "directory-id"])(
    "protects staff identity via %s", async collision => {
      if (collision === "domain") state.authUser.mockResolvedValue({ uid: client.uid, email: "staff@ethinos.com" });
      if (collision === "membership-domain") state.data["clientPortalUsers/client-a"].email = "staff@ethinos.com";
      if (collision === "role") state.data["userRoles/client-a"] = "Employee";
      if (collision === "claims") state.authUser.mockResolvedValue({ uid: client.uid, email: client.email, customClaims: { admin: true } });
      if (collision === "directory-email") state.data.users.push({ email: client.email });
      if (collision === "directory-key") state.data.users = { ...state.data.users, "client-a": { email: "different@example.test" } };
      if (collision === "directory-uid") state.data.users.push({ uid: client.uid });
      if (collision === "directory-id") state.data.users.push({ id: client.uid });
      expect((await remove()).status).toBe(403);
      expect(state.deleteUser).not.toHaveBeenCalled();
      expect(state.data["clientPortalUsers/client-a"].disabled).toBe(false);
    },
  );

  it("will not delete an unmanaged Auth identity", async () => {
    delete state.data["clientPortalUsers/client-a"];
    expect((await remove()).status).toBe(404);
    expect(state.deleteUser).not.toHaveBeenCalled();
  });

  it("permanently removes login/membership/all UID hashes, preserves all client work and blocks old sessions", async () => {
    state.data["clientPortalInvitationHashes/old"] = client.uid;
    state.data["clientPortalInvitationHashes/latest"] = client.uid;
    state.data["clientPortalInvitationHashes/other"] = "other-client";
    state.data["creativeStudio"] = { assets: { a: { creatorId: client.uid } }, history: ["retained"] };
    const companies = structuredClone(state.data.clients), tasks = structuredClone(state.data["clientLogs/alpha"]);
    const studio = structuredClone(state.data.creativeStudio);
    state.deleteUser.mockImplementationOnce(async () => {
      expect(state.data["clientPortalUsers/client-a"]).toMatchObject({ disabled: true, deletionInProgress: true });
      expect(membershipAllows(normalizeMembership(state.data["clientPortalUsers/client-a"]), client.email)).toBe(false);
    });
    expect((await remove()).body).toEqual({ deleted: true });
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(client.uid);
    expect(state.data["clientPortalUsers/client-a"]).toBeNull();
    expect(state.data["clientPortalInvitationHashes/old"]).toBeNull();
    expect(state.data["clientPortalInvitationHashes/latest"]).toBeNull();
    expect(state.data["clientPortalInvitationHashes/other"]).toBe("other-client");
    expect(state.data.clients).toEqual(companies);
    expect(state.data["clientLogs/alpha"]).toEqual(tasks);
    expect(state.data.creativeStudio).toEqual(studio);
    state.verify.mockResolvedValue(client); // Even a cached/otherwise valid old ID token has no access.
    expect((await get("/me")).status).toBe(403);
    expect((await get("/clients/alpha/tasks")).status).toBe(403);
    expect((await post("/clients/alpha/tasks", { title: "Blocked", description: "" })).status).toBe(403);
  });

  it("keeps a visible blocked record on Auth failure, prevents PATCH/resend/reinvite and allows deletion retry", async () => {
    state.deleteUser.mockRejectedValueOnce(new Error("Auth offline"));
    const failed = await remove();
    expect(failed.status).toBe(503);
    expect(failed.body.error).toMatch(/deletion failed.*retry/i);
    expect(failed.body.deleted).toBeUndefined();
    state.data.clientPortalUsers = { "client-a": state.data["clientPortalUsers/client-a"] };
    expect((await get("/admin/users")).body.users[0]).toMatchObject({ uid: client.uid, email: client.email, disabled: true });
    expect((await patch()).status).toBe(409);
    expect((await post("/admin/users/client-a/invite", {})).status).toBe(404);
    state.getUser.mockResolvedValue({ uid: client.uid, email: client.email });
    expect((await post("/admin/users", { email: client.email, clientIds: ["alpha"] })).status).toBe(409);
    expect((await remove()).body).toEqual({ deleted: true });
    expect(state.data["clientPortalUsers/client-a"]).toBeNull();
  });

  it("allows cleanup when Auth is already missing and idempotent repeated deletion", async () => {
    missingAuth();
    state.deleteUser.mockRejectedValue({ code: "auth/user-not-found" });
    state.data["clientPortalInvitationHashes/stale"] = client.uid;
    expect((await remove()).body).toEqual({ deleted: true });
    expect((await remove()).body).toEqual({ deleted: true });
    expect(state.data["clientPortalUsers/client-a"]).toBeNull();
    expect(state.data["clientPortalInvitationHashes/stale"]).toBeNull();
  });

  it.each(["hash", "membership"])("retains the blocked record and retries %s cleanup failures", async phase => {
    state.data["clientPortalInvitationHashes/stale"] = client.uid;
    let memberTransactions = 0;
    state.transaction.mockImplementation(async (path: string) => {
      if ((phase === "hash" && path === "clientPortalInvitationHashes/stale") ||
          (phase === "membership" && path === "clientPortalUsers/client-a" && ++memberTransactions === 2))
        throw new Error("Database offline");
    });
    const failed = await remove();
    expect(failed.status).toBe(503);
    expect(failed.body.error).toMatch(/cleanup failed/i);
    expect(state.data["clientPortalUsers/client-a"]).toMatchObject({ deletionInProgress: true, disabled: true });
    expect((await patch()).status).toBe(409);
    state.transaction.mockReset();
    missingAuth();
    state.deleteUser.mockRejectedValue({ code: "auth/user-not-found" });
    expect((await remove()).body).toEqual({ deleted: true });
    expect(state.data["clientPortalUsers/client-a"]).toBeNull();
    expect(state.data["clientPortalInvitationHashes/stale"]).toBeNull();
  });

  it("permits a fresh invitation/account for the same email after successful deletion", async () => {
    expect((await remove()).status).toBe(200);
    state.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    state.createUser.mockResolvedValue({ uid: "fresh-client", email: client.email, disabled: false });
    state.authUser.mockResolvedValue({ uid: "fresh-client", email: client.email, disabled: false });
    const invited = await post("/admin/users", { email: client.email, clientIds: ["alpha"] });
    expect(invited.status).toBe(201);
    expect(invited.body.invitationSent).toBe(true);
    expect(state.data["clientPortalUsers/fresh-client"]).toMatchObject({ email: client.email, onboardingRequired: true });
    expect(state.data["clientPortalUsers/client-a"]).toBeNull();
  });

  it("invalidates pending tokens before deleting Auth, including when Auth deletion fails", async () => {
    await post("/admin/users/client-a/invite", {});
    const token = state.mail.mock.calls.at(-1)![0].bodyHtml.match(/#invite=([A-Za-z0-9_-]{43})/)![1];
    state.deleteUser.mockRejectedValueOnce(new Error("Auth offline"));
    expect((await remove()).status).toBe(503);
    expect(state.data["clientPortalUsers/client-a"].invitation).toMatchObject({ status: "revoked" });
    for (const action of ["inspect", "accept"])
      expect((await request(app).post(`${api}/invitations/${action}`).send({ token })).status).toBe(400);
    expect(state.updateUser).not.toHaveBeenCalled();
    expect((await remove()).status).toBe(200);
  });

  it("revokes processing acceptance so an in-flight Auth update cannot restore membership", async () => {
    state.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"] });
    const token = state.mail.mock.calls.at(-1)![0].bodyHtml.match(/#invite=([A-Za-z0-9_-]{43})/)![1];
    let release!: () => void, started!: () => void;
    const updating = new Promise<void>(resolve => { started = resolve; });
    state.updateUser.mockImplementationOnce(() => { started(); return new Promise<void>(resolve => { release = resolve; }); });
    const accepting = request(app).post(`${api}/invitations/accept`).send({ token, password: "secure-long-password" }).then(r => r);
    await updating;
    state.deleteUser.mockImplementationOnce(async () => {
      expect(state.data["clientPortalUsers/new-client"].invitation).toMatchObject({ status: "revoked", claim: null });
    });
    expect((await remove("new-client")).status).toBe(200);
    release();
    expect((await accepting).status).toBe(400);
    expect(state.data["clientPortalUsers/new-client"]).toBeNull();
  });

  it("blocks a resend which read membership before deletion started", async () => {
    let started!: () => void, release!: () => void;
    const checked = new Promise<void>(resolve => { started = resolve; });
    state.authUser.mockImplementationOnce(async () => {
      started();
      await new Promise<void>(resolve => { release = resolve; });
      return { uid: client.uid, email: client.email, disabled: false };
    });
    const resending = post("/admin/users/client-a/invite", {}).then(r => r);
    await checked;
    expect((await remove()).status).toBe(200);
    release();
    expect((await resending).status).toBe(409);
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.data["clientPortalUsers/client-a"]).toBeNull();
  });

  it("cleans a late invitation hash write racing deletion without delivering the token", async () => {
    let started!: () => void, release!: () => void;
    const writingHash = new Promise<void>(resolve => { started = resolve; });
    state.set.mockImplementationOnce(() => { started(); return new Promise<void>(resolve => { release = resolve; }); });
    const resending = post("/admin/users/client-a/invite", {}).then(r => r);
    await writingHash;
    expect((await remove()).status).toBe(200);
    release();
    expect((await resending).status).toBe(400);
    expect(state.mail).not.toHaveBeenCalled();
    expect(Object.entries(state.data).filter(([key, value]) => key.startsWith("clientPortalInvitationHashes/") && value === client.uid)).toEqual([]);
  });

  it("blocks a PATCH which loaded the membership before deletion started", async () => {
    let started!: () => void, release!: () => void;
    const patchLoaded = new Promise<void>(resolve => { started = resolve; });
    state.transaction.mockImplementationOnce(() => { started(); return new Promise<void>(resolve => { release = resolve; }); });
    const changing = patch().then(r => r);
    await patchLoaded;
    state.deleteUser.mockRejectedValueOnce(new Error("Auth offline"));
    expect((await remove()).status).toBe(503);
    release();
    expect((await changing).status).toBe(409);
    expect(state.data["clientPortalUsers/client-a"]).toMatchObject({ deletionInProgress: true, disabled: true });
  });
});

describe("single-link mailbox onboarding", () => {
  const publicPost = (path: string, body: object) => request(app).post(`${api}/invitations/${path}`).send(body);
  const tokenFromEmail = () => state.mail.mock.calls.at(-1)![0].bodyHtml.match(/#invite=([A-Za-z0-9_-]{43})/)![1];
  async function invite(created = true) {
    state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" });
    if (created) state.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    const response = await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"] });
    expect(response.status).toBe(201);
    return tokenFromEmail();
  }
  it("sends and accepts an invitation with a cold cache without leaking retained listeners", async () => {
    state.cold = true;
    const token = await invite();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect((await publicPost("accept", { token, password: "secure-long-password" })).status).toBe(200);
    expect([...state.retained.values()].every(listeners => listeners.size === 0)).toBe(true);
  });
  it("resends a revoked invitation and revokes the replacement with a cold cache", async () => {
    await invite();
    state.cold = true;
    expect((await post("/admin/users/new-client/invite/revoke", {})).status).toBe(200);
    expect((await post("/admin/users/new-client/invite", {})).status).toBe(200);
    expect(state.mail).toHaveBeenCalledTimes(2);
    expect([...state.retained.values()].every(listeners => listeners.size === 0)).toBe(true);
  });
  it.each([
    ["Failed to send email via Microsoft Graph: 403 SECRET_RESPONSE", 503, /denied email sending/i],
    ["Failed to send email via Microsoft Graph: 404 SECRET_RESPONSE", 503, /sender mailbox/i],
    ["Failed to send email via Microsoft Graph: 429 SECRET_RESPONSE", 429, /temporarily limited/i],
    ["Failed to get Microsoft Graph token: 401 SECRET_RESPONSE", 503, /authentication failed on this server/i],
    ["Transport lost SECRET_RESPONSE", 503, /could not be confirmed/i],
  ])("reports a safe actionable invitation delivery failure for %s", async (message, status, expected) => {
    await invite();
    state.cold = true;
    state.mail.mockRejectedValueOnce(new Error(message));
    const result = await post("/admin/users/new-client/invite", {});
    expect(result.status).toBe(status);
    expect(result.body.error).toMatch(expected);
    expect(JSON.stringify(result.body)).not.toContain("SECRET_RESPONSE");
    expect(state.data["clientPortalUsers/new-client"].invitation.status).toBe("revoked");
    expect(Object.entries(state.data).filter(([key, value]) => key.startsWith("clientPortalInvitationHashes/") && value === "new-client")).toHaveLength(1);
    // The original invitation hash may remain indexed, but it no longer resolves
    // to a usable invitation. The failed replacement is removed.
    expect([...state.retained.values()].every(listeners => listeners.size === 0)).toBe(true);
  });
  it("reports the resend limit instead of a misleading email delivery error", async () => {
    await invite();
    for (let count = 0; count < 4; count++) expect((await post("/admin/users/new-client/invite", {})).status).toBe(200);
    const blocked = await post("/admin/users/new-client/invite", {});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/resend limit/i);
    expect(state.mail).toHaveBeenCalledTimes(5);
  });
  it("inspects without a session, stores only hashes, and blocks pending task access", async () => {
    const token = await invite();
    const res = await publicPost("inspect", { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "new@example.test", requiresSignIn: false, clientNames: ["Alpha"] });
    expect(res.body.expiresAt).toBeGreaterThan(Date.now() + 6.99 * 86400000);
    expect(JSON.stringify(state.data)).not.toContain(token);
    state.verify.mockResolvedValue({ uid: "new-client", email: "new@example.test", email_verified: true });
    expect((await get("/me")).status).toBe(403);
    expect((await get("/clients/alpha/tasks")).status).toBe(403);
    expect((await post("/clients/alpha/tasks", { title: "No access", description: "" })).status).toBe(403);
  });
  it("accepts a new precreated account, verifies mailbox, sets name/password once and rejects replay", async () => {
    const token = await invite();
    expect((await publicPost("accept", { token, password: "short" })).status).toBe(400);
    expect(state.updateUser).not.toHaveBeenCalled();
    const res = await publicPost("accept", { token, displayName: " New Client ", password: "secure-long-password" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: true, email: "new@example.test" });
    expect(state.updateUser).toHaveBeenCalledWith("new-client", {
      emailVerified: true, displayName: "New Client", password: "secure-long-password",
    });
    expect((await publicPost("accept", { token, password: "another-password" })).status).toBe(400);
    expect((await publicPost("inspect", { token })).status).toBe(400);
    expect(state.updateUser).toHaveBeenCalledTimes(1);
    state.verify.mockResolvedValue({ uid: "new-client", email: "new@example.test", email_verified: true });
    expect((await get("/me")).status).toBe(200);
  });
  it("rejects an unrelated signed-in identity even for new precreated invitations", async () => {
    const token = await invite();
    state.verify.mockResolvedValue(client);
    expect((await post("/invitations/accept", { token, password: "secure-long-password" })).status).toBe(403);
    expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("requires same UID AND email for existing identities and never resets their password/name", async () => {
    const token = await invite(false);
    expect((await publicPost("inspect", { token })).body.requiresSignIn).toBe(true);
    expect((await publicPost("accept", { token })).status).toBe(401);
    state.verify.mockResolvedValue({ uid: "wrong", email: "new@example.test" });
    expect((await post("/invitations/accept", { token })).status).toBe(403);
    state.verify.mockResolvedValue({ uid: "new-client", email: "wrong@example.test" });
    expect((await post("/invitations/accept", { token })).status).toBe(403);
    state.verify.mockResolvedValue({ uid: "new-client", email: "new@example.test" });
    expect((await post("/invitations/accept", { token, password: "must-not-reset" })).status).toBe(400);
    expect((await post("/invitations/accept", { token, displayName: "Cannot change" })).status).toBe(400);
    expect((await post("/invitations/accept", { token })).status).toBe(200);
    expect(state.updateUser).toHaveBeenCalledExactlyOnceWith("new-client", { emailVerified: true });
  });
  it.each(["expired", "revoked", "accepted"])("rejects %s invitations", async status => {
    const token = await invite();
    const invitation = state.data["clientPortalUsers/new-client"].invitation;
    if (status === "expired") invitation.expiresAt = Date.now() - 1;
    else invitation.status = status;
    expect((await publicPost("inspect", { token })).status).toBe(400);
    expect((await publicPost("accept", { token, password: "secure-long-password" })).status).toBe(400);
    expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("resend invalidates previous token, and revoke never removes accepted membership access", async () => {
    const first = await invite();
    expect((await post("/admin/users/new-client/invite", {})).status).toBe(200);
    const second = tokenFromEmail();
    expect(second).not.toBe(first);
    expect((await publicPost("inspect", { token: first })).status).toBe(400);
    expect((await post("/admin/users/new-client/invite/revoke", {})).status).toBe(200);
    expect((await publicPost("inspect", { token: second })).status).toBe(400);
    await post("/admin/users/new-client/invite", {});
    await publicPost("accept", { token: tokenFromEmail(), password: "secure-long-password" });
    expect((await post("/admin/users/new-client/invite/revoke", {})).status).toBe(409);
    expect(state.data["clientPortalUsers/new-client"].invitation.status).toBe("accepted");
  });
  it("reports expired status in admin listing", async () => {
    await invite();
    state.data["clientPortalUsers/new-client"].invitation.expiresAt = Date.now() - 1;
    state.data.clientPortalUsers = { "new-client": state.data["clientPortalUsers/new-client"] };
    const res = await get("/admin/users");
    expect(res.body.users[0].invitationStatus).toBe("expired");
    expect(res.body.users[0].invitationExpiresAt).toBeTypeOf("number");
    expect(JSON.stringify(res.body)).not.toMatch(/tokenHash|invitationIdentityCreated|onboardingRequired/);
  });
  it("revokes undelivered invitation and retains zero-access membership", async () => {
    state.mail.mockRejectedValue(new Error("delivery failed"));
    state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" });
    const res = await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"] });
    expect(res.body.invitationSent).toBe(false);
    const token = tokenFromEmail();
    expect((await publicPost("inspect", { token })).status).toBe(400);
    expect(membershipAllows(normalizedNew(), "new@example.test", "alpha")).toBe(false);
  });
  const normalizedNew = () => normalizeMembership(state.data["clientPortalUsers/new-client"]);
  it("denies disabled auth and membership and newly colliding staff roles", async () => {
    const token = await invite();
    state.authUser.mockResolvedValue({ uid: "new-client", email: "new@example.test", disabled: true });
    expect((await publicPost("accept", { token, password: "secure-long-password" })).status).toBe(403);
    state.authUser.mockResolvedValue({ uid: "new-client", email: "new@example.test" });
    state.data["userRoles/new-client"] = "Employee";
    expect((await publicPost("inspect", { token })).status).toBe(403);
    delete state.data["userRoles/new-client"];
    state.data["clientPortalUsers/new-client"].disabled = true;
    expect((await publicPost("accept", { token, password: "secure-long-password" })).status).toBe(400);
    expect(state.updateUser).not.toHaveBeenCalled();
  });
  it("rejects external-email staff-directory identity collisions", async () => {
    state.data.users.push({ email: "new@example.test", role: "Employee" });
    state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" });
    expect((await post("/admin/users", { email: "new@example.test", clientIds: ["alpha"] })).status).toBe(409);
    expect(state.data["clientPortalUsers/new-client"]).toBeUndefined();
    expect(state.mail).not.toHaveBeenCalled();
  });
  it("allows only one simultaneous acceptance", async () => {
    const token = await invite();
    const results = await Promise.all([publicPost("accept", { token, password: "secure-long-password" }),
      publicPost("accept", { token, password: "secure-long-password" })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    expect(state.updateUser).toHaveBeenCalledTimes(1);
  });
  it("allows only one simultaneous resend and invalidates the original token", async () => {
    const first = await invite();
    let reached = 0, release!: () => void;
    const bothReading = new Promise<void>(resolve => { release = resolve; });
    state.authUser.mockImplementation(async (uid: string) => {
      if (++reached === 2) release();
      await bothReading;
      return { uid, email: "new@example.test", disabled: false };
    });
    const results = await Promise.all([post("/admin/users/new-client/invite", {}), post("/admin/users/new-client/invite", {})]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await publicPost("inspect", { token: first })).status).toBe(400);
    expect((await publicPost("inspect", { token: tokenFromEmail() })).status).toBe(200);
  });
  it("fails closed if revoke races an Auth update; processing blocks resend", async () => {
    const token = await invite();
    let release!: () => void;
    let started!: () => void;
    const updating = new Promise<void>(resolve => { started = resolve; });
    state.updateUser.mockImplementationOnce(() => { started(); return new Promise<void>(resolve => { release = resolve; }); });
    const accepting = publicPost("accept", { token, password: "secure-long-password" }).then(r => r);
    await updating;
    expect((await post("/admin/users/new-client/invite", {})).status).toBe(409);
    expect((await post("/admin/users/new-client/invite/revoke", {})).status).toBe(200);
    release();
    expect((await accepting).status).toBe(400);
    expect(membershipAllows(normalizedNew(), "new@example.test", "alpha")).toBe(false);
  });
  it("burns tokens after partial Auth failures", async () => {
    const token = await invite();
    state.updateUser.mockRejectedValueOnce(new Error("Auth unavailable"));
    expect((await publicPost("accept", { token, password: "secure-long-password" })).status).toBe(500);
    expect((await publicPost("inspect", { token })).status).toBe(400);
    expect(membershipAllows(normalizedNew(), "new@example.test", "alpha")).toBe(false);
  });
  it("does not activate access if expiry races the Auth update", async () => {
    const token = await invite();
    state.updateUser.mockImplementationOnce(async () => {
      state.data["clientPortalUsers/new-client"].invitation.expiresAt = Date.now() - 1;
    });
    expect((await publicPost("accept", { token, password: "secure-long-password" })).status).toBe(400);
    expect(membershipAllows(normalizedNew(), "new@example.test", "alpha")).toBe(false);
  });
  it("never offers a password reset when resending to an accepted newly created identity", async () => {
    const token = await invite();
    await publicPost("accept", { token, password: "secure-long-password" });
    expect((await post("/admin/users/new-client/invite", {})).status).toBe(200);
    const next = tokenFromEmail();
    expect((await publicPost("inspect", { token: next })).body.requiresSignIn).toBe(true);
    expect((await publicPost("accept", { token: next, password: "must-not-reset-password" })).status).toBe(401);
    expect(state.updateUser).toHaveBeenCalledTimes(1);
  });
  it("rate limits public endpoints without logging or storing raw input", async () => {
    for (let i = 0; i < 30; i++) expect((await publicPost("inspect", { token: "invalid" })).status).toBe(400);
    expect((await publicPost("inspect", { token: "invalid" })).status).toBe(429);
    expect(state.updateUser).not.toHaveBeenCalled();
  });
});

describe("portal policy invariants", () => {
  it("normalizes array and keyed client collections and excludes synthetic clients", () => {
    expect(clientDirectory({ a: { id: 123, name: "Client" }, b: { id: "__personal__", name: "Private" } })).toEqual([{ id: "123", name: "Client" }]);
    expect(membershipAllows(membership, "other@example.test", "alpha")).toBe(false);
  });
  it("keeps memberships server-only and excludes portal UIDs from every existing rule grant", () => {
    const { rules } = JSON.parse(readFileSync(new URL("../../../../database.rules.json", import.meta.url), "utf8"));
    expect(rules[".read"]).toBe(false);
    expect(rules[".write"]).toBe(false);
    expect(rules.clientPortalUsers).toEqual({ ".read": false, ".write": false });
    const visit = (value: any) => {
      for (const [key, child] of Object.entries(value)) {
        if ((key === ".read" || key === ".write") && typeof child === "string") {
          expect(child).toContain("!root.child('clientPortalUsers').child(auth.uid).exists()");
        } else if (child && typeof child === "object") visit(child);
      }
    };
    visit(rules);
    // Static policy regression check; not a substitute for emulator/deployed-rule validation.
  });
});
