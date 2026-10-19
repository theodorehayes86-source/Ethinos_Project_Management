import { createHash } from "node:crypto";
import cron from "node-cron";
import { getAdminAuth, getAdminDatabase } from "./firebase-admin";
import { isStaffEmail, membershipAllows, normalizeMembership } from "./client-portal";
import { automationSettings, permissions, studioUrgency, values, type RecordData, type ApprovalPhase } from "./creative-studio";
import { fromZonedTime } from "date-fns-tz";
import { isEmailConfigured, sendEmail } from "./microsoft-graph";
import { withJobLock } from "./job-lock";
import { APP_BASE_URL } from "./app-url";
import { logger } from "./logger";

const read = async (path: string) => (await getAdminDatabase().ref(path).once("value")).val();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const deliveryEnabled = () => process.env.CREATIVE_STUDIO_EMAIL_DELIVERY === "enabled";
export const approvalPhase = (item: RecordData): ApprovalPhase => item.stage?.includes("reference") ? "reference" : "final";
const emailPhase = (item: RecordData, kind: string): ApprovalPhase => kind === "decision"
  ? (Object.entries(item.approvals ?? {}).filter(([, a]) => (a as RecordData).decidedAt).sort(([, a], [, b]) => (b as RecordData).decidedAt - (a as RecordData).decidedAt)[0]?.[0] as ApprovalPhase ?? approvalPhase(item))
  : approvalPhase(item);

/** Templates are plain text. Only our own deep link becomes an HTML link. */
export function renderStudioEmail(item: RecordData, client: RecordData, settings: ReturnType<typeof automationSettings>, phase: ApprovalPhase, kind = "reminder") {
  const date = (value: string | undefined, dateOnly = false) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-GB", { timeZone: dateOnly ? "UTC" : item.timezone ?? settings.timezone, day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Not scheduled";
  const zone = item.timezone ?? settings.timezone;
  const deadline = item.productionDueDate
    ? `${date(item.productionDueDate, true)}${item.productionDueTime ? ` at ${item.productionDueTime} (${zone})` : " (time not set)"}`
    : item.plannedAt && Number.isFinite(Date.parse(item.plannedAt))
      ? `${date(item.plannedAt)} at ${new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(item.plannedAt))} (${zone})`
      : "Not scheduled";
  const data: Record<string, string> = { client: String(client.name ?? "Client"), post: String(item.title ?? ""), type: String(item.type ?? "Creative"), date: date(item.plannedAt), deadline };
  const fill = (template: string) => template.replace(/{{(client|post|date|type|deadline)}}/g, (_, key: string) => data[key]);
  const subject = (kind === "decision" ? "Flow Pro: creative approval updated" : fill(settings[phase].subject)).replace(/[\r\n]+/g, " ");
  const content = kind === "decision" ? `${item.title}: creative approval updated.` : fill(settings[phase].body);
  const url = studioEmailLink(item, kind);
  return { subject, body: `${content}\n\nSign in to view this deliverable: ${url}`, bodyHtml: `<p>${escape(content).replace(/\r?\n/g, "<br>")}</p><p><a href="${escape(url)}">Sign in to view this deliverable</a>.</p>` };
}

