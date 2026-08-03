import { getAdminDatabase } from "./firebase-admin";
import { logger } from "./logger";
import { randomUUID } from "crypto";

interface LockRecord {
  owner: string;
  startedAt: string;
  expiresAt: string;
}

/**
 * Acquires a named distributed lock in Firebase under `schedulerLocks/{name}`,
 * runs the provided job, then releases the lock.
 *
 * If the lock is already held by another instance (and has not expired), the
 * job is skipped and the function returns false. Returns true when the job ran.
 *
 * The lock is acquired atomically via a Firebase Realtime Database transaction.
 * The `committed` field of the transaction result is used to determine whether
 * this instance won the race — it does not rely on side effects set inside the
 * transaction update callback, which can be called multiple times on retry.
 *
 * @param name    Stable lock name, e.g. "reminders-hourly"
 * @param ttlMs   Lock TTL in milliseconds — should be ~90% of the schedule interval
 * @param job     Async function to execute while the lock is held
 */
export async function withJobLock(
  name: string,
  ttlMs: number,
  job: () => Promise<void>
): Promise<boolean> {
  const db = getAdminDatabase();
  const lockRef = db.ref(`schedulerLocks/${name}`);
  const owner = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const startedAt = new Date(now).toISOString();

  let committed = false;

  try {
    const result = await lockRef.transaction((current: LockRecord | null) => {
      if (current !== null) {
        const expiry = new Date(current.expiresAt).getTime();
        if (Date.now() < expiry) {
          return undefined;
        }
      }
      return { owner, startedAt, expiresAt } satisfies LockRecord;
    });

    committed = result.committed;
  } catch (err) {
    logger.error({ err, name }, "[JobLock] Transaction error — skipping job");
    return false;
  }

  if (!committed) {
    logger.info({ name }, "[JobLock] Lock held by another instance — skipping run");
    return false;
  }

  logger.debug({ name, owner, expiresAt }, "[JobLock] Lock acquired");

  try {
    await job();
  } finally {
    try {
      const release = await lockRef.transaction((current: LockRecord | null) => {
        if (current?.owner === owner) {
          return null;
        }
        return undefined;
      });
      if (release.committed) {
        logger.debug({ name, owner }, "[JobLock] Lock released");
      } else {
        logger.debug({ name, owner }, "[JobLock] Lock already expired or re-acquired by another instance — no action taken");
      }
    } catch (err) {
      logger.warn({ err, name, owner }, "[JobLock] Failed to release lock — will expire naturally");
    }
  }

  return true;
}

/**
 * Reads the named lock and removes it if its `expiresAt` timestamp is already
 * in the past. Safe to call at startup — it never touches a lock that is still
 * within its TTL.
 *
 * Uses a Firebase transaction so the read-then-delete is atomic: if another
 * instance re-acquires the lock between the read and the delete, the
 * transaction aborts and the active lock is left untouched.
 *
 * @param name  Stable lock name, e.g. "attendance-10min"
 * @returns     true if a stale lock was cleared, false if no action was needed
 */
export async function clearExpiredLock(name: string): Promise<boolean> {
  const db = getAdminDatabase();
  const lockRef = db.ref(`schedulerLocks/${name}`);

  try {
    const result = await lockRef.transaction((current: LockRecord | null) => {
      if (current === null) {
        // No lock present — nothing to do; abort transaction.
        return undefined;
      }
      if (Date.now() < new Date(current.expiresAt).getTime()) {
        // Lock is still within its TTL — leave it alone; abort transaction.
        return undefined;
      }
      // Lock has expired — delete it.
      return null;
    });

    if (result.committed) {
      logger.warn(
        { name },
        "[JobLock] Cleared stale lock at startup — it had expired but was never released"
      );
      return true;
    }
  } catch (err) {
    logger.warn({ err, name }, "[JobLock] Could not check/clear lock at startup — proceeding anyway");
  }

  return false;
}
