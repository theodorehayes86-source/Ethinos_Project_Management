import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  data: {} as Record<string, any>, identity: {} as Record<string, any>,
  reads: [] as string[], writes: [] as string[],
  verify: vi.fn(), authUser: vi.fn(), mail: vi.fn(),
  beforeTransaction: vi.fn(), retry: vi.fn(),
  beforeUpdate: vi.fn(), log: vi.fn(), configured: true,
  teamsConfigured: true, teams: vi.fn(), resolveEntra: vi.fn(),
  coldPaths: new Set<string>(),
  retained: new Map<string, Set<() => void>>(),
  firstNulls: [] as string[],
}));
function valueAt(path: string) {
  return path.split("/").reduce((value: any, key) => value?.[key], state.data) ?? null;
}
function saveAt(path: string, value: any) {
  const keys = path.split("/");
  let node = state.data;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = structuredClone(value);
}
vi.mock("../lib/firebase-admin", () => {
  const ref = (path: string): any => ({
    key: path.split("/").at(-1),
    on: (_event: string, listener: () => void) => {
      const listeners = state.retained.get(path) ?? new Set();
      listeners.add(listener);
      state.retained.set(path, listeners);
      listener();
    },
    off: (_event: string, listener: () => void) => {
      state.retained.get(path)?.delete(listener);
    },
    update: async (value: Record<string, any>) => {
      await state.beforeUpdate(path, value);
      state.writes.push(path);
      saveAt(path, { ...valueAt(path), ...value });
    },
    once: async () => {
      state.reads.push(path);
      const value = structuredClone(valueAt(path));
      return { val: () => value, exists: () => value !== null };
    },
    transaction: async (fn: (current: any) => any) => {
      await state.beforeTransaction(path);
      if (state.coldPaths.has(path) && !state.retained.get(path)?.size) {
        state.firstNulls.push(path);
        const first = fn(null);
        // Returning undefined on an initial uncached null aborts immediately;
        // returning a proposed create retries against the actual server value.
        if (first === undefined) return { committed: false, snapshot: { val: () => valueAt(path) } };
      }
      const version = JSON.stringify(valueAt(path));
      let value = fn(structuredClone(valueAt(path)));
      // A Firebase retry discards the first callback result and supplies live data.
      if (await state.retry(path) || JSON.stringify(valueAt(path)) !== version) {
        value = fn(structuredClone(valueAt(path)));
      }
      if (value === undefined) return { committed: false, snapshot: { val: () => valueAt(path) } };
      state.writes.push(path);
      saveAt(path, value);
      return { committed: true, snapshot: { val: () => structuredClone(value) } };
    },
  });
  return { getAdminDatabase: () => ({ ref }), getAdminAuth: () => ({
    verifyIdToken: state.verify, getUser: state.authUser,
  }) };
});
vi.mock("../lib/microsoft-graph", () => ({
  sendEmail: state.mail, isEmailConfigured: () => state.configured,
  isTeamsConfigured: () => state.teamsConfigured, resolveEntraObjectId: state.resolveEntra,
  sendTeamsActivityNotification: state.teams,
}));
vi.mock("../lib/logger", () => ({ logger: { warn: state.log, error: state.log } }));
import portalRouter from "../routes/client-portal";
import { getAdminDatabase } from "../lib/firebase-admin";
import { sendClientTaskUpdateEmail, type ClientTaskUpdateEvent } from "../lib/client-task-update-email";

const app = express();
app.use(express.json());
app.use("/api/client-portal", portalRouter);
const base = "/api/client-portal/clients/alpha/tasks/stable-key/collaboration";
const storage = "clientTaskCollaboration/alpha/stable-key";
const parent = "clientLogs/alpha/stable-key";
const uuid = "12345678-1234-4123-8123-123456789abc";
const uuid2 = "12345678-1234-4123-8123-123456789abd";
const client = { uid: "client-a", email: "client@example.test", email_verified: true };
const staff = { uid: "staff-a", email: "staff@ethinos.com", email_verified: true };
const get = (url = base) => request(app).get(url).set("Authorization", "Bearer test");
const post = (suffix: string, body: object, url = base) =>
  request(app).post(`${url}/${suffix}`).set("Authorization", "Bearer test").send(body);
const patch = (id: string, body: object, url = base) =>
  request(app).patch(`${url}/subtasks/${id}`).set("Authorization", "Bearer test").send(body);
const message = (requestId = uuid, text = "Client feedback") => ({ type: "message", text, requestId });
const subtask = (requestId = uuid, title = "Check design") => ({ title, requestId });

beforeEach(() => {
  vi.clearAllMocks();
  state.beforeTransaction.mockReset();
  state.retry.mockReset();
  state.beforeUpdate.mockReset();
  state.mail.mockReset().mockResolvedValue(undefined);
  state.configured = true;
  state.teamsConfigured = true;
  state.teams.mockReset().mockResolvedValue({ ok: true });
  state.resolveEntra.mockReset().mockResolvedValue("entra-object-id");
  state.data = {
    clients: { alpha: { id: "alpha", name: "Alpha", ownerIds: ["owner"] }, beta: { id: "beta", name: "Beta" } },
    clientPortalUsers: { "client-a": { email: client.email, disabled: false, clientIds: ["alpha"] } },
    users: { staffKey: { id: "staff-id", email: staff.email, name: "Assigned Staff", role: "Employee", assignedProjects: ["Alpha"] } },
    clientLogs: { alpha: { "stable-key": {
      id: "different-mutable-id", clientId: "alpha", name: "Shared task", taskType: "task", visibility: "client",
      messages: { secret: { text: "INTERNAL_MESSAGE" } }, steps: ["INTERNAL_STEP"], links: ["https://internal.test"],
      comment: "INTERNAL_COMMENT", description: "INTERNAL_DESCRIPTION", elapsedMs: 1234,
    } } },
  };
  state.identity = { ...client };
  state.reads = []; state.writes = [];
  state.coldPaths.clear(); state.retained.clear(); state.firstNulls = [];
  state.verify.mockImplementation(async () => state.identity);
  state.authUser.mockImplementation(async (uid: string) => ({
    uid, email: state.identity.email, emailVerified: true, disabled: false, displayName: "Client Name",
  }));
});

