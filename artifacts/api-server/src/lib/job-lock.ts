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