/** Recomputed immediately before transport; no browser-provided email addresses. */
async function recipient(item: RecordData, kind: string, enforceAutomation = true) {
  const config = await read(`creativeStudio/configs/${item.clientId}`);
  if (!config?.enabled || !item.shared || item.archived || item.stage === "internal_draft") return null;
  const client = values(await read("clients")).find(c => String(c.id) === String(item.clientId) && !c.archived && !c.deleted);
  if (!client) return null;
  const settings = automationSettings(await read("creativeStudio/defaults"), config.automation);
  // The Control Centre email switch covers every kind, including explicit requests
  // and manual reminders. Recheck it at transport time, not just when queueing.
  if (enforceAutomation && !settings.enabled) return null;
  const phase = emailPhase(item, kind);
  if (enforceAutomation && kind !== "decision" && !settings[phase].enabled) return null;
  const approval = kind === "decision"
    ? Object.values(item.approvals ?? {}).filter((a: any) => a.decidedAt).sort((a: any, b: any) => b.decidedAt - a.decidedAt)[0] as RecordData | undefined
    : item.approvals?.[phase];
  let approver: { email: string; uid: string; revision: number; name: string } | null = null;
  if (kind !== "decision") {
    if (!approval || approval.status !== "pending" || !["awaiting_reference", "awaiting_final"].includes(item.stage) || item.scheduled) return null;
    if (kind === "escalation" && studioUrgency(item, Date.now(), settings[phase].escalationDays) === "none") return null;
    const m = normalizeMembership(await read(`clientPortalUsers/${approval.approverUid}`));
    if (!m || isStaffEmail(m.email) || !membershipAllows(m, m.email, String(item.clientId))) return null;
    try {
      const authUser = await getAdminAuth().getUser(approval.approverUid);
      if (authUser.disabled || !authUser.emailVerified || authUser.email?.toLowerCase() !== m.email.toLowerCase()) return null;
      approver = { email: m.email, uid: approval.approverUid, revision: approval.revision, name: authUser.displayName ?? m.email };
    } catch { return null; }
  }
  if (kind === "decision" || kind === "escalation") {
    const users = values(await read("users"));
    const owner = users.find(u => String(u.id) === String(item.ownerId) && u.active !== false && u.disabled !== true && !u.archived);
    if (!owner || !client || !isStaffEmail(owner.email) || !permissions(owner, client, config).editor) return null;
    return { email: owner.email as string, uid: String(owner.id), revision: approval?.revision ?? item.revision, name: owner.name ?? owner.email };
  }
  return approver;
}

export async function queueStudioEmail(item: RecordData, kind: "request" | "reminder" | "decision" | "escalation") {
  const target = await recipient(item, kind, false);
  if (!target) return;
  const config = await read(`creativeStudio/configs/${item.clientId}`);
  const settings = automationSettings(await read("creativeStudio/defaults"), config?.automation);
  const phase = emailPhase(item, kind);
  const enabled = settings.enabled && (kind === "decision" || settings[phase].enabled);
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
  await ref.transaction(current => current ?? { id: key, itemId: item.id, itemTitle: item.title, approvalPhase: phase, clientId: item.clientId, revision: target.revision, recipientUid: target.uid, recipientName: target.name, kind, createdAt: Date.now(), status: deliveryEnabled() && enabled ? "queued" : "suppressed", ...(!settings.enabled ? { reason: "Client email automation is disabled." } : !enabled ? { reason: "Approval phase email automation is disabled." } : !deliveryEnabled() ? { reason: "Server email delivery is disabled." } : {}), attempts: 0 });
  // Sending occurs only in the explicitly enabled worker. Requests cannot deliver mail.
}

