/**
 * Tests for POST /api/teams-chat/open
 *
 * Verifies the fire-and-forget pattern introduced to cut chat-open latency:
 *   1. The route responds with a valid chatKey immediately.
 *   2. Background hydration writes message history to Firebase.
 *   3. A hydration failure is logged as a warning and does not affect the HTTP response.
 *   4. A subscription background failure is also non-fatal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ──────────────────────────────────────────────────────────────────

// logger — captured so we can assert on warn calls
const mockWarn = vi.fn();
const mockInfo = vi.fn();
const mockError = vi.fn();
vi.mock("../lib/logger.js", () => ({
  logger: { warn: mockWarn, info: mockInfo, error: mockError },
}));

// firebase-admin — in-memory store so hydration writes are observable
const firebaseStore: Record<string, unknown> = {};
const mockReadFirebasePath = vi.fn(async (path: string) => {
  return firebaseStore[path] ?? null;
});
const mockWriteFirebasePath = vi.fn(async (path: string, value: unknown) => {
  firebaseStore[path] = value;
});
const mockVerifyIdToken = vi.fn().mockResolvedValue({ uid: "test-user" });
vi.mock("../lib/firebase-admin.js", () => ({
  getAdminAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
  readFirebasePath: (...args: unknown[]) => mockReadFirebasePath(...(args as [string])),
  writeFirebasePath: (...args: unknown[]) => mockWriteFirebasePath(...(args as [string, unknown])),
}));

// microsoft-graph — controllable stubs
const mockResolveEntraObjectId = vi.fn();
const mockFindOrCreateOneOnOneChat = vi.fn();
const mockGetChatMessages = vi.fn();
const mockSubscribeToChatMessages = vi.fn();
const mockRenewChatSubscription = vi.fn();
const mockGetTeamsBaseUrl = vi.fn(() => "https://test.example.com");
vi.mock("../lib/microsoft-graph.js", () => ({
  resolveEntraObjectId: (...a: unknown[]) => mockResolveEntraObjectId(...a),
  findOrCreateOneOnOneChat: (...a: unknown[]) => mockFindOrCreateOneOnOneChat(...a),
  getChatMessages: (...a: unknown[]) => mockGetChatMessages(...a),
  getChatMessage: vi.fn(),
  getChatMembers: vi.fn(),
  sendBotProactiveMessage: vi.fn(),
  getBotUserChatId: vi.fn(),
  subscribeToChatMessages: (...a: unknown[]) => mockSubscribeToChatMessages(...a),
  renewChatSubscription: (...a: unknown[]) => mockRenewChatSubscription(...a),
  getTeamsBaseUrl: () => mockGetTeamsBaseUrl(),
}));

// ── App setup ─────────────────────────────────────────────────────────────

async function buildApp() {
  const { default: teamsChatRouter } = await import("../routes/teams-chat.js");
  const app = express();
  app.use(express.json());
  app.use("/api", teamsChatRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Wait for all pending microtasks / macrotasks in the background. */