describe("shared-task collaboration privacy and scope", () => {
  it("returns only separate collaboration records, never internal messages/steps/links", async () => {
    const original = structuredClone(valueAt(parent));
    expect((await get()).body).toEqual({ entries: [], subtasks: [] });
    const entry = (await post("entries", message())).body.entry;
    expect(entry).toEqual({ id: expect.stringMatching(/^[a-f0-9]{64}$/), type: "message", text: "Client feedback",
      url: null, authorName: "Client Name", createdAt: expect.any(Number) });
    expect((await get()).body).toEqual({ entries: [entry], subtasks: [] });
    expect(valueAt(parent)).toEqual(original);
    expect(JSON.stringify((await get()).body)).not.toMatch(/INTERNAL|authorUid|requestId|fingerprint|example.test|client-a|staff-a/);
    expect(state.writes.every(path => path.startsWith("clientTaskCollaboration/") || path.startsWith("rateLimits/"))).toBe(true);
    expect(state.mail).not.toHaveBeenCalled();
  });
  it.each(["note", "message", "link"])("adds a %s as plain text, never fetches a URL", async type => {
    const body = { type, text: "<b>Plain text</b>", requestId: uuid,
      ...(type === "link" ? { url: "http://example.test/resource" } : {}) };
    const res = await post("entries", body);
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ type, text: body.text, url: type === "link" ? body.url : null });
  });
  it("allows a link without a caption", async () => {
    const res = await post("entries", { type: "link", text: "", url: "https://example.test", requestId: uuid });
    expect(res.status).toBe(201);
    expect(res.body.entry.url).toBe("https://example.test/");
  });
  it("requires authentication and checks Firebase token revocation", async () => {
    expect((await request(app).get(base)).status).toBe(401);
    state.verify.mockRejectedValueOnce(new Error("revoked"));
    expect((await get()).status).toBe(401);
    expect(state.verify).toHaveBeenCalledWith("test", true);
    expect(state.writes).toEqual([]);
  });
  it.each(["unverified-token", "unverified-auth", "disabled-auth", "missing-auth", "email-change", "disabled-member",
    "removed-member", "revoked-invitation", "wrong-email", "no-assignment", "personal", "archived-client"])(
    "rejects %s before collaboration data access", async mode => {
      let url = base;
      if (mode === "unverified-token") state.identity.email_verified = false;
      if (mode === "unverified-auth") state.authUser.mockResolvedValue({ email: client.email, emailVerified: false });
      if (mode === "disabled-auth") state.authUser.mockResolvedValue({ email: client.email, emailVerified: true, disabled: true });
      if (mode === "missing-auth") state.authUser.mockRejectedValue({ code: "auth/user-not-found" });
      if (mode === "email-change") state.authUser.mockResolvedValue({ email: "other@example.test", emailVerified: true });
      if (mode === "disabled-member") state.data.clientPortalUsers["client-a"].disabled = true;
      if (mode === "removed-member") delete state.data.clientPortalUsers["client-a"];
      if (mode === "revoked-invitation") Object.assign(state.data.clientPortalUsers["client-a"], {
        onboardingRequired: true, invitation: { status: "revoked" },
      });
      if (mode === "wrong-email") state.data.clientPortalUsers["client-a"].email = "other@example.test";
      if (mode === "no-assignment") state.data.clientPortalUsers["client-a"].clientIds = ["beta"];
      if (mode === "personal") url = base.replace("/alpha/", "/__personal__/");
      if (mode === "archived-client") state.data.clients.alpha.archived = true;
      expect((await get(url)).status).toBe(403);
      expect((await post("entries", message(), url)).status).toBe(403);
      expect((await post("subtasks", subtask(), url)).status).toBe(403);
      expect((await patch("some-id", { completed: true }, url)).status).toBe(403);
      expect(state.reads).not.toContain(storage);
      expect(state.writes).toEqual([]);
    },
  );
  it.each(["hidden", "archived", "checklist", "group", "group-type", "missing", "foreign", "mutable-id"])(
    "requires an ordinary currently shared stable parent: %s", async mode => {
      if (mode === "hidden") valueAt(parent).visibility = "internal";
      if (mode === "archived") valueAt(parent).archived = true;
      if (mode === "checklist") valueAt(parent).taskType = "checklist";
      if (mode === "group") valueAt(parent).taskGroupId = "group";
      if (mode === "group-type") valueAt(parent).taskType = "taskgroup";
      if (mode === "missing") saveAt(parent, null);
      if (mode === "foreign") valueAt(parent).clientId = "beta";
      const url = mode === "mutable-id" ? base.replace("stable-key", "different-mutable-id") : base;
      expect((await get(url)).status).toBe(404);
      expect((await post("entries", message(), url)).status).toBe(404);
      expect((await post("subtasks", subtask(), url)).status).toBe(404);
      expect((await patch("some-id", { completed: true }, url)).status).toBe(404);
      expect(state.writes).toEqual([]);
    },
  );
  it("shares the same conversation with assigned active staff in both directions", async () => {
    const clientEntry = (await post("entries", message())).body.entry;
    state.identity = { ...staff };
    expect((await get()).body.entries).toEqual([clientEntry]);
    const staffEntry = (await post("entries", message(uuid2, "Staff response"))).body.entry;
    expect(staffEntry.authorName).toBe("Assigned Staff");
    state.identity = { ...client };
    expect((await get()).body.entries).toEqual(expect.arrayContaining([clientEntry, staffEntry]));
  });
  it.each(["Admin", "Super Admin", "Business Head", "BH", "CSM"])("permits authorized %s", async role => {
    state.identity = { ...staff };
    Object.assign(state.data.users.staffKey, { id: "owner", role, assignedProjects: [] });
    expect((await post("entries", message())).status).toBe(201);
  });
  it.each(["unassigned", "disabled", "inactive", "archived", "missing", "wrong-owner", "domain-only", "portal-collision"])(
    "denies staff %s rather than relying on email domain", async mode => {
      state.identity = { ...staff };
      if (mode === "unassigned") state.data.users.staffKey.assignedProjects = ["Beta"];
      if (mode === "disabled") state.data.users.staffKey.disabled = true;
      if (mode === "inactive") state.data.users.staffKey.active = false;
      if (mode === "archived") state.data.users.staffKey.archived = true;
      if (mode === "missing" || mode === "domain-only") state.data.users = {};
      if (mode === "wrong-owner") Object.assign(state.data.users.staffKey, { role: "CSM", assignedProjects: [] });
      if (mode === "portal-collision") state.data.clientPortalUsers[staff.uid] = { email: staff.email, disabled: false, clientIds: ["alpha"] };
      expect((await get()).status).toBe(403);
      expect((await post("entries", message())).status).toBe(403);
      expect(state.writes).toEqual([]);
    },
  );
  it("does not expose email-shaped display names", async () => {
    state.authUser.mockResolvedValue({ email: client.email, emailVerified: true, displayName: client.email });
    expect((await post("entries", message())).body.entry.authorName).toBe("Client");
  });
  it("rechecks parent sharing and account membership before returning a read", async () => {
    await post("entries", message());
    let count = 0;
    state.authUser.mockImplementation(async () => {
      if (++count === 2) valueAt(parent).visibility = "internal";
      return { email: client.email, emailVerified: true };
    });
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.body.entries).toBeUndefined();
  });
  it("rechecks membership and parent sharing just before writes", async () => {
    state.beforeTransaction.mockImplementation(async (path: string) => {
      if (path.startsWith("rateLimits/")) state.data.clientPortalUsers["client-a"].disabled = true;
    });
    expect((await post("entries", message())).status).toBe(403);
    expect(valueAt(storage)).toBeNull();
  });
  it("rechecks live staff project assignment before a write", async () => {
    state.identity = { ...staff };
    state.beforeTransaction.mockImplementation(async (path: string) => {
      if (path.startsWith("rateLimits/")) state.data.users.staffKey.assignedProjects = ["Beta"];
    });
    expect((await post("entries", message())).status).toBe(403);
    expect(valueAt(storage)).toBeNull();
  });
  it("does not let authorized staff read or respond to a hidden parent", async () => {
    await post("entries", message());
    state.identity = { ...staff };
    valueAt(parent).visibility = "internal";
    expect((await get()).status).toBe(404);
    expect((await post("entries", message(uuid2))).status).toBe(404);
    expect((await post("subtasks", subtask(uuid2))).status).toBe(404);
  });
  it("does not return collaboration data after an in-flight membership revocation", async () => {
    let calls = 0;
    state.authUser.mockImplementation(async () => {
      if (++calls === 3) state.data.clientPortalUsers["client-a"].disabled = true;
      return { email: client.email, emailVerified: true };
    });
    const res = await post("entries", message());
    expect(res.status).toBe(403);
    expect(res.body.entry).toBeUndefined();
  });
  it("explicitly denies direct Firebase access for clients AND staff", () => {
    const rules = JSON.parse(readFileSync(new URL("../../../../database.rules.json", import.meta.url), "utf8")).rules;
    const config = JSON.parse(readFileSync(new URL("../../../../firebase.json", import.meta.url), "utf8"));
    expect(config.database.rules).toBe("database.rules.json");
    expect(rules.clientTaskCollaboration).toEqual({ ".read": false, ".write": false });
    expect(rules.clientTaskUpdateEmailDeliveries).toEqual({ ".read": false, ".write": false });
    expect(rules.clientTaskUpdateTeamsDeliveries).toEqual({ ".read": false, ".write": false });
    // RTDB child denies cannot override an ancestor grant. This subtree is a
    // direct root child, and neither root grants nor root wildcards allow it.
    expect(rules[".read"]).toBe(false);
    expect(rules[".write"]).toBe(false);
    expect(Object.keys(rules).filter(key => key.startsWith("$"))).toEqual([]);
  });
});

