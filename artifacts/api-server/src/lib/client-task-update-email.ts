import { createHash } from "node:crypto";
import { getAdminAuth, getAdminDatabase } from "./firebase-admin";
import { isStaffEmail, membershipAllows, normalizeMembership, projectClientTask, safeKey } from "./client-portal";
import { values, type RecordData } from "./creative-studio";
import { isEmailConfigured, isTeamsConfigured, resolveEntraObjectId, sendEmail, sendTeamsActivityNotification } from "./microsoft-graph";
import { logger } from "./logger";

export type ClientTaskUpdateEvent = {
  id: string;
  actorUid: string;
  at: number;
} & (
  { kind: "status"; before: string; after: string } |
  { kind: "message" | "note" | "link"; text: string; url: string | null } |
  { kind: "subtask-added" | "subtask-completed" | "subtask-reopened"; title: string }
);
const db = () => getAdminDatabase();
const read = async (path: string) => (await db().ref(path).once("value")).val();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function safeLink(value: string | null): string | null {
  if (!value || value.length > 2048 || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
const statusLabel = (value: string) => ({ WIP: "In Progress", Done: "Completed" })[value] ?? value;
const compact = (value: unknown, max: number) => {
  const plain = String(value ?? "").replace(/<[^>]*>/g, "").replace(/[<>&\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};
type NotificationSetting = { enabled?: boolean; teamsActivityEnabled?: boolean; customSubject?: string; customIntroText?: string };
const settingPath = "settings/notifications/client-task-updated";

function updateDetails(event: ClientTaskUpdateEvent) {
  if (event.kind === "status") return { change: `Status changed from ${statusLabel(event.before)} to ${statusLabel(event.after)}`, text: "" };
  if ("title" in event) return { change: { "subtask-added": "Subtask added", "subtask-completed": "Subtask completed", "subtask-reopened": "Subtask reopened" }[event.kind], text: event.title };
  return { change: { message: "New client message", note: "New client note", link: "New client link" }[event.kind], text: event.text || event.url || "" };
}

/** Legacy hook name retained; delivers independent email and Teams channels.
 * No email/body/transport error details in logs. Successful mutations remain
 * successful even when delivery, configuration or ledger storage fails. */
export async function sendClientTaskUpdateEmail(clientId: string, taskId: string, event: ClientTaskUpdateEvent): Promise<void> {
  try {
    if (![clientId, taskId, event.id, event.actorUid].every(safeKey) || clientId.startsWith("__")) return;
    const context = async () => {
      const actor = await getAdminAuth().getUser(event.actorUid);
      if (actor.disabled || !actor.emailVerified || !actor.email || isStaffEmail(actor.email)) return null;
      const membership = normalizeMembership(await read(`clientPortalUsers/${event.actorUid}`));
      if (!membershipAllows(membership, actor.email, clientId)) return null;
      const client = values(await read("clients")).find(c => c.id === clientId && !c.deleted && !c.archived);
      const task = await read(`clientLogs/${clientId}/${taskId}`);
      if (!client || !task || !projectClientTask(taskId, task, clientId)) return null;
      const allMemberships = Object.entries(await read("clientPortalUsers") ?? {});
      const clientEmails = new Set(allMemberships.map(([, m]) => String((m as RecordData)?.email ?? "").trim().toLowerCase()));
      const clientUids = new Set(allMemberships.map(([uid]) => uid));
      // Ordinary tasks have a single assigneeId. Multi-selection in staff forms
      // creates separate tasks; do not invent assigneeIds or trust assigneeEmail.
      const assigneeId = task.assigneeId;
      if ((typeof assigneeId !== "string" && typeof assigneeId !== "number") || !String(assigneeId)) return null;
      const recipients = new Map<string, { id: string; teamsEnabled: boolean }>();
      for (const user of values(await read("users"))) {
        if (String(user.id) !== String(assigneeId) || user.disabled === true || user.active === false || user.archived || user.role === "Client") continue;
        const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
        if (email.length > 254 || email.indexOf("@") > 64 ||
            !/^[a-z0-9_%+-](?:[a-z0-9._%+-]*[a-z0-9_%+-])?@ethinos\.com$/i.test(email) || email.includes("..") ||
            clientEmails.has(email) || clientUids.has(String(user.uid ?? user.id))) continue;
        if (!recipients.has(email)) recipients.set(email, { id: String(user.id), teamsEnabled: user.teamsNotificationsEnabled === true });
      }
      const name = actor.displayName?.trim();
      return { client, task, recipients, actorName: name && !name.includes("@") ? name.slice(0, 100) : "Client" };
    };
    const initial = await context();
    if (!initial) return;
    for (const recipient of initial.recipients.keys()) {
      // Keep the legacy email ledger unchanged. A sent email must never suppress
      // Teams, and failures or settings in either channel cannot block the other.
      for (const channel of ["email", "teams"] as const) {
        const ledger = channel === "email" ? "clientTaskUpdateEmailDeliveries" : "clientTaskUpdateTeamsDeliveries";
        const ref = db().ref(`${ledger}/${clientId}/${taskId}/${event.id}/${hash(recipient)}`);
        let claimed = false;
        try {
          const claim = await ref.transaction(current => current ? undefined :
            { state: "sending", createdAt: Date.now() }, undefined, false);
          if (!claim.committed) continue;
          claimed = true;
          const finish = (state: string, reason: string) => ref.update({ state, reason, finishedAt: Date.now() });
          const live = await context();
          const settings = (await read(settingPath) ?? {}) as NotificationSetting;
          const settingValue = channel === "email" ? settings.enabled : settings.teamsActivityEnabled;
          if (!live || !live.recipients.has(recipient)) { await finish("skipped", "access-unavailable"); continue; }
          if (settingValue === false) { await finish("skipped", "event-disabled"); continue; }
          const { change, text } = updateDetails(event);
          if (channel === "email") {
            if (!isEmailConfigured()) { await finish("skipped", "email-not-configured"); continue; }
            let detail = "";
            if ("title" in event) detail = `<p>${escape(event.title)}</p>`;
            else if ("text" in event) {
              const url = event.kind === "link" ? safeLink(event.url) : null;
              detail = `<p style="white-space:pre-wrap">${escape(event.text)}</p>` +
                (url ? `<p><a href="${escape(url)}">${escape(url)}</a></p>` : "");
            }
            const intro = typeof settings.customIntroText === "string" ? settings.customIntroText.trim().slice(0, 2000) : "";
            const prefix = typeof settings.customSubject === "string" ? compact(settings.customSubject, 160) : "";
            const bodyHtml = `<h2>Client task update</h2>${intro ? `<p>${escape(intro)}</p>` : ""}` +
              `<p>Client: ${escape(live.client.name)}</p><p>Task: ${escape(live.task.name)}</p><p>Updated by: ${escape(live.actorName)}</p>` +
              `<p>${escape(change)}</p>${detail}<p>Time: ${escape(new Date(event.at).toISOString())} (UTC)</p>`;
            // BCC settings are intentionally ignored: only assigned staff receive
            // this event. No assumed app URL or invented task deep link.
            await sendEmail({ to: recipient, subject: `${prefix ? `${prefix} — ` : ""}Client update on a shared task`, bodyHtml, sensitive: true });
          } else {
            const target = live.recipients.get(recipient)!;
            // Match notify.ts: staff must opt in to Teams at user level.
            if (!target.teamsEnabled) { await finish("skipped", "user-disabled"); continue; }
            if (!isTeamsConfigured()) { await finish("skipped", "teams-not-configured"); continue; }
            const objectId = await resolveEntraObjectId(recipient, target.id, { sensitive: true });
            if (!objectId) { await finish("skipped", "recipient-unresolved"); continue; }
            // Directory lookup may take time. Recheck client, assignment and
            // per-user/event preference before the actual Teams transport call.
            const final = await context();
            const finalSettings = (await read(settingPath) ?? {}) as NotificationSetting;
            if (!final?.recipients.get(recipient)?.teamsEnabled || finalSettings.teamsActivityEnabled === false) {
              await finish("skipped", "access-or-preference-changed"); continue;
            }
            const previewText = compact(`${compact(final.actorName, 24)} · ${compact(final.client.name, 24)} · ${compact(final.task.name, 32)} — ${change}${text ? ` · ${compact(text, 50)}` : ""}`, 150);
            // Existing transport uses the manifest-supported taskMention activity
            // type/template and handles app-installation/topic quirks. No DM.
            const result = await sendTeamsActivityNotification({
              recipientObjectId: objectId, mentionerName: compact(final.actorName, 80),
              taskName: compact(final.task.name, 120), clientName: compact(final.client.name, 80),
              previewText, taskId, sensitive: true,
            });
            if (!result.ok) {
              const reasons: Record<number, string> = { 400: "request-rejected", 403: "app-unavailable", 404: "recipient-unavailable", 409: "configuration-conflict" };
              const reason = result.status ? reasons[result.status] : undefined;
              await finish(reason ? "failed" : "unknown", reason ?? "transport-outcome-unknown");
              continue;
            }
          }
          await finish("sent", "delivered");
        } catch {
          // Any claimed outcome remains permanently blocked from auto-replay.
          if (claimed) {
            try { await ref.update({ state: "unknown", reason: "transport-outcome-unknown", finishedAt: Date.now() }); } catch { /* sending blocks replay */ }
          }
          logger.warn("Client task update notification delivery could not be confirmed; automatic retry disabled");
        }
      }
    }
  } catch {
    logger.warn("Client task update notifications could not be processed; task changes remain saved");
  }
}