function flushBackground() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function makeBody(overrides: Record<string, string> = {}) {
  return {
    senderId: "user-1",
    senderEmail: "alice@example.com",
    senderName: "Alice",
    recipientId: "user-2",
    recipientEmail: "bob@example.com",
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

const RAW_CHAT_ID = "19:abc123_def456@thread.v2";
const CHAT_KEY = "19_abc123_def456@thread_v2"; // fbKey output

beforeEach(() => {
  vi.clearAllMocks();

  // Clear in-memory store
  for (const k of Object.keys(firebaseStore)) delete firebaseStore[k];

  // Default: no cached lookup (force Graph path)
  mockReadFirebasePath.mockImplementation(async (path: string) => {
    return firebaseStore[path] ?? null;
  });
  mockWriteFirebasePath.mockImplementation(async (path: string, value: unknown) => {
    firebaseStore[path] = value;
  });

  // Default Graph stubs — happy path
  mockResolveEntraObjectId
    .mockResolvedValueOnce("oid-alice")
    .mockResolvedValueOnce("oid-bob");
  mockFindOrCreateOneOnOneChat.mockResolvedValue(RAW_CHAT_ID);
  mockGetChatMessages.mockResolvedValue([]);
  mockSubscribeToChatMessages.mockResolvedValue({
    id: "sub-1",
    expiresDateTime: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/teams-chat/open", () => {
  it("returns a valid chatKey immediately without waiting for hydration", async () => {
    // Make hydration slow — the response must arrive before it resolves.
    let hydrationStarted = false;
    mockGetChatMessages.mockImplementation(async () => {
      hydrationStarted = true;
      // simulate a 200 ms delay — response should arrive before this
      await new Promise((r) => setTimeout(r, 200));
      return [];
    });

    const app = await buildApp();
    const t0 = Date.now();

    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    const elapsed = Date.now() - t0;

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("chatKey");
    expect(typeof res.body.chatKey).toBe("string");
    expect(res.body.chatKey.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("rawChatId", RAW_CHAT_ID);

    // The response should come back well before the 200 ms hydration delay.
    // A generous 150 ms threshold avoids false positives in CI.
    expect(elapsed).toBeLessThan(150);

    // Hydration did start in the background
    await flushBackground();
    expect(hydrationStarted).toBe(true);
  });

  it("returns 400 when required fields are missing", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send({ senderId: "user-1" }); // missing senderEmail, recipientId, recipientEmail

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("background hydration writes each message to Firebase", async () => {
    const now = Date.now();
    mockGetChatMessages.mockResolvedValue([
      {
        id: "msg-1",
        body: { contentType: "text", content: "Hello" },
        from: { user: { id: "oid-bob", displayName: "Bob" } },
        createdDateTime: new Date(now - 60_000).toISOString(),
      },
      {
        id: "msg-2",
        body: { contentType: "text", content: "World" },
        from: { user: { id: "oid-alice", displayName: "Alice" } },
        createdDateTime: new Date(now - 30_000).toISOString(),
      },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);
    const { chatKey } = res.body as { chatKey: string };

    // Let the background task finish
    await flushBackground();
    // Give the async IIFE a chance to complete (it awaits multiple Firebase calls)
    await new Promise((r) => setTimeout(r, 50));

    // Both messages should be written to Firebase
    const msgPath1 = `teamsDMs/chats/${chatKey}/messages/msg-1`;
    const msgPath2 = `teamsDMs/chats/${chatKey}/messages/msg-2`;

    expect(mockWriteFirebasePath).toHaveBeenCalledWith(
      msgPath1,
      expect.objectContaining({ body: "Hello", source: "teams" })
    );
    expect(mockWriteFirebasePath).toHaveBeenCalledWith(
      msgPath2,
      expect.objectContaining({ body: "World", source: "teams" })
    );
  });

  it("skips empty messages during hydration", async () => {
    mockGetChatMessages.mockResolvedValue([
      {
        id: "msg-empty",
        body: { contentType: "text", content: "   " }, // whitespace only
        from: { user: { id: "oid-bob", displayName: "Bob" } },
        createdDateTime: new Date().toISOString(),
      },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);
    const { chatKey } = res.body as { chatKey: string };

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    const msgPath = `teamsDMs/chats/${chatKey}/messages/msg-empty`;
    const written = mockWriteFirebasePath.mock.calls.find(
      ([p]) => p === msgPath
    );
    expect(written).toBeUndefined();
  });

  it("does not re-write messages that already exist in Firebase", async () => {
    const now = Date.now();
    mockGetChatMessages.mockResolvedValue([
      {
        id: "msg-existing",
        body: { contentType: "text", content: "Already here" },
        from: { user: { id: "oid-bob", displayName: "Bob" } },
        createdDateTime: new Date(now - 60_000).toISOString(),
      },
    ]);

    // Pre-populate Firebase so the message is already there
    const app = await buildApp();
    // We need to know the chatKey — it's fbKey(RAW_CHAT_ID)
    // The route writes lookup first, then uses chatKey derived from rawChatId.
    // Pre-seed readFirebasePath to return existing data for msg-existing
    mockReadFirebasePath.mockImplementation(async (path: string) => {
      if (path.includes("msg-existing")) {
        return { id: "msg-existing", body: "Already here" }; // already exists
      }
      return firebaseStore[path] ?? null;
    });

    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    // Should NOT have written msg-existing
    const msgPath = mockWriteFirebasePath.mock.calls.find(([p]) =>
      p.includes("msg-existing")
    );
    expect(msgPath).toBeUndefined();
  });

  it("hydration failure is logged as a warning and does not crash the server or change the response", async () => {
    mockGetChatMessages.mockRejectedValue(
      new Error("Graph API timeout")
    );

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    // HTTP response must still be 200 with chatKey
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("chatKey");
    expect(res.body).toHaveProperty("rawChatId", RAW_CHAT_ID);

    // Wait for background hydration to run and fail
    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    // Failure should be a warn, not an error (non-fatal)
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ histErr: expect.any(Error) }),
      expect.stringContaining("Background history hydration failed")
    );
    // Error-level logger must NOT have been called for the hydration failure
    const errorCallsForHydration = mockError.mock.calls.filter(
      ([, msg]) => typeof msg === "string" && msg.includes("hydration")
    );
    expect(errorCallsForHydration).toHaveLength(0);
  });

  it("subscription background failure is logged as a warning and does not affect the response", async () => {
    mockSubscribeToChatMessages.mockRejectedValue(
      new Error("Subscription quota exceeded")
    );

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    // HTTP response must still be 200 with chatKey
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("chatKey");

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    // Subscription failure must also be a warn, not an error
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ subErr: expect.any(Error) }),
      expect.stringContaining("Background subscription create/renew failed")
    );
  });

  it("both hydration and subscription can fail simultaneously without crashing", async () => {
    mockGetChatMessages.mockRejectedValue(new Error("Graph down"));
    mockSubscribeToChatMessages.mockRejectedValue(new Error("Sub service down"));

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("chatKey");

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    // Both should warn
    expect(mockWarn).toHaveBeenCalledTimes(2);
    // No server error
    expect(mockError).not.toHaveBeenCalled();
  });

  it("uses cached chatId from Firebase lookup instead of calling Graph", async () => {
    // Pre-seed a cached lookup entry so Graph is bypassed
    const lookupKey = ["user-1", "user-2"].sort().join("_");
    const fbLookupKey = lookupKey.replace(/[.#$[\]/]/g, "_");

    mockReadFirebasePath.mockImplementation(async (path: string) => {
      if (path.includes(`teamsDMs/lookup/${fbLookupKey}`)) {
        return {
          rawChatId: RAW_CHAT_ID,
          senderObjectId: "oid-alice",
          recipientObjectId: "oid-bob",
        };
      }
      return firebaseStore[path] ?? null;
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);
    expect(res.body.rawChatId).toBe(RAW_CHAT_ID);

    // Graph lookup must have been skipped
    expect(mockResolveEntraObjectId).not.toHaveBeenCalled();
    expect(mockFindOrCreateOneOnOneChat).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .send(makeBody());

    expect(res.status).toBe(401);
  });

  it("returns 401 when the Firebase token is invalid", async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error("Token expired"));

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer bad-token")
      .send(makeBody());

    expect(res.status).toBe(401);
  });

  it("skips subscription renewal when the existing sub has plenty of time left (> 12 min)", async () => {
    // 30 minutes remaining — well above the 12-minute renewal threshold.
    mockReadFirebasePath.mockImplementation(async (path: string) => {
      if (path.includes("/subscription")) {
        return {
          id: "healthy-sub-id",
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
      }
      return firebaseStore[path] ?? null;
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    // Neither renew nor create should have been called — sub is healthy.
    expect(mockRenewChatSubscription).not.toHaveBeenCalled();
    expect(mockSubscribeToChatMessages).not.toHaveBeenCalled();
  });

  it("renews an existing subscription when it is within the 12-minute renewal window", async () => {
    const futureExpiry = new Date(Date.now() + 55 * 60 * 1000).toISOString();

    // 8 minutes remaining — inside the 12-minute renewal window.
    mockReadFirebasePath.mockImplementation(async (path: string) => {
      if (path.includes("/subscription")) {
        return {
          id: "expiring-sub-id",
          expiresAt: Date.now() + 8 * 60 * 1000,
        };
      }
      return firebaseStore[path] ?? null;
    });
    mockRenewChatSubscription.mockResolvedValue(futureExpiry);

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRenewChatSubscription).toHaveBeenCalledWith("expiring-sub-id");
    expect(mockSubscribeToChatMessages).not.toHaveBeenCalled();
  });

  it("creates a new subscription when none exists", async () => {
    // No existing subscription
    mockReadFirebasePath.mockImplementation(async (path: string) => {
      if (path.includes("/subscription")) return null;
      return firebaseStore[path] ?? null;
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockSubscribeToChatMessages).toHaveBeenCalledWith(
      RAW_CHAT_ID,
      "https://test.example.com/api/teams-chat/webhook",
      "flowpro-chat-v1"
    );
  });

  it("creates a new subscription when the existing one has already expired", async () => {
    // Expired 5 minutes ago.
    mockReadFirebasePath.mockImplementation(async (path: string) => {
      if (path.includes("/subscription")) {
        return {
          id: "expired-sub-id",
          expiresAt: Date.now() - 5 * 60 * 1000,
        };
      }
      return firebaseStore[path] ?? null;
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/teams-chat/open")
      .set("Authorization", "Bearer valid-token")
      .send(makeBody());

    expect(res.status).toBe(200);

    await flushBackground();
    await new Promise((r) => setTimeout(r, 50));

    // Must create a new subscription, not attempt to renew the dead one.
    expect(mockSubscribeToChatMessages).toHaveBeenCalledWith(
      RAW_CHAT_ID,
      "https://test.example.com/api/teams-chat/webhook",
      "flowpro-chat-v1"
    );
    expect(mockRenewChatSubscription).not.toHaveBeenCalled();
  });
});
