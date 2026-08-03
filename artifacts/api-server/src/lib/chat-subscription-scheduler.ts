/**
 * Chat Subscription Renewal Scheduler
 *
 * Microsoft Graph /chats/{id}/messages subscriptions (app-only, no resource data)
 * have a maximum lifetime of 60 minutes. This scheduler runs every 10 minutes and
 * renews subscriptions that are within RENEW_BEFORE_EXPIRY_MS of their expiry so
 * Teams replies never silently stop arriving in Flow Pro.
 *
 * Firebase paths checked:
 *   teamsDMs/botChats/{chatKey}/subscription  — lightweight; only subscription data stored here
 *   teamsDMs/chats/{chatKey}/subscription     — messages also live under chats/{key}, so we
 *                                               read only the subscription subpath per key
 *                                               to avoid downloading message history.
 *
 * Subscription record shape (stored in Firebase):
 *   {
 *     id: string;          — Graph subscription ID
 *     expiresAt: number;   — Unix ms
 *     status?: "active" | "expired" | "renewal_failed";
 *     renewalFailureCount?: number;
 *     lastRenewalAttemptAt?: number;
 *   }
 *
 * Graph subscription lifetime:   60 min max (app-only chat messages, no resource data)
 * Requested renewal duration:    55 min (5 min safety margin below Graph maximum)
 * Renewal trigger window:        12 min before expiry (10 min + 2 min buffer for clock
 *                                skew, scheduling jitter, and network latency)
 */

import cron from "node-cron";
import { listFirebaseChildKeys, readFirebasePath, writeFirebasePath } from "./firebase-admin";
import { GraphApiError, renewChatSubscription } from "./microsoft-graph";
import { logger } from "./logger";
import { withJobLock } from "./job-lock";
import { mapLimit } from "./async-utils";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Renew a subscription when it has fewer than this many milliseconds remaining.
 * 12 minutes: 10-minute nominal window + 2-minute buffer for clock skew, scheduling
 * jitter, and Microsoft Graph processing latency.
 */
const RENEW_BEFORE_EXPIRY_MS = 12 * 60 * 1000;

/**
 * Lock TTL must be longer than the maximum expected run time.
 * We process at most ~3 subscriptions concurrently (see RENEWAL_CONCURRENCY) so
 * even with hundreds of chats and slow Graph calls, 15 minutes is generous headroom
 * well above the 10-minute cron interval.
 */
const LOCK_TTL_MS = 15 * 60 * 1000;

/** Bounded concurrency for Graph renewal calls — avoids overwhelming the API. */
const RENEWAL_CONCURRENCY = 3;

/**
 * After this many consecutive renewal failures, mark the subscription as expired
 * and stop retrying automatically. The next /send or /open will recreate it.
 */
const MAX_RENEWAL_FAILURES = 3;

/** Single lock key used for both startup and scheduled runs so they cannot overlap. */
const JOB_LOCK_KEY = "chat-subscription-renewal";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SubscriptionRecord {
  id: string;
  expiresAt: number;
  status?: "active" | "expired" | "renewal_failed";
  renewalFailureCount?: number;
  lastRenewalAttemptAt?: number;
}

export interface SubRenewalCounts {
  renewed: number;
  notDue: number;    // Valid and not yet within the renewal window
  expired: number;   // Already past their expiry time
  invalid: number;   // Malformed Firebase records
  failed: number;    // Graph API call failed
  errors: string[];  // Non-sensitive error summaries (no tokens or secrets)
}

export interface ChatSubscriptionRenewalResult {
  botChats: SubRenewalCounts;
  chats: SubRenewalCounts;
}

// ── Validation helpers ─────────────────────────────────────────────────────────

/** Returns true when `val` is a plausible Unix-millisecond timestamp (year 2020–2100). */
function isPlausibleTimestampMs(val: unknown): val is number {
  return (
    typeof val === "number" &&
    Number.isFinite(val) &&
    val > 1_577_836_800_000 && // 2020-01-01
    val < 4_102_444_800_000    // 2100-01-01
  );
}