describe("client task update email (mocked Microsoft Graph only)", () => {
  const event: ClientTaskUpdateEvent = { id: "test-event", actorUid: client.uid, at: 1700000000000,
    kind: "message", text: "Client feedback", url: null };
  const notify = (value = event) => sendClientTaskUpdateEmail("alpha", "stable-key", value);
  const ledgerRoot = "clientTaskUpdateEmailDeliveries/alpha/stable-key";
  const deliveries = () => Object.values(valueAt(ledgerRoot) ?? {}).flatMap(value =>
    Object.values(value as Record<string, any>)) as Record<string, any>[];
  const statusPatch = (status: string) => request(app).patch(base.replace("/collaboration", ""))
    .set("Authorization", "Bearer test").send({ status });
  beforeEach(() => {
    Object.assign(valueAt(parent), { assigneeId: "staff-id", status: "Pending", updatedAt: 123 });
    state.data.users.staffKey.email = "ASSIGNED@ethinos.com";
  });
  it.each(["message", "note", "link"])("emails the assigned staff about a client %s with escaped details", async type => {
    valueAt(parent).name = '<Task & "title">';
    state.data.clients.alpha.name = '<Client & "name">';
    state.authUser.mockResolvedValue({ email: client.email, emailVerified: true, displayName: '<Client "actor">' });
    const result = await post("entries", { ...message(), type, text: '<script>alert("x")</script> & details',
      ...(type === "link" ? { url: 'https://example.test/path?x=1&y=%22' } : {}) });
    expect(result.status).toBe(201);
    expect(state.mail).toHaveBeenCalledTimes(1);
    const mail = state.mail.mock.calls[0][0];
    expect(mail.to).toBe("assigned@ethinos.com");
    expect(mail.sensitive).toBe(true);
    expect(mail.bodyHtml).toContain("&lt;Task &amp; &quot;title&quot;&gt;");
    expect(mail.bodyHtml).toContain("&lt;Client &amp; &quot;name&quot;&gt;");
    expect(mail.bodyHtml).toContain("&lt;Client &quot;actor&quot;&gt;");
    expect(mail.bodyHtml).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; details');
    expect(mail.bodyHtml).not.toContain("<script>");
    expect(mail.bodyHtml).toContain(`New client ${type}`);
    expect(mail.bodyHtml).toContain("Time:");
    expect(mail.bodyHtml).not.toMatch(/INTERNAL|authorUid|Open task|project.ethinos.com/);
    if (type === "link") expect(mail.bodyHtml).toContain('href="https://example.test/path?x=1&amp;y=%22"');
    else expect(mail.bodyHtml).not.toContain("href=");
    expect(deliveries().map(d => d.state)).toEqual(["sent"]);
  });
  it("emails status before/after only on actual client changes and preserves task fields/no-op updatedAt", async () => {
    const original = structuredClone(valueAt(parent));
    state.coldPaths.add(parent);
    expect((await statusPatch("Pending")).status).toBe(200);
    expect(valueAt(parent)).toEqual(original);
    expect(state.mail).not.toHaveBeenCalled();
    expect((await statusPatch("In Progress")).status).toBe(200);
    const changed = structuredClone(valueAt(parent));
    expect(changed).toMatchObject({ ...original, status: "WIP", updatedAt: expect.any(Number),
      clientUpdateEvent: { kind: "status", before: "Pending", after: "WIP", actorUid: client.uid } });
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("Status changed from Pending to In Progress");
    expect((await statusPatch("In Progress")).status).toBe(200);
    expect(valueAt(parent)).toEqual(changed);
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.firstNulls).not.toContain(parent);
    expect(state.retained.get(parent)?.size).toBe(0);
    expect((await statusPatch("Completed")).status).toBe(200);
    expect(state.mail.mock.calls[1][0].bodyHtml).toContain("In Progress to Completed");
    expect((await statusPatch("Pending")).status).toBe(200);
    expect((await statusPatch("In Progress")).status).toBe(200);
    expect(state.mail).toHaveBeenCalledTimes(4);
    expect(Object.keys(valueAt(ledgerRoot))).toHaveLength(4);
  });
  it("sends only the committed status event after a Firebase transaction retry", async () => {
    state.retry.mockImplementationOnce((path: string) => {
      expect(path).toBe(parent);
      saveAt(parent, { ...valueAt(parent), status: "WIP", concurrentStaffField: "retained" });
      return true;
    });
    expect((await statusPatch("Completed")).status).toBe(200);
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("In Progress to Completed");
    expect(valueAt(parent)).toMatchObject({ status: "Done", concurrentStaffField: "retained" });
    expect(Object.keys(valueAt(ledgerRoot))).toEqual([valueAt(parent).clientUpdateEvent.id]);
  });
  it("does not email a discarded status proposal if a concurrent writer already set the requested status", async () => {
    state.retry.mockImplementationOnce(() => {
      saveAt(parent, { ...valueAt(parent), status: "WIP", updatedAt: 456 });
      return true;
    });
    expect((await statusPatch("In Progress")).status).toBe(200);
    expect(state.mail).not.toHaveBeenCalled();
    expect(valueAt(parent).updatedAt).toBe(456);
  });
  it("emails only once for concurrent requests for the same status transition", async () => {
    const results = await Promise.all([statusPatch("In Progress"), statusPatch("In Progress")]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(Object.keys(valueAt(ledgerRoot))).toEqual([valueAt(parent).clientUpdateEvent.id]);
  });
  it("emails subtask add/complete/reopen cycles without emailing retries or unchanged completion", async () => {
    const title = '<Review & "design">';
    const created = await post("subtasks", subtask(uuid, title));
    const id = created.body.subtask.id;
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("Subtask added");
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("&lt;Review &amp; &quot;design&quot;&gt;");
    await post("subtasks", subtask(uuid, title));
    await patch(id, { completed: false });
    expect(state.mail).toHaveBeenCalledTimes(1);
    await patch(id, { completed: true });
    const completed = structuredClone(valueAt(`${storage}/subtasks/${id}`));
    expect(state.mail.mock.calls[1][0].bodyHtml).toContain("Subtask completed");
    await patch(id, { completed: true });
    expect(valueAt(`${storage}/subtasks/${id}`)).toEqual(completed);
    expect(state.mail).toHaveBeenCalledTimes(2);
    await patch(id, { completed: false });
    expect(state.mail.mock.calls[2][0].bodyHtml).toContain("Subtask reopened");
    await patch(id, { completed: true });
    expect(state.mail).toHaveBeenCalledTimes(4);
    expect(Object.keys(valueAt(ledgerRoot))).toHaveLength(4);
    await post("subtasks", subtask(uuid, title));
    expect(state.mail).toHaveBeenCalledTimes(4);
  });
  it("never emails on staff collaboration writes, including subtask completion", async () => {
    const child = (await post("subtasks", subtask())).body.subtask;
    state.mail.mockClear();
    state.identity = { ...staff };
    await post("entries", message(uuid2));
    await post("subtasks", subtask(uuid2));
    await patch(child.id, { completed: true });
    expect(state.mail).not.toHaveBeenCalled();
  });
  it("emails only once for concurrent requests for the same subtask completion transition", async () => {
    const child = (await post("subtasks", subtask())).body.subtask;
    const results = await Promise.all([patch(child.id, { completed: true }), patch(child.id, { completed: true })]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(state.mail).toHaveBeenCalledTimes(2); // one add, one completion
    expect(Object.keys(valueAt(ledgerRoot))).toHaveLength(2);
  });
  it("deduplicates concurrent create retries and direct helper replays per event/recipient", async () => {
    const results = await Promise.all([post("entries", message()), post("entries", message())]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    expect(state.mail).toHaveBeenCalledTimes(1);
    await post("entries", message());
    expect(state.mail).toHaveBeenCalledTimes(1);
    await Promise.all([notify(), notify(), notify()]);
    expect(state.mail).toHaveBeenCalledTimes(2);
    expect(deliveries().map(d => d.state)).toEqual(["sent", "sent"]);
  });
  it("deduplicates recipients case-insensitively and ignores task assigneeEmail", async () => {
    state.data.users.duplicate = { ...state.data.users.staffKey, email: "assigned@ETHINOS.com" };
    valueAt(parent).assigneeEmail = "invented@ethinos.com";
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.mail.mock.calls[0][0].to).toBe("assigned@ethinos.com");
  });
  it.each(["unassigned", "missing-user", "disabled", "inactive", "archived", "external", "client-role", "client-uid",
    "client-email", "invalid-email", "email-injection", "leading-dot", "trailing-dot", "long-local-part", "unsupported-array", "unsupported-multi"])(
    "skips unsafe recipient %s with no fallback", async mode => {
      const task = valueAt(parent), user = state.data.users.staffKey;
      task.assigneeEmail = "fallback@ethinos.com";
      if (mode === "unassigned") task.assigneeId = null;
      if (mode === "missing-user") task.assigneeId = "missing";
      if (mode === "disabled") user.disabled = true;
      if (mode === "inactive") user.active = false;
      if (mode === "archived") user.archived = true;
      if (mode === "external") user.email = "other@example.test";
      if (mode === "client-role") user.role = "Client";
      if (mode === "client-uid") user.uid = client.uid;
      if (mode === "client-email") state.data.clientPortalUsers.other = { email: user.email, disabled: false, clientIds: ["alpha"] };
      if (mode === "invalid-email") user.email = "invalid email@ethinos.com";
      if (mode === "email-injection") user.email = "good@ethinos.com\nBcc:other@ethinos.com";
      if (mode === "leading-dot") user.email = ".invalid@ethinos.com";
      if (mode === "trailing-dot") user.email = "invalid.@ethinos.com";
      if (mode === "long-local-part") user.email = `${"a".repeat(65)}@ethinos.com`;
      if (mode === "unsupported-array") task.assigneeId = ["staff-id"];
      if (mode === "unsupported-multi") { task.assigneeId = null; task.assigneeIds = ["staff-id"]; }
      await notify();
      expect(state.mail).not.toHaveBeenCalled();
      expect(valueAt(ledgerRoot)).toBeNull();
    },
  );
  it.each(["hidden", "archived", "foreign", "archived-client", "revoked-member", "disabled-actor", "unverified-actor", "staff-actor"])(
    "skips a no-longer-authorized event: %s", async mode => {
      if (mode === "hidden") valueAt(parent).visibility = "internal";
      if (mode === "archived") valueAt(parent).archived = true;
      if (mode === "foreign") valueAt(parent).clientId = "beta";
      if (mode === "archived-client") state.data.clients.alpha.archived = true;
      if (mode === "revoked-member") state.data.clientPortalUsers[client.uid].disabled = true;
      if (mode === "disabled-actor") state.authUser.mockResolvedValue({ email: client.email, emailVerified: true, disabled: true });
      if (mode === "unverified-actor") state.authUser.mockResolvedValue({ email: client.email, emailVerified: false });
      if (mode === "staff-actor") state.identity = { ...staff };
      await notify();
      expect(state.mail).not.toHaveBeenCalled();
    },
  );
  it.each(["hidden", "revoked", "reassigned"])("rechecks %s after its delivery claim and before sending", async mode => {
    state.beforeTransaction.mockImplementation(async (path: string) => {
      if (!path.startsWith(ledgerRoot)) return;
      if (mode === "hidden") valueAt(parent).visibility = "internal";
      if (mode === "revoked") state.data.clientPortalUsers[client.uid].disabled = true;
      if (mode === "reassigned") valueAt(parent).assigneeId = "different-staff";
    });
    await notify();
    expect(state.mail).not.toHaveBeenCalled();
    expect(deliveries().map(d => d.state)).toEqual(["skipped"]);
  });
  it("persists ambiguous transport failures, never resends, and does not fail a saved mutation or log sensitive data", async () => {
    state.mail.mockRejectedValue(new Error("SECRET_BODY assigned@ethinos.com bearer SECRET_TOKEN"));
    const res = await post("entries", message());
    expect(res.status).toBe(201);
    expect(valueAt(`${storage}/entries/${res.body.entry.id}`).text).toBe("Client feedback");
    expect(deliveries().map(d => d.state)).toEqual(["unknown"]);
    expect((await post("entries", message())).status).toBe(201);
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state.log.mock.calls)).not.toMatch(/SECRET|ethinos.com|Client feedback/);
  });
  it("does not send without configured transport and does not automatically retry skipped delivery", async () => {
    state.configured = false;
    await notify();
    expect(deliveries().map(d => d.state)).toEqual(["skipped"]);
    state.configured = true;
    await notify();
    expect(state.mail).not.toHaveBeenCalled();
  });
  it("isolates ledger failures from committed status changes and does not attempt unclaimed email", async () => {
    state.beforeTransaction.mockImplementation(async (path: string) => {
      if (path.startsWith(ledgerRoot)) throw new Error("Database offline");
    });
    expect((await statusPatch("In Progress")).status).toBe(200);
    expect(valueAt(parent).status).toBe("WIP");
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.log).toHaveBeenCalled();
  });
  it("leaves a durable sending claim if post-send ledger writes fail and blocks replay", async () => {
    state.beforeUpdate.mockRejectedValue(new Error("Ledger offline"));
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(deliveries().map(d => d.state)).toEqual(["sending"]);
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    state.beforeUpdate.mockReset();
  });
  it.each(["javascript:alert(1)", "data:text/html,x", 'https://user:password@example.test', 'https://example.test/" onmouseover="x'])(
    "does not render an unsafe link attribute %s even for a malformed saved event", async url => {
      await notify({ ...event, kind: "link", url });
      expect(state.mail).toHaveBeenCalledTimes(1);
      expect(state.mail.mock.calls[0][0].bodyHtml).not.toContain("href=");
    },
  );
});

