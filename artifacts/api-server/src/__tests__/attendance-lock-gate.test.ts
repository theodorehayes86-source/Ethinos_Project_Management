/**
 * Regression tests for the scheduler job-lock starvation bug (5th attendance fix).
 *
 * Root cause: the cron callback acquired the shared Firebase lock BEFORE
 * checking Keka credentials. An instance without credentials (e.g. a prod
 * deployment published before the secret existed) won the lock race every
 * tick, silently skipped, and starved every configured instance — so no
 * attendance was ever synced despite zero errors in the logs.
 *
 * These tests pin the fix:
 *  1. An instance with missing or PARTIAL credentials must NEVER call
 *     withJobLock (it must not acquire the lock at all).
 *  2. A fully configured instance must acquire the lock under the new
 *     "-v2" lock names (old builds still hammer the old names).
 *  3. The skip must be logged at warn level — visible in production logs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockWarn,
  mockWithJobLock,
  mockClearExpiredLock,
  mockGetKekaCredentials,
  mockReadKekaClientId,
  mockReadKekaClientSecret,
  mockCronSchedule,
} = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockWithJobLock: vi.fn().mockResolvedValue(true),
  mockClearExpiredLock: vi.fn().mockResolvedValue(false),
  mockGetKekaCredentials: vi.fn(),
  mockReadKekaClientId: vi.fn(),
  mockReadKekaClientSecret: vi.fn(),
  mockCronSchedule: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: mockWarn, info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/keka-client.js", () => ({
  syncAttendanceToday: vi.fn(),
  syncKekaData: vi.fn(),
  checkLeaveConflict: vi.fn(),
  getKekaCredentials: () => mockGetKekaCredentials(),
  readKekaClientId: () => mockReadKekaClientId(),
  readKekaClientSecret: () => mockReadKekaClientSecret(),
}));

vi.mock("../lib/firebase-admin.js", () => ({
  readFirebasePath: vi.fn().mockResolvedValue(null),
  writeFirebasePath: vi.fn().mockResolvedValue(undefined),
  multiPathUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/microsoft-graph.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  isEmailConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/job-lock.js", () => ({
  withJobLock: (...args: unknown[]) => mockWithJobLock(...args),
  clearExpiredLock: (...args: unknown[]) => mockClearExpiredLock(...args),
}));

vi.mock("node-cron", () => ({
  default: { schedule: mockCronSchedule },
}));

import { startAttendanceScheduler } from "../lib/attendance-scheduler.js";
import { startKekaScheduler } from "../lib/keka-scheduler.js";

/** Registers the scheduler and returns the cron tick callback it installed. */
async function captureAttendanceTick(): Promise<() => Promise<void>> {
  await startAttendanceScheduler();
  // First schedule() call is the 10-min sync; second is the hourly health check.
  const call = mockCronSchedule.mock.calls.find((c) => c[0] === "*/10 * * * *");
  expect(call).toBeDefined();
  return call![1] as () => Promise<void>;
}

function captureKekaTick(): () => Promise<void> {
  startKekaScheduler();
  const call = mockCronSchedule.mock.calls.find((c) => c[0] === "0 * * * *");
  expect(call).toBeDefined();
  return call![1] as () => Promise<void>;
}

const FULL_CREDS = { baseUrl: "https://ethinos.keka.com", apiKey: "k" };

function configureCreds({
  creds = FULL_CREDS as typeof FULL_CREDS | null,
  clientId = "cid" as string | null,
  clientSecret = "csecret" as string | null,
} = {}) {
  mockGetKekaCredentials.mockResolvedValue(creds);
  mockReadKekaClientId.mockReturnValue(clientId);
  mockReadKekaClientSecret.mockReturnValue(clientSecret);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWithJobLock.mockResolvedValue(true);
  mockClearExpiredLock.mockResolvedValue(false);
});

describe("Attendance scheduler — credentials gate BEFORE the lock", () => {
  it("never acquires the lock when Keka credentials are missing entirely", async () => {
    configureCreds({ creds: null });
    const tick = await captureAttendanceTick();

    await tick();

    expect(mockWithJobLock).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("skipping tick without acquiring lock")
    );
  });

  it("never acquires the lock when the OAuth client ID is missing (partial credentials)", async () => {
    configureCreds({ clientId: null });
    const tick = await captureAttendanceTick();

    await tick();

    expect(mockWithJobLock).not.toHaveBeenCalled();
  });

  it("never acquires the lock when the OAuth client secret is missing (partial credentials)", async () => {
    configureCreds({ clientSecret: null });
    const tick = await captureAttendanceTick();

    await tick();

    expect(mockWithJobLock).not.toHaveBeenCalled();
  });

  it("acquires the v2 lock (not the legacy name) when fully configured", async () => {
    configureCreds();
    const tick = await captureAttendanceTick();

    await tick();

    expect(mockWithJobLock).toHaveBeenCalledTimes(1);
    expect(mockWithJobLock.mock.calls[0][0]).toBe("attendance-10min-v2");
  });

  it("clears stale v2 locks at startup", async () => {
    configureCreds();
    await captureAttendanceTick();

    expect(mockClearExpiredLock).toHaveBeenCalledWith("attendance-10min-v2");
  });

  it("does not crash the cron loop when the credentials check itself throws", async () => {
    mockGetKekaCredentials.mockRejectedValue(new Error("firebase down"));
    const tick = await captureAttendanceTick();

    await expect(tick()).resolves.toBeUndefined();
    expect(mockWithJobLock).not.toHaveBeenCalled();
  });
});

describe("Keka nightly scheduler — same pre-lock credentials gate", () => {
  it("never acquires the lock when credentials are missing", async () => {
    configureCreds({ creds: null });
    const tick = captureKekaTick();

    await tick();

    expect(mockWithJobLock).not.toHaveBeenCalled();
  });

  it("never acquires the lock on a partial credential set", async () => {
    configureCreds({ clientSecret: null });
    const tick = captureKekaTick();

    await tick();

    expect(mockWithJobLock).not.toHaveBeenCalled();
  });

  it("acquires the v2 lock when fully configured", async () => {
    configureCreds();
    const tick = captureKekaTick();

    await tick();

    expect(mockWithJobLock).toHaveBeenCalledTimes(1);
    expect(mockWithJobLock.mock.calls[0][0]).toBe("keka-nightly-v2");
  });
});
