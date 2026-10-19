import { createHash } from "node:crypto";
import cron from "node-cron";
import { getAdminAuth, getAdminDatabase } from "./firebase-admin";
import { isStaffEmail, membershipAllows, normalizeMembership } from "./client-portal";
import { DEFAULTS, permissions, studioUrgency, values, type RecordData } from "./creative-studio";
import { isEmailConfigured, sendEmail } from "./microsoft-graph";
import { withJobLock } from "./job-lock";
import { APP_BASE_URL } from "./app-url";
import { logger } from "./logger";

const read = async (path: string) => (await getAdminDatabase().ref(path).once("value")).val();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const deliveryEnabled = () => process.env.CREATIVE_STUDIO_EMAIL_DELIVERY === "enabled";

/** Recomputed immediately before transport; no browser-provided email addresses. */
async function recipient(item: RecordData, kind: string, enforceAutomation = true) {
  const config = await read(`creativeStudio/configs/${item.clientId}`);
  if (!config?.enabled || !item.shared || item.archived || item.stage === "internal_draft") return null;
  const settings = { ...DEFAULTS, ...await read("creativeStudio/defaults"), ...config.automation };
  // The Control Centre email switch covers every kind, including explicit requests
  // and manual reminders. Recheck it at transport time, not just when queueing.
  if (enforceAutomation && !settings.enabled) return null;
  const phase = item.stage.includes("reference") ? "reference" : "final";
  const approval = kind === "decision"
    ? Object.values(item.approvals ?? {}).filter((a: any) => a.decidedAt).sort((a: any, b: any) => b.decidedAt - a.decidedAt)[0] as RecordData | undefined
    : item.approvals?.[phase];
  if (kind === "decision" || kind === "escalation") {
    if (kind === "escalation" && (!approval || approval.status !== "pending")) return null;
    const users = values(await read("users"));
    const owner = users.find(u => String(u.id) === String(item.ownerId) && u.active !== false && u.disabled !== true && !u.archived);
    const client = values(await read("clients")).find(c => String(c.id) === String(item.clientId) && !c.archived && !c.deleted);
    if (!owner || !client || !isStaffEmail(owner.email) || !permissions(owner, client, config).editor) return null;
    return { email: owner.email as string, uid: String(owner.id), revision: approval?.revision ?? item.revision };
  }
  if (!approval || approval.status !== "pending" || !["awaiting_reference", "awaiting_final"].includes(item.stage)) return null;
  const m = normalizeMembership(await read(`clientPortalUsers/${approval.approverUid}`));
  if (!m || isStaffEmail(m.email) || !membershipAllows(m, m.email, String(item.clientId))) return null;
  try {
    const authUser = await getAdminAuth().getUser(approval.approverUid);
    if (authUser.disabled || !authUser.emailVerified || authUser.email?.toLowerCase() !== m.email.toLowerCase()) return null;
  } catch { return null; }
  return { email: m.email, uid: approval.approverUid, revision: approval.revision };
}

export async function queueStudioEmail(item: RecordData, kind: "request" | "reminder" | "decision" | "escalation") {
  const target = await recipient(item, kind, false);
  if (!target) return;
  const config = await read(`creativeStudio/configs/${item.clientId}`);
  const settings = { ...DEFAULTS, ...await read("creativeStudio/defaults"), ...config?.automation };
  // One reminder per cadence window, including manual retries and multiple instances.
  const window = kind === "reminder" || kind === "escalation" ? Math.floor(Date.now() / (Math.max(1, settings.cadenceDays) * 86400000)) : 0;
  const key = hash(`${item.id}:${target.revision}:${kind}:${target.uid}:${window}`);
  const ref = getAdminDatabase().ref(`creativeStudio/deliveries/${item.clientId}/${key}`);
  if (kind === "reminder" || kind === "escalation") {
    const cooldown = getAdminDatabase().ref(`creativeStudio/cooldowns/${item.clientId}/${hash(`${item.id}:${target.revision}:${target.uid}:${kind}`)}`);
    const now = Date.now();
    const reserved = await cooldown.transaction(current => {
      if (current && now - current.at < Math.max(1, settings.cadenceDays) * 86400000) return;
      return { at: now };
    });
    if (!reserved.committed) return;
  }
  await ref.transaction(current => current ?? { id: key, itemId: item.id, clientId: item.clientId, revision: target.revision, recipientUid: target.uid, kind, createdAt: Date.now(), status: deliveryEnabled() && settings.enabled ? "queued" : "suppressed", ...(!settings.enabled ? { reason: "Client email automation is disabled." } : !deliveryEnabled() ? { reason: "Server email delivery is disabled." } : {}), attempts: 0 });
  // Sending occurs only in the explicitly enabled worker. Requests cannot deliver mail.
}