describe("client-created task notifications", () => {
  const event: ClientTaskUpdateEvent = { id: "created", actorUid: client.uid, at: 1700000000000, kind: "created" };
  const notify = () => sendClientTaskUpdateEmail("alpha", "stable-key", event);
  const settingPath = "settings/notifications/client-task-created";
  beforeEach(() => {
    Object.assign(valueAt(parent), {
      source: "client-portal", creatorId: client.uid, assigneeId: null,
      clientDescription: "Client brief <script>alert(1)</script>", dueDate: "20th Oct 2026", category: "Social",
    });
    state.data.users.staffKey.teamsNotificationsEnabled = true;
  });
  it("notifies each assigned staff member and owner once, without needing a task assignee", async () => {
    Object.assign(state.data.users, {
      second: { id: "second", email: "second@ethinos.com", assignedProjects: ["Alpha"], teamsNotificationsEnabled: true },
      owner: { id: "owner", email: "owner@ethinos.com", assignedProjects: [], teamsNotificationsEnabled: true },
      duplicate: { id: "duplicate", email: "STAFF@ETHINOS.COM", assignedProjects: ["Alpha"], teamsNotificationsEnabled: true },
      unrelated: { id: "other", email: "other@ethinos.com", assignedProjects: ["Beta"], teamsNotificationsEnabled: true },
      disabled: { id: "disabled", email: "disabled@ethinos.com", assignedProjects: ["Alpha"], disabled: true },
      inactive: { id: "inactive", email: "inactive@ethinos.com", assignedProjects: ["Alpha"], active: false },
      archived: { id: "archived", email: "archived@ethinos.com", assignedProjects: ["Alpha"], archived: true },
      external: { id: "external", email: "outside@example.test", assignedProjects: ["Alpha"] },
      role: { id: "role", email: "role@ethinos.com", role: "Client", assignedProjects: ["Alpha"] },
      hybrid: { id: "hybrid", email: "hybrid@ethinos.com", assignedProjects: ["Alpha"] },
    });
    state.data.clientPortalUsers.hybrid = { email: "hybrid@ethinos.com", disabled: false, clientIds: ["alpha"] };
    await notify();
    expect(state.mail.mock.calls.map(([args]) => args.to).sort()).toEqual(["owner@ethinos.com", "second@ethinos.com", staff.email]);
    expect(state.teams).toHaveBeenCalledTimes(3);
    const email = state.mail.mock.calls[0][0];
    expect(email.subject).toBe("New client task — Alpha");
    expect(email.bodyHtml).toContain("Created by: Client Name");
    expect(email.bodyHtml).toContain("20th Oct 2026");
    expect(email.bodyHtml).toContain("&lt;script&gt;");
    for (const secret of ["INTERNAL_MESSAGE", "INTERNAL_STEP", "INTERNAL_COMMENT", "INTERNAL_DESCRIPTION", "https://internal.test"]) {
      expect(email.bodyHtml).not.toContain(secret);
    }
    expect(state.teams.mock.calls[0][0]).toMatchObject({
      taskId: "stable-key", sensitive: true, previewText: expect.stringContaining("Client created a new task"),
    });
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(3);
    expect(state.teams).toHaveBeenCalledTimes(3);
  });
  it.each([
    [undefined, undefined, 1, 1], [false, false, 0, 0], [true, false, 1, 0], [false, true, 0, 1],
  ])("has independent creation email=%s and Teams=%s controls", async (enabled, teamsActivityEnabled, emailCount, teamsCount) => {
    saveAt(settingPath, { enabled, teamsActivityEnabled });
    saveAt("settings/notifications/client-task-updated", { enabled: false, teamsActivityEnabled: false });
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(emailCount);
    expect(state.teams).toHaveBeenCalledTimes(teamsCount);
  });
  it("keeps Teams user preferences and sends email even when Teams is opted out", async () => {
    state.data.users.staffKey.teamsNotificationsEnabled = false;
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).not.toHaveBeenCalled();
  });
  it("still sends Teams when email delivery fails and does not replay ambiguous email", async () => {
    state.mail.mockRejectedValueOnce(new Error("Transport failure"));
    await notify();
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).toHaveBeenCalledTimes(1);
  });
  it("rechecks assignment after recipient lookup before sending the Teams alert", async () => {
    state.resolveEntra.mockImplementationOnce(async () => {
      state.data.users.staffKey.assignedProjects = [];
      return "entra-object-id";
    });
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).not.toHaveBeenCalled();
  });
  it.each(["source", "creatorId", "visibility"])("does not notify for a non-client-created or unshared task with invalid %s", async field => {
    valueAt(parent)[field] = "other";
    await notify();
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.teams).not.toHaveBeenCalled();
  });
  it("does not notify after client access is revoked", async () => {
    state.data.clientPortalUsers[client.uid].disabled = true;
    await notify();
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.teams).not.toHaveBeenCalled();
  });
});