/** Read-only projection, not delivery records and never evidence of a send/open. */
export async function studioDeliveries(clientId: string) {
  const raw = values(await read(`creativeStudio/deliveries/${clientId}`));
  const items = values(await read(`creativeStudio/items/${clientId}`));
  const config = await read(`creativeStudio/configs/${clientId}`);
  const settings = automationSettings(await read("creativeStudio/defaults"), config?.automation);
  const recipientNames = new Map<string, string>();
  for (const user of values(await read("users"))) if (user.name) recipientNames.set(String(user.id), String(user.name));
  for (const uid of new Set(raw.filter(d => !d.recipientName && d.recipientUid).map(d => String(d.recipientUid)))) {
    if (recipientNames.has(uid)) continue;
    const membership = normalizeMembership(await read(`clientPortalUsers/${uid}`));
    if (!membership || !membershipAllows(membership, membership.email, clientId)) continue;
    try {
      const user = await getAdminAuth().getUser(uid);
      if (!user.disabled && user.emailVerified && user.email?.toLowerCase() === membership.email.toLowerCase()) recipientNames.set(uid, user.displayName ?? membership.email);
    } catch { /* Historical rows remain available with an unknown recipient name. */ }
  }
  const deliveries = raw.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200).map(d => {
    const item = items.find(i => i.id === d.itemId);
    // Preserve historical names/phase; legacy rows can use the matching approval revision.
    const phase = d.approvalPhase ?? Object.entries(item?.approvals ?? {}).find(([, a]) => (a as RecordData).revision === d.revision)?.[0] ?? null;
    return { ...d, itemTitle: item?.title ?? d.itemTitle ?? null, approvalPhase: phase, recipientName: d.recipientName ?? recipientNames.get(String(d.recipientUid)) ?? null };
  });
  const upcoming: RecordData[] = [];
  if (!config?.enabled || !settings.enabled || !deliveryEnabled() || !isEmailConfigured()) return { deliveries, upcoming };
  const now = Date.now(), cadence = Math.max(1, settings.cadenceDays) * 86400000;
  const dayParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(p => [p.type, p.value]));
  const today = Date.UTC(Number(dayParts.year), Number(dayParts.month) - 1, Number(dayParts.day));
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const item of items) {
    const target = await recipient(item, "reminder");
    if (!target) continue;
    const cooldown = await read(`creativeStudio/cooldowns/${clientId}/${hash(`${item.id}:${target.revision}:${target.uid}:reminder`)}`);
    const earliest = Math.max(now, (cooldown?.at ?? 0) + (cooldown ? cadence : 0), item.reminderEpoch ?? 0);
    // Advance calendar dates, not 24h instants, so DST matches the worker.
    for (let offset = 0; offset <= 400; offset++) {
      const localDay = new Date(today + offset * 86400000).toISOString().slice(0, 10);
      const scheduledAt = fromZonedTime(`${localDay}T${settings.sendTime}:00`, settings.timezone).getTime();
      if (scheduledAt <= earliest) continue;
      if (clock.format(scheduledAt) !== settings.sendTime) continue; // Nonexistent DST wall-clock minute.
      const key = hash(`${item.id}:${target.revision}:reminder:${target.uid}:${Math.floor(scheduledAt / cadence)}`);
      if (raw.some(d => d.id === key)) continue;
      upcoming.push({ id: `scheduled-${key}`, itemId: item.id, clientId, itemTitle: item.title, approvalPhase: approvalPhase(item), recipientUid: target.uid, recipientName: target.name, revision: target.revision, kind: "reminder", scheduledAt, status: "scheduled" });
      break;
    }
  }
  return { deliveries, upcoming: upcoming.sort((a, b) => a.scheduledAt - b.scheduledAt) };
}

export async function runStudioEmailWorker() {
  if (!deliveryEnabled() || !isEmailConfigured()) return;
  await withJobLock("creative-studio-email", 55000, async () => {
    const configs = await read("creativeStudio/configs") ?? {};
    for (const [clientId, raw] of Object.entries(configs)) {
      const config = raw as RecordData;
      if (!config.enabled) continue;
      const settings = automationSettings(await read("creativeStudio/defaults"), config.automation);
      const items = values(await read(`creativeStudio/items/${clientId}`));
      if (settings.enabled) {
        const now = new Date();
        const time = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
        // Only today's scheduled minute is eligible: never replay a disabled/missed backlog.
        if (time === settings.sendTime) for (const item of items) {
          await queueStudioEmail(item, "reminder");
          if (studioUrgency(item, now.getTime(), settings[approvalPhase(item)].escalationDays) !== "none") await queueStudioEmail(item, "escalation");
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
        if (!target || String(target.uid) !== String(delivery.recipientUid) || target.revision !== delivery.revision || (delivery.approvalPhase && delivery.kind !== "decision" && delivery.approvalPhase !== approvalPhase(item)) || delivery.createdAt < (item.reminderEpoch ?? 0)) { await ref.update({ status: "cancelled" }); continue; }
        const liveConfig = await read(`creativeStudio/configs/${clientId}`);
        const liveSettings = automationSettings(await read("creativeStudio/defaults"), liveConfig?.automation);
        if (!deliveryEnabled() || !liveConfig?.enabled || !liveSettings.enabled || (delivery.kind !== "decision" && !liveSettings[approvalPhase(item)].enabled)) {
          await ref.update({ status: "cancelled" });
          continue;
        }
        const client = values(await read("clients")).find(c => String(c.id) === String(clientId)) ?? {};
        const { subject, bodyHtml } = renderStudioEmail(item, client, liveSettings, approvalPhase(item), delivery.kind);
        try {
          await sendEmail({ to: target.email, subject, bodyHtml });
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