export async function runStudioEmailWorker() {
  if (!deliveryEnabled() || !isEmailConfigured()) return;
  await withJobLock("creative-studio-email", 55000, async () => {
    const configs = await read("creativeStudio/configs") ?? {};
    for (const [clientId, raw] of Object.entries(configs)) {
      const config = raw as RecordData;
      if (!config.enabled) continue;
      const settings = { ...DEFAULTS, ...await read("creativeStudio/defaults"), ...config.automation };
      const items = values(await read(`creativeStudio/items/${clientId}`));
      if (settings.enabled) {
        const now = new Date();
        const time = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
        // Only today's scheduled minute is eligible: never replay a disabled/missed backlog.
        if (time === settings.sendTime) for (const item of items) {
          await queueStudioEmail(item, "reminder");
          if (studioUrgency(item, now.getTime()) === "near") await queueStudioEmail(item, "escalation");
        }
      }
      for (const delivery of values(await read(`creativeStudio/deliveries/${clientId}`))) {
        if (delivery.status === "sending" && Date.now() - delivery.startedAt > 10 * 60000) {
          await getAdminDatabase().ref(`creativeStudio/deliveries/${clientId}/${delivery.id}`).update({ status: "unconfirmed", error: "Worker interrupted after claiming delivery. Check the sender mailbox before retrying; no automatic resend." });
          continue;
        }
        if (!["queued", "retry"].includes(delivery.status) || delivery.attempts >= 3 || (delivery.nextAttemptAt ?? 0) > Date.now()) continue;
        const ref = getAdminDatabase().ref(`creativeStudio/deliveries/${clientId}/${delivery.id}`);
        if (Date.now() - delivery.createdAt > 86400000 || delivery.createdAt < (config.enabledAt ?? 0)) { await ref.update({ status: "expired" }); continue; }
        const claimed = await ref.transaction(current => {
          if (!current || !["queued", "retry"].includes(current.status)) return;
          return { ...current, status: "sending", attempts: current.attempts + 1, startedAt: Date.now() };
        });
        if (!claimed.committed) continue;
        const item = await read(`creativeStudio/items/${clientId}/${delivery.itemId}`);
        const target = item && await recipient(item, delivery.kind);
        if (!target || String(target.uid) !== String(delivery.recipientUid) || target.revision !== delivery.revision || delivery.createdAt < (item.reminderEpoch ?? 0)) { await ref.update({ status: "cancelled" }); continue; }
        const subject = delivery.kind === "decision" ? "Flow Pro: creative approval updated" : "Flow Pro: creative approval pending";
        const url = studioEmailLink(item, delivery.kind);
        try {
          await sendEmail({ to: target.email, subject, bodyHtml: `<p>${escape(item.title)}</p><p><a href="${escape(url)}">Sign in to view this deliverable</a>.</p>` });
          await ref.update({ status: "sent", sentAt: Date.now() });
        } catch {
          // Graph sendMail lacks a transactional idempotency guarantee. Never retry an
          // ambiguous transport failure automatically, which could duplicate real email.
          await ref.update({ status: "failed", error: "Delivery failed or could not be confirmed; automatic retry disabled to prevent duplicates." });
        }
      }
    }
  });
}

export function startStudioEmailScheduler() {
  if (!deliveryEnabled() || !isEmailConfigured()) return; // No credentials means no shared lock or Firebase work.
  cron.schedule("* * * * *", () => { void runStudioEmailWorker().catch(error => logger.error({ errorType: error instanceof Error ? error.name : "Unknown" }, "Creative Studio mail worker failed")); });
}

export function studioEmailLink(item: RecordData, kind: string): string {
  const url = new URL(`${APP_BASE_URL.replace(/\/$/, "")}/`);
  if (kind === "request" || kind === "reminder") url.searchParams.set("client", "1");
  url.searchParams.set("deliverable", String(item.id));
  return url.toString();
}