describe("client update Control Centre settings and independent Teams channel", () => {
  const settingPath = "settings/notifications/client-task-updated";
  const emailLedger = "clientTaskUpdateEmailDeliveries/alpha/stable-key";
  const teamsLedger = "clientTaskUpdateTeamsDeliveries/alpha/stable-key";
  const event: ClientTaskUpdateEvent = { id: "teams-event", actorUid: client.uid, at: 1700000000000,
    kind: "message", text: "Updated copy ready", url: null };
  const notify = () => sendClientTaskUpdateEmail("alpha", "stable-key", event);
  const states = (path: string) => Object.values(valueAt(path) ?? {}).flatMap(value =>
    Object.values(value as Record<string, any>)) as Record<string, any>[];
  const statusPatch = (status: string) => request(app).patch(base.replace("/collaboration", ""))
    .set("Authorization", "Bearer test").send({ status });
  beforeEach(() => {
    Object.assign(valueAt(parent), { assigneeId: "staff-id", status: "Pending" });
    state.data.users.staffKey.teamsNotificationsEnabled = true;
  });
  it.each([
    [undefined, undefined, 1, 1], [true, true, 1, 1], [false, false, 0, 0],
    [true, false, 1, 0], [false, true, 0, 1], [false, undefined, 0, 1], [undefined, false, 1, 0],
  ])("respects independent email=%s Teams=%s with both defaults on", async (enabled, teamsActivityEnabled, emailCount, teamsCount) => {
    saveAt(settingPath, { ...(enabled === undefined ? {} : { enabled }),
      ...(teamsActivityEnabled === undefined ? {} : { teamsActivityEnabled }) });
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(emailCount);
    expect(state.teams).toHaveBeenCalledTimes(teamsCount);
    expect(states(emailLedger)[0].state).toBe(emailCount ? "sent" : "skipped");
    expect(states(teamsLedger)[0].state).toBe(teamsCount ? "sent" : "skipped");
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(emailCount);
    expect(state.teams).toHaveBeenCalledTimes(teamsCount);
  });
  it("honors escaped custom email subject/intro, ignores BCC and leaves Teams independent", async () => {
    saveAt(settingPath, { customSubject: "Client update\r\nHeader injection", customIntroText: '<img src=x onerror="unsafe"> & intro',
      bccEmails: ["not-assigned@ethinos.com"] });
    await notify();
    expect(state.mail.mock.calls[0][0]).toMatchObject({ to: staff.email,
      subject: "Client update Header injection — Client update on a shared task" });
    expect(state.mail.mock.calls[0][0].bcc).toBeUndefined();
    expect(state.mail.mock.calls[0][0].bodyHtml).toContain("&lt;img src=x onerror=&quot;unsafe&quot;&gt; &amp; intro");
    expect(state.teams).toHaveBeenCalledTimes(1);
  });
  it("does not gate Teams on email configuration", async () => {
    state.configured = false;
    await notify();
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.teams).toHaveBeenCalledTimes(1);
    expect(states(emailLedger)[0]).toMatchObject({ state: "skipped", reason: "email-not-configured" });
    expect(states(teamsLedger)[0].state).toBe("sent");
  });
  it("does not gate email on Teams configuration", async () => {
    state.teamsConfigured = false;
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.resolveEntra).not.toHaveBeenCalled();
    expect(state.teams).not.toHaveBeenCalled();
    expect(states(teamsLedger)[0]).toMatchObject({ state: "skipped", reason: "teams-not-configured" });
  });
  it.each([false, undefined])("requires existing per-user Teams opt-in (%s)", async preference => {
    state.data.users.staffKey.teamsNotificationsEnabled = preference;
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.resolveEntra).not.toHaveBeenCalled();
    expect(state.teams).not.toHaveBeenCalled();
    expect(states(teamsLedger)[0]).toMatchObject({ state: "skipped", reason: "user-disabled" });
  });
  it("records an unsupported/unresolvable Teams user without affecting email", async () => {
    state.resolveEntra.mockResolvedValue(null);
    await notify();
    expect(state.resolveEntra).toHaveBeenCalledWith(staff.email, "staff-id", { sensitive: true });
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).not.toHaveBeenCalled();
    expect(states(teamsLedger)[0]).toMatchObject({ state: "skipped", reason: "recipient-unresolved" });
    await notify();
    expect(state.resolveEntra).toHaveBeenCalledTimes(1);
  });
  it("uses existing taskMention activity transport with sanitised bounded actor/client/task/update details and no delegated DM", async () => {
    state.authUser.mockResolvedValue({ email: client.email, emailVerified: true, displayName: "<b>Client Actor</b>\r\n" });
    state.data.clients.alpha.name = "<b>Alpha Client</b>";
    valueAt(parent).name = "<img>Shared Task";
    await notify();
    const payload = state.teams.mock.calls[0][0];
    expect(payload).toMatchObject({ recipientObjectId: "entra-object-id", mentionerName: "Client Actor",
      clientName: "Alpha Client", taskName: "Shared Task", taskId: "stable-key", sensitive: true });
    expect(payload.previewText).toContain("Client Actor");
    expect(payload.previewText).toContain("Alpha Client");
    expect(payload.previewText).toContain("Shared Task");
    expect(payload.previewText).toContain("New client message");
    expect(payload.previewText).toContain("Updated copy ready");
    expect(payload.previewText).not.toMatch(/[<>\r\n]/);
    expect(payload.previewText.length).toBeLessThanOrEqual(150);
    expect(payload).not.toHaveProperty("activityType");
    const transport = readFileSync(new URL("../lib/microsoft-graph.ts", import.meta.url), "utf8");
    expect(transport).toContain('activityType: "taskMention"');
  });
  it("truncates long Teams fields and preview", async () => {
    state.authUser.mockResolvedValue({ email: client.email, emailVerified: true, displayName: "A".repeat(200) });
    valueAt(parent).name = "T".repeat(500);
    state.data.clients.alpha.name = "C".repeat(500);
    await notify();
    const payload = state.teams.mock.calls[0][0];
    expect(payload.mentionerName.length).toBeLessThanOrEqual(80);
    expect(payload.taskName.length).toBeLessThanOrEqual(120);
    expect(payload.clientName.length).toBeLessThanOrEqual(80);
    expect(payload.previewText.length).toBeLessThanOrEqual(150);
    expect(payload.previewText).toContain("New client message");
  });
  it("sends Teams when a compatible old email delivery already exists, without resending email", async () => {
    state.data.users.staffKey.teamsNotificationsEnabled = false;
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).not.toHaveBeenCalled();
    // Simulate pre-Teams persisted data: only the existing email ledger remains.
    delete state.data.clientTaskUpdateTeamsDeliveries;
    state.data.users.staffKey.teamsNotificationsEnabled = true;
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).toHaveBeenCalledTimes(1);
  });
  it("does not suppress Teams when email fails ambiguously", async () => {
    state.mail.mockRejectedValue(new Error("PRIVATE_ERROR"));
    await notify();
    expect(states(emailLedger)[0].state).toBe("unknown");
    expect(states(teamsLedger)[0].state).toBe("sent");
    expect(state.teams).toHaveBeenCalledTimes(1);
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).toHaveBeenCalledTimes(1);
  });
  it("isolates email ledger claim failure so Teams still sends", async () => {
    state.beforeTransaction.mockImplementation(async (path: string) => {
      if (path.startsWith(emailLedger)) throw new Error("Ledger offline");
    });
    await notify();
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.teams).toHaveBeenCalledTimes(1);
    expect(states(teamsLedger)[0].state).toBe("sent");
  });
  it.each([
    [{ ok: false, status: 403, error: "not installed PRIVATE" }, "failed", "app-unavailable"],
    [{ ok: false, status: 404, error: "not found PRIVATE" }, "failed", "recipient-unavailable"],
    [{ ok: false, status: 409, error: "multiple apps PRIVATE" }, "failed", "configuration-conflict"],
    [{ ok: false, error: "ambiguous SECRET_TOKEN" }, "unknown", "transport-outcome-unknown"],
    [{ ok: false, status: 500, error: "server SECRET_TOKEN" }, "unknown", "transport-outcome-unknown"],
  ])("persists Teams result %j with no retry and leaves email independent", async (result, status, reason) => {
    state.teams.mockResolvedValue(result);
    await notify();
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(states(emailLedger)[0].state).toBe("sent");
    expect(states(teamsLedger)[0]).toMatchObject({ state: status, reason });
    expect(JSON.stringify(states(teamsLedger))).not.toMatch(/PRIVATE|SECRET_TOKEN/);
    await notify();
    expect(state.teams).toHaveBeenCalledTimes(1);
  });
  it("isolates thrown Teams outcomes without failing saved mutations or retrying", async () => {
    state.teams.mockRejectedValue(new Error("SECRET_TOKEN staff@ethinos.com"));
    const res = await post("entries", message());
    expect(res.status).toBe(201);
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(states(teamsLedger)[0].state).toBe("unknown");
    await post("entries", message());
    expect(state.teams).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state.log.mock.calls)).not.toMatch(/SECRET_TOKEN|ethinos.com/);
  });
  it.each(["revoked", "preference", "event-disabled", "hidden", "reassigned"])(
    "rechecks %s after the Entra lookup before delivering Teams", async mode => {
      state.resolveEntra.mockImplementation(async () => {
        if (mode === "revoked") state.data.clientPortalUsers[client.uid].disabled = true;
        if (mode === "preference") state.data.users.staffKey.teamsNotificationsEnabled = false;
        if (mode === "event-disabled") saveAt(settingPath, { teamsActivityEnabled: false });
        if (mode === "hidden") valueAt(parent).visibility = "internal";
        if (mode === "reassigned") valueAt(parent).assigneeId = "other";
        return "entra-object-id";
      });
      await notify();
      expect(state.mail).toHaveBeenCalledTimes(1);
      expect(state.teams).not.toHaveBeenCalled();
      expect(states(teamsLedger)[0]).toMatchObject({ state: "skipped", reason: "access-or-preference-changed" });
    },
  );
  it("deduplicates concurrent channel claims, create retries, status/subtask no-ops and preserves valid cycles", async () => {
    const results = await Promise.all([post("entries", message()), post("entries", message())]);
    expect(results.map(res => res.status)).toEqual([201, 201]);
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.teams).toHaveBeenCalledTimes(1);
    await post("entries", message());
    await statusPatch("Pending");
    expect(state.teams).toHaveBeenCalledTimes(1);
    await statusPatch("In Progress");
    await statusPatch("In Progress");
    await statusPatch("Pending");
    await statusPatch("In Progress");
    expect(state.mail).toHaveBeenCalledTimes(4);
    expect(state.teams).toHaveBeenCalledTimes(4);
    const child = (await post("subtasks", subtask(uuid2))).body.subtask;
    await patch(child.id, { completed: false });
    await Promise.all([patch(child.id, { completed: true }), patch(child.id, { completed: true })]);
    await patch(child.id, { completed: false });
    expect(state.mail).toHaveBeenCalledTimes(7);
    expect(state.teams).toHaveBeenCalledTimes(7);
  });
  it("does not send either channel for unsupported recipients or staff writes", async () => {
    state.data.users.staffKey.role = "Client";
    await notify();
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.teams).not.toHaveBeenCalled();
    state.data.users.staffKey.role = "Employee";
    state.identity = { ...staff };
    await post("entries", message());
    await post("subtasks", subtask(uuid2));
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.teams).not.toHaveBeenCalled();
  });
});

