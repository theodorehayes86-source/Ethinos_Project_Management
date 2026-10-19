import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  data: {} as Record<string, any>, identity: {} as Record<string, any>,
  reads: [] as string[], writes: [] as string[],
  verify: vi.fn(), authUser: vi.fn(), mail: vi.fn(),
  beforeTransaction: vi.fn(), retry: vi.fn(),
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
      let value = fn(structuredClone(valueAt(path)));
      // A Firebase retry discards the first callback result and supplies live data.
      if (await state.retry(path)) value = fn(structuredClone(valueAt(path)));
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
vi.mock("../lib/microsoft-graph", () => ({ sendEmail: state.mail, isEmailConfigured: () => true }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import portalRouter from "../routes/client-portal";
import { getAdminDatabase } from "../lib/firebase-admin";

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
    // RTDB child denies cannot override an ancestor grant. This subtree is a
    // direct root child, and neither root grants nor root wildcards allow it.
    expect(rules[".read"]).toBe(false);
    expect(rules[".write"]).toBe(false);
    expect(Object.keys(rules).filter(key => key.startsWith("$"))).toEqual([]);
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