/**
 * Validate a raw Firebase value as a SubscriptionRecord.
 * Returns the record if valid, otherwise null.
 */
function parseSubscriptionRecord(raw: unknown): SubscriptionRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id.trim()) return null;
  if (!isPlausibleTimestampMs(r.expiresAt)) return null;
  return {
    id: r.id,
    expiresAt: r.expiresAt as number,
    status: (typeof r.status === "string" ? r.status : undefined) as SubscriptionRecord["status"],
    renewalFailureCount: typeof r.renewalFailureCount === "number" ? r.renewalFailureCount : 0,
    lastRenewalAttemptAt: typeof r.lastRenewalAttemptAt === "number" ? r.lastRenewalAttemptAt : undefined,
  };
}

// ── Core renewal logic ─────────────────────────────────────────────────────────

interface RenewalTask {
  chatKey: string;
  sub: SubscriptionRecord;
  subPath: string;
}

async function renewOne(task: RenewalTask): Promise<"renewed" | "failed"> {
  const { chatKey, sub, subPath } = task;
  const idSuffix = sub.id.slice(-6); // partial ID for logs — not a secret, but minimal surface

  const now = Date.now();
  const failureCount = sub.renewalFailureCount ?? 0;
  const attempt = failureCount + 1;

  logger.info(
    { chatKey, subscriptionIdSuffix: idSuffix, expiresAt: new Date(sub.expiresAt).toISOString(), attempt },
    "[ChatSubRenewal] Renewing subscription"
  );

  try {
    const newExpiryStr = await renewChatSubscription(sub.id);

    // Validate the expiry Graph returned before writing to Firebase.
    const newExpiresAt = Date.parse(newExpiryStr);
    if (!Number.isFinite(newExpiresAt)) {
      throw new Error(`Graph returned an unparseable expiry: ${String(newExpiryStr).slice(0, 50)}`);
    }
    if (newExpiresAt <= now) {
      throw new Error(`Graph returned an expiry already in the past: ${new Date(newExpiresAt).toISOString()}`);
    }
    if (newExpiresAt <= sub.expiresAt) {
      throw new Error(
        `Graph returned an expiry (${new Date(newExpiresAt).toISOString()}) not later than current (${new Date(sub.expiresAt).toISOString()})`
      );
    }

    await writeFirebasePath(subPath, {
      id: sub.id,
      expiresAt: newExpiresAt,
      status: "active",
      renewalFailureCount: 0,
      lastRenewalAttemptAt: now,
    } satisfies SubscriptionRecord);

    logger.info(
      {
        chatKey,
        subscriptionIdSuffix: idSuffix,
        oldExpiry: new Date(sub.expiresAt).toISOString(),
        newExpiry: new Date(newExpiresAt).toISOString(),
      },
      "[ChatSubRenewal] Subscription renewed"
    );
    return "renewed";
  } catch (err) {
    const isNotFound = err instanceof GraphApiError && err.status === 404;
    const isThrottled = err instanceof GraphApiError && err.status === 429;
    const msg = err instanceof Error ? err.message : String(err);

    if (isNotFound) {
      // Subscription no longer exists on Graph — mark expired so next send/open recreates it.
      logger.warn(
        { chatKey, subscriptionIdSuffix: idSuffix },
        "[ChatSubRenewal] Subscription not found on Graph (404) — marking expired"
      );
      await writeFirebasePath(subPath, {
        ...sub,
        status: "expired",
        renewalFailureCount: MAX_RENEWAL_FAILURES,
        lastRenewalAttemptAt: now,
      } satisfies SubscriptionRecord).catch(() => { /* best-effort */ });
      return "failed";
    }

    if (isThrottled) {
      logger.warn(
        { chatKey, subscriptionIdSuffix: idSuffix },
        "[ChatSubRenewal] Graph is throttling renewal requests (429) — will retry next run"
      );
    } else {
      logger.error(
        { chatKey, subscriptionIdSuffix: idSuffix, errMsg: msg.slice(0, 200) },
        "[ChatSubRenewal] Renewal failed"
      );
    }

    const newFailureCount = failureCount + 1;
    const nowPermanentlyFailed = newFailureCount >= MAX_RENEWAL_FAILURES;

    await writeFirebasePath(subPath, {
      ...sub,
      status: nowPermanentlyFailed ? "expired" : "renewal_failed",
      renewalFailureCount: newFailureCount,
      lastRenewalAttemptAt: now,
    } satisfies SubscriptionRecord).catch(() => { /* best-effort */ });

    if (nowPermanentlyFailed) {
      logger.warn(
        { chatKey, subscriptionIdSuffix: idSuffix, failureCount: newFailureCount },
        "[ChatSubRenewal] Max renewal failures reached — marked expired; will recreate on next chat open/send"
      );
    }

    return "failed";
  }
}