describe("collaboration validation, idempotency and concurrency", () => {
  it.each([
    {}, { ...message(), type: "internal" }, { ...message(), text: "" }, { ...message(), text: "  " },
    { ...message(), text: "x".repeat(4001) }, { ...message(), text: 1 }, { ...message(), requestId: "not-uuid" },
    { ...message(), requestId: "../path" }, { ...message(), authorUid: "forged" }, { ...message(), createdAt: 1 },
    { ...message(), url: "https://example.test" }, { ...message(), uid: "forged" },
    { ...message(), type: "link" }, { ...message(), type: "link", url: null },
    ...["javascript:alert(1)", "data:text/html,x", "ftp://example.test", "//example.test", "https:example.test", "https://user:pass@example.test", "https://example.test/\npath", "https://example.test/" + "a".repeat(2048)]
      .map(url => ({ ...message(), type: "link", url })),
  ])("rejects malformed or forged entry %j", async body => {
    expect((await post("entries", body)).status).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it("accepts exactly 4000 characters and explicitly reports the 4000-character limit", async () => {
    expect((await post("entries", message(uuid, "x".repeat(4000)))).status).toBe(201);
    const rejected = await post("entries", message(uuid2, "x".repeat(4001)));
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/4000 characters/);
  });
  it.each([{}, { ...subtask(), title: " " }, { ...subtask(), title: "x".repeat(201) },
    { ...subtask(), requestId: "bad" }, { ...subtask(), completed: true }, { ...subtask(), authorName: "Forged" }])(
    "rejects malformed subtask %j", async body => {
      expect((await post("subtasks", body)).status).toBe(400);
      expect(state.writes).toEqual([]);
    },
  );
  it.each([{}, { completed: "true" }, { completed: 1 }, { completed: true, title: "forged" },
    { completed: true, authorUid: "forged" }])("rejects invalid patch %j", async body => {
    expect((await patch("some-id", body)).status).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it.each(["bad.key", "bad%2Fkey", "x".repeat(129)])("rejects unsafe key %s", async key => {
    expect((await get(base.replace("stable-key", key))).status).toBe(400);
    expect((await patch(key, { completed: true })).status).toBe(400);
    expect(state.writes).toEqual([]);
  });
  it("deduplicates identical retries, preserves original timestamps and rejects changed content/type/operation", async () => {
    const first = await post("entries", message());
    const retry = await post("entries", { ...message(), requestId: uuid.toUpperCase() });
    expect(retry.body).toEqual(first.body);
    expect((await get()).body.entries).toHaveLength(1);
    expect((await post("entries", message(uuid, "Changed"))).status).toBe(409);
    expect((await post("entries", { ...message(), type: "note" })).status).toBe(409);
    expect((await post("subtasks", subtask())).status).toBe(409);
  });
  it("scopes request UUIDs to the authenticated actor and task", async () => {
    const first = (await post("entries", message())).body.entry;
    state.identity = { ...staff };
    const second = (await post("entries", message())).body.entry;
    expect(second.id).not.toBe(first.id);
    expect((await get()).body.entries).toHaveLength(2);
    saveAt("clientLogs/alpha/other-key", structuredClone(valueAt(parent)));
    const other = await post("entries", message(uuid, "Other task"), base.replace("stable-key", "other-key"));
    expect(other.status).toBe(201);
  });
  it("handles concurrent identical retries as a single entry", async () => {
    const results = await Promise.all([post("entries", message()), post("entries", message())]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(Object.keys(valueAt(`${storage}/entries`))).toHaveLength(1);
  });
  it("allows only one concurrent operation to reserve a requestId with differing content", async () => {
    const results = await Promise.all([post("entries", message()), post("subtasks", subtask())]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(Object.keys(valueAt(`${storage}/requests`))).toHaveLength(1);
    expect(Object.keys(valueAt(`${storage}/entries`) ?? {}).length +
      Object.keys(valueAt(`${storage}/subtasks`) ?? {}).length).toBe(1);
  });
  it("preserves both independently appended concurrent entries", async () => {
    const results = await Promise.all([post("entries", message()), post("entries", message(uuid2, "Another"))]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    expect((await get()).body.entries).toEqual(expect.arrayContaining(results.map(r => r.body.entry)));
  });
  it("preserves concurrent entries and subtasks during append and Firebase retries", async () => {
    const first = (await post("entries", message())).body.entry;
    const child = (await post("subtasks", subtask(uuid2))).body.subtask;
    state.retry.mockImplementationOnce((path: string) => {
      // The first next transaction is the rate limiter.
      return false;
    }).mockImplementationOnce((path: string) => {
      expect(path).toBe(storage);
      saveAt(`${storage}/entries/concurrent`, {
        type: "note", text: "Concurrent staff note", authorName: "Staff", createdAt: 1, authorUid: staff.uid,
      });
      return true;
    });
    expect((await post("entries", message("12345678-1234-4123-8123-123456789abe", "New"))).status).toBe(201);
    const result = (await get()).body;
    expect(result.entries).toEqual(expect.arrayContaining([first, expect.objectContaining({ id: "concurrent" })]));
    expect(result.entries).toHaveLength(3);
    expect(result.subtasks).toEqual([child]);
  });
  it("retries a cold first-null append without losing existing entries, subtasks or request reservations", async () => {
    const entry = (await post("entries", message())).body.entry;
    const child = (await post("subtasks", subtask(uuid2))).body.subtask;
    const previousRequests = structuredClone(valueAt(`${storage}/requests`));
    state.coldPaths.add(storage);
    const next = await post("entries", message("12345678-1234-4123-8123-123456789abe", "New entry"));
    expect(next.status).toBe(201);
    expect(state.firstNulls).toContain(storage);
    const result = (await get()).body;
    expect(result.entries).toEqual(expect.arrayContaining([entry, next.body.entry]));
    expect(result.subtasks).toEqual([child]);
    expect(valueAt(`${storage}/requests`)).toMatchObject(previousRequests);
    expect((await post("entries", message())).body.entry).toEqual(entry);
  });
  it("retains a listener so PATCH cannot abort on a cold uncached null after once()", async () => {
    const child = (await post("subtasks", subtask())).body.subtask;
    const path = `${storage}/subtasks/${child.id}`;
    state.coldPaths.add(path);
    // Establish the regression: once() without a retained listener still lets
    // the transaction's initial callback receive null and abort an existing row.
    const ref = getAdminDatabase().ref(path);
    await ref.once("value");
    const cold = await ref.transaction(current => current ? { ...current, completed: true } : undefined);
    expect(cold.committed).toBe(false);
    expect(state.firstNulls).toEqual([path]);
    expect(valueAt(path).completed).toBe(false);
    state.firstNulls = [];
    const patched = await patch(child.id, { completed: true });
    expect(patched.status).toBe(200);
    expect(patched.body.subtask).toEqual({ ...child, completed: true });
    expect(state.firstNulls).toEqual([]);
    expect(state.retained.get(path)?.size).toBe(0);
  });
  it("releases retained PATCH listeners when the subtask is missing or authorization changes", async () => {
    const missingPath = `${storage}/subtasks/missing`;
    expect((await patch("missing", { completed: true })).status).toBe(404);
    expect(state.retained.get(missingPath)?.size).toBe(0);
    const child = (await post("subtasks", subtask())).body.subtask;
    const path = `${storage}/subtasks/${child.id}`;
    let calls = 0;
    state.authUser.mockImplementation(async () => {
      if (++calls === 2) state.data.clientPortalUsers["client-a"].disabled = true;
      return { email: client.email, emailVerified: true };
    });
    expect((await patch(child.id, { completed: true })).status).toBe(403);
    expect(state.retained.get(path)?.size).toBe(0);
    expect(valueAt(path).completed).toBe(false);
  });
  it("creates and retries subtasks, and updates only a stable subtask's completed field", async () => {
    const first = (await post("subtasks", subtask())).body.subtask;
    expect(first).toEqual({ id: expect.any(String), title: "Check design", completed: false,
      authorName: "Client Name", createdAt: expect.any(Number) });
    expect((await post("subtasks", subtask())).body.subtask).toEqual(first);
    expect((await post("subtasks", subtask(uuid, "Changed"))).status).toBe(409);
    const second = (await post("subtasks", subtask(uuid2, "Another"))).body.subtask;
    const path = `${storage}/subtasks/${first.id}`;
    const original = structuredClone(valueAt(path));
    state.beforeTransaction.mockImplementationOnce(() => {}).mockImplementationOnce((key: string) => {
      expect(key).toBe(path);
      saveAt(path, { ...original, concurrentInternalField: "retained" });
    });
    state.identity = { ...staff };
    expect((await patch(first.id, { completed: true })).body.subtask).toEqual({ ...first, completed: true });
    expect(valueAt(path)).toEqual({ ...original, completed: true, concurrentInternalField: "retained" });
    expect(valueAt(`${storage}/subtasks/${second.id}`).completed).toBe(false);
    expect(state.writes.at(-1)).toBe(path);
    state.identity = { ...client };
    expect((await patch(first.id, { completed: false })).status).toBe(200);
    expect((await post("subtasks", subtask())).body.subtask.completed).toBe(false);
    expect((await patch("not-a-real-subtask", { completed: true })).status).toBe(404);
  });
  it("cannot patch a subtask from another task", async () => {
    const first = (await post("subtasks", subtask())).body.subtask;
    saveAt("clientLogs/alpha/other-key", structuredClone(valueAt(parent)));
    expect((await patch(first.id, { completed: true }, base.replace("stable-key", "other-key"))).status).toBe(404);
    expect(valueAt(`${storage}/subtasks/${first.id}`).completed).toBe(false);
  });
  it("bounds actor write rate and each list without dropping prior records", async () => {
    saveAt(`rateLimits/clientTaskCollaboration_${client.uid}`, { count: 60, expiresAt: Date.now() + 60_000 });
    expect((await post("entries", message())).status).toBe(429);
    saveAt(`rateLimits/clientTaskCollaboration_${client.uid}`, null);
    const entries = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`entry${i}`, {
      type: "note", text: `Note ${i}`, url: null, authorName: "Staff", createdAt: i,
    }]));
    const subtasks = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`subtask${i}`, {
      title: `Title ${i}`, completed: false, authorName: "Staff", createdAt: i,
    }]));
    saveAt(storage, { entries, subtasks });
    expect((await post("entries", message())).status).toBe(409);
    expect((await post("subtasks", subtask())).status).toBe(409);
    const result = await get();
    expect(result.body.entries).toHaveLength(200);
    expect(result.body.subtasks).toHaveLength(100);
    expect(result.body.entries[0].id).toBe("entry0");
    expect(valueAt(`${storage}/entries`)).toEqual(entries);
  });
});
