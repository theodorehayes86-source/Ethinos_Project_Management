import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { clientDirectory, membershipAllows, projectClientTask } from "../lib/client-portal";

const state = vi.hoisted(() => ({
  data: {} as Record<string, any>,
  writes: [] as string[],
  reads: [] as string[],
  verify: vi.fn(),
  mail: vi.fn(),
  revoke: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("../lib/firebase-admin", () => {
  const ref = (path: string): any => ({
    key: path.split("/").at(-1),
    once: async () => {
      state.reads.push(path);
      return { val: () => state.data[path] ?? null, exists: () => state.data[path] != null };
    },
    orderByChild: () => ({ equalTo: () => ref(path) }),
    push: () => ref(`${path}/new-task`),
    update: async (value: any) => { state.writes.push(path); state.data[path] = { ...state.data[path], ...value }; },
    transaction: async (fn: (current: any) => any) => {
      const value = fn(state.data[path] ?? null);
      if (value === undefined) return { committed: false };
      state.data[path] = value; return { committed: true };
    },
  });
  return {
    getAdminDatabase: () => ({ ref }),
    getAdminAuth: () => ({
      verifyIdToken: state.verify, getUserByEmail: state.getUser, createUser: state.createUser,
      revokeRefreshTokens: state.revoke,
      generatePasswordResetLink: async () => "https://example.test/password",
      generateEmailVerificationLink: async () => "https://example.test/verify",
    }),
  };
});
vi.mock("../lib/microsoft-graph", () => ({
  sendEmail: state.mail, isEmailConfigured: () => true,
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
});

describe("client task API boundary", () => {
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
    }] });
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|PRIVATE|HIDDEN/);
  });
  it("does not fall back to internal descriptions", () => {
    expect(projectClientTask("a", { name: "A", visibility: "client", comment: "secret" })?.description).toBe("");
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
    expect(Object.keys(res.body.task).sort()).toEqual(["description", "dueDate", "id", "status", "title"]);
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
  it("denies edits and deletion", async () => {
    expect((await request(app).patch(`${api}/clients/alpha/tasks/shared`).set("Authorization", "Bearer test").send({ status: "Done" })).status).toBe(403);
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

describe("admin invitations and access lifecycle", () => {
  beforeEach(() => { state.verify.mockResolvedValue({ uid: "admin", email: "admin@ethinos.com" }); });
  it("lists and re-enables memberships whose empty clientIds array was removed by RTDB", async () => {
    const cleared = { email: client.email, disabled: true }; // Actual RTDB representation, NOT [].
    state.data.clientPortalUsers = { "client-a": cleared };
    state.data["clientPortalUsers/client-a"] = cleared;
    const listed = await get("/admin/users");
    expect(listed.status).toBe(200);
    expect(listed.body.users).toEqual([{ uid: "client-a", email: client.email, disabled: true, clientIds: [] }]);
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
  it("creates a separate membership and sends verification/password links", async () => {
    const res = await post("/admin/users", { email: "new@example.test", clientIds: ["alpha", "beta"] });
    expect(res.status).toBe(201);
    expect(res.body.invitationSent).toBe(true);
    expect(state.writes).toEqual(["clientPortalUsers/new-client"]);
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("https://example.test/verify");
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("https://example.test/password");
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