// ── Subscription scanning ──────────────────────────────────────────────────────

/**
 * Scan subscriptions stored under `parentPath` and renew those within the renewal window.
 *
 * For `teamsDMs/botChats`, each child contains only subscription data so the full node
 * is read at once. For `teamsDMs/chats`, each child also contains message history, so
 * we list child keys via a shallow REST query and read only each `{key}/subscription`
 * individually to avoid downloading message data.
 */
async function renewSubscriptionsUnder(
  parentPath: string,
  label: string,
  /** When true, list keys via shallow REST query and read each subscription individually. */
  shallowKeyListing: boolean
): Promise<SubRenewalCounts> {
  const counts: SubRenewalCounts = { renewed: 0, notDue: 0, expired: 0, invalid: 0, failed: 0, errors: [] };
  const now = Date.now();
  const renewBefore = now + RENEW_BEFORE_EXPIRY_MS;

  // Collect (chatKey, rawSubscription) pairs.
  let entries: Array<{ chatKey: string; rawSub: unknown }>;

  if (shallowKeyListing) {
    // Read just child keys to avoid downloading message history.
    let chatKeys: string[];
    try {
      chatKeys = await listFirebaseChildKeys(parentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ parentPath, errMsg: msg }, `[ChatSubRenewal] ${label}: failed to list chat keys`);
      counts.errors.push(`Key listing failed: ${msg.slice(0, 100)}`);
      return counts;
    }

    // Read each subscription path in parallel (bounded by RENEWAL_CONCURRENCY below).
    entries = await Promise.all(
      chatKeys.map(async (chatKey) => ({
        chatKey,
        rawSub: await readFirebasePath<unknown>(`${parentPath}/${chatKey}/subscription`).catch(() => null),
      }))
    );
  } else {
    // Path is lightweight — read in one call.
    let parentData: Record<string, { subscription?: unknown } | null> | null;
    try {
      parentData = await readFirebasePath<typeof parentData>(parentPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ parentPath, errMsg: msg }, `[ChatSubRenewal] ${label}: failed to read parent node`);
      counts.errors.push(`Parent read failed: ${msg.slice(0, 100)}`);
      return counts;
    }

    if (!parentData || typeof parentData !== "object") {
      logger.debug({ parentPath }, `[ChatSubRenewal] ${label}: no data found`);
      return counts;
    }

    entries = Object.entries(parentData).map(([chatKey, chatData]) => ({
      chatKey,
      rawSub: chatData && typeof chatData === "object" ? chatData.subscription : null,
    }));
  }

  // Categorise each entry; collect tasks that need renewal.
  const renewalTasks: RenewalTask[] = [];

  for (const { chatKey, rawSub } of entries) {
    if (rawSub === null || rawSub === undefined) {
      counts.invalid++;
      continue;
    }

    const sub = parseSubscriptionRecord(rawSub);
    if (!sub) {
      logger.warn({ chatKey, label }, `[ChatSubRenewal] ${label}: malformed subscription record`);
      counts.invalid++;
      continue;
    }

    // Stop retrying permanently failed subscriptions — they will be recreated on next open/send.
    if ((sub.renewalFailureCount ?? 0) >= MAX_RENEWAL_FAILURES || sub.status === "expired") {
      counts.expired++;
      continue;
    }

    if (sub.expiresAt <= now) {
      // Already past expiry — can't renew; mark expired if not already.
      logger.warn(
        { chatKey, label, expiresAt: new Date(sub.expiresAt).toISOString() },
        `[ChatSubRenewal] ${label}: subscription already expired — marking expired in Firebase`
      );
      const subPath = `${parentPath}/${chatKey}/subscription`;
      writeFirebasePath(subPath, {
        ...sub,
        status: "expired",
        renewalFailureCount: MAX_RENEWAL_FAILURES,
      } satisfies SubscriptionRecord).catch(() => { /* best-effort */ });
      counts.expired++;
      continue;
    }

    if (sub.expiresAt > renewBefore) {
      // Still has plenty of time — no action needed.
      counts.notDue++;
      continue;
    }

    // Within the renewal window — queue for renewal.
    renewalTasks.push({ chatKey, sub, subPath: `${parentPath}/${chatKey}/subscription` });
  }

  // Renew with bounded concurrency so we don't overwhelm Microsoft Graph.
  if (renewalTasks.length > 0) {
    await mapLimit(renewalTasks, RENEWAL_CONCURRENCY, async (task) => {
      const outcome = await renewOne(task);
      if (outcome === "renewed") {
        counts.renewed++;
      } else {
        counts.failed++;
        counts.errors.push(`Renewal failed for chat ${task.chatKey}`);
      }
    });
  }

  return counts;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function runChatSubscriptionRenewal(): Promise<ChatSubscriptionRenewalResult> {
  logger.info("[ChatSubRenewal] Running subscription renewal check");

  const [botChats, chats] = await Promise.all([
    // botChats: only subscription data stored here — safe to read fully.
    renewSubscriptionsUnder("teamsDMs/botChats", "botChats", false),
    // chats: message history also stored under each key — use shallow key listing.
    renewSubscriptionsUnder("teamsDMs/chats", "chats", true),
  ]);

  const result: ChatSubscriptionRenewalResult = { botChats, chats };

  logger.info(
    {
      botChats: { renewed: botChats.renewed, notDue: botChats.notDue, expired: botChats.expired, invalid: botChats.invalid, failed: botChats.failed },
      chats:    { renewed: chats.renewed,    notDue: chats.notDue,    expired: chats.expired,    invalid: chats.invalid,    failed: chats.failed    },
    },
    "[ChatSubRenewal] Renewal check complete"
  );

  return result;
}

