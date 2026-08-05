/**
 * Tests for the attendance scheduler's zero-write failure detection.
 *
 * Verifies that a sync returning success:true with recordsWritten === 0
 * (but employees > 0) is treated as a failure and increments
 * consecutiveFailures — so the existing alert email fires correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mock primitives (must be declared before vi.mock factories) ────
const {
  mockError,
  mockWarn,
  mockInfo,
  mockDebug,
  mockSyncAttendanceToday,
  mockGetKekaCredentials,
  mockReadFirebasePath,
  mockWriteFirebasePath,
  mockMultiPathUpdate,
} = vi.hoisted(() => ({
  mockError: vi.fn(),
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
  mockDebug: vi.fn(),
  mockSyncAttendanceToday: vi.fn(),
  mockGetKekaCredentials: vi.fn(),
  mockReadFirebasePath: vi.fn(),
  mockWriteFirebasePath: vi.fn().mockResolvedValue(undefined),
  mockMultiPathUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: mockError,
    warn: mockWarn,
    info: mockInfo,
    debug: mockDebug,
  },
}));

vi.mock("../lib/keka-client.js", () => ({
  syncAttendanceToday: (...args: unknown[]) => mockSyncAttendanceToday(...args),
  getKekaCredentials: () => mockGetKekaCredentials(),
}));

vi.mock("../lib/firebase-admin.js", () => ({
  readFirebasePath: (...args: unknown[]) => mockReadFirebasePath(...args),
  writeFirebasePath: (...args: unknown[]) => mockWriteFirebasePath(...args),
  multiPathUpdate: (...args: unknown[]) => mockMultiPathUpdate(...args),
}));

vi.mock("../lib/microsoft-graph.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  isEmailConfigured: vi.fn().mockReturnValue(false),
}));

// job-lock — pass-through so runAttendanceSync is not blocked
vi.mock("../lib/job-lock.js", () => ({
  withJobLock: vi.fn((_name: string, _ttl: number, fn: () => Promise<void>) => fn()),
  clearExpiredLock: vi.fn().mockResolvedValue(undefined),
}));

// node-cron — noop so startAttendanceScheduler does not spin up real crons
vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { runAttendanceSync } from "../lib/attendance-scheduler.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns the consecutiveFailures value captured in the last writeFirebasePath call. */
function capturedConsecutiveFailures(): number | undefined {
  const calls = mockWriteFirebasePath.mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const payload = calls[i][1];
    if (payload && typeof payload === "object" && "consecutiveFailures" in payload) {
      return (payload as { consecutiveFailures: number }).consecutiveFailures;
    }
  }
  return undefined;
}

// ── Shared setup ──────────────────────────────────────────────────────────

/** Fake time placed at 10:00 IST (04:30 UTC) — inside the active sync window. */
const FAKE_NOW_IST_10AM = new Date("2025-08-05T04:30:00.000Z").getTime();

function setupDefaultMocks() {
  // Keka is configured
  mockGetKekaCredentials.mockResolvedValue({
    baseUrl: "https://ethinos.keka.com",
    apiKey: "test-key",
  });

  // Timezone config: IST; no catch-up needed
  mockReadFirebasePath.mockImplementation(async (path: string) => {
    if (path === "settings/notifications/reminders-schedule") {
      return { scheduleTimezone: "Asia/Kolkata" };
    }
    return null; // covers lastAttendanceSync and anything else
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Attendance scheduler — zero-write failure detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW_IST_10AM);
    setupDefaultMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats zero-write as failure and increments consecutiveFailures when employees > 0", async () => {
    // Simulate: Keka returned employees (8 total) but nothing was written to Firebase
    mockSyncAttendanceToday.mockResolvedValue({
      success: true,
      recordsWritten: 0,
      totalArrived: 5,
      totalNotArrived: 3,
      retriesUsed: 0,
    });

    await runAttendanceSync();

    // Should have logged an ERROR about the zero write
    expect(mockError).toHaveBeenCalledWith(
      expect.objectContaining({ recordsWritten: 0, employees: 8 }),
      expect.stringContaining("Zero records written despite 8 linked users — treating as failure")
    );

    // consecutiveFailures written to Firebase should be > 0 (incremented)
    const written = capturedConsecutiveFailures();
    expect(written).toBeGreaterThan(0);
  });

  it("does NOT treat zero-write as failure when there are no linked employees", async () => {
    // Simulate: no PMT users are linked to Keka — empty day is legitimate
    mockSyncAttendanceToday.mockResolvedValue({
      success: true,
      recordsWritten: 0,
      totalArrived: 0,
      totalNotArrived: 0,
      retriesUsed: 0,
    });

    await runAttendanceSync();

    // No zero-write error should be logged
    const zeroWriteErrors = mockError.mock.calls.filter((args) =>
      String(args[1]).includes("Zero records written")
    );
    expect(zeroWriteErrors).toHaveLength(0);

    // consecutiveFailures should remain 0 (treated as success)
    const written = capturedConsecutiveFailures();
    expect(written).toBe(0);
  });

  it("still increments consecutiveFailures when syncAttendanceToday returns success:false", async () => {
    mockSyncAttendanceToday.mockResolvedValue({
      success: false,
      recordsWritten: 0,
      totalArrived: 0,
      totalNotArrived: 0,
      error: "Keka API timed out",
      retriesUsed: 1,
    });

    await runAttendanceSync();

    const written = capturedConsecutiveFailures();
    expect(written).toBeGreaterThan(0);
  });

  it("resets consecutiveFailures to 0 on a normal successful sync", async () => {
    mockSyncAttendanceToday.mockResolvedValue({
      success: true,
      recordsWritten: 12,
      totalArrived: 8,
      totalNotArrived: 4,
      retriesUsed: 0,
    });

    await runAttendanceSync();

    const written = capturedConsecutiveFailures();
    expect(written).toBe(0);
  });
});