// ── Scheduler registration ─────────────────────────────────────────────────────

/** Guard against duplicate cron registration during hot reload or test setup. */
let schedulerStarted = false;

export function startChatSubscriptionRenewalScheduler(): void {
  if (schedulerStarted) {
    logger.warn("[ChatSubRenewal] Scheduler already started — skipping duplicate registration");
    return;
  }
  schedulerStarted = true;

  // Scheduled run — every 10 minutes.
  // Both startup and scheduled runs use the same JOB_LOCK_KEY so they cannot overlap.
  cron.schedule("*/10 * * * *", () => {
    withJobLock(JOB_LOCK_KEY, LOCK_TTL_MS, () =>
      runChatSubscriptionRenewal().then(() => void 0)
    ).catch((err) =>
      logger.error({ err }, "[ChatSubRenewal] Unhandled error in scheduled renewal")
    );
  });

  // Startup run — renews subscriptions close to expiry that were missed while the server
  // was down. Note: subscriptions that *already expired* while the server was down are
  // marked as expired in Firebase and will be recreated on the next /send or /open call.
  withJobLock(JOB_LOCK_KEY, LOCK_TTL_MS, () =>
    runChatSubscriptionRenewal().then(() => void 0)
  ).catch((err) =>
    logger.error({ err }, "[ChatSubRenewal] Unhandled error in startup renewal")
  );

  logger.info("[ChatSubRenewal] Scheduler started — checking every 10 minutes");
}
