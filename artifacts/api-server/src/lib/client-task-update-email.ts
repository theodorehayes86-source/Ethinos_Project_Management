import { createHash } from "node:crypto";
import { getAdminAuth, getAdminDatabase } from "./firebase-admin";
import { isStaffEmail, membershipAllows, normalizeMembership, projectClientTask, safeKey } from "./client-portal";
import { values, type RecordData } from "./creative-studio";
import { isEmailConfigured, sendEmail } from "./microsoft-graph";
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

/** No email/body/transport error details in logs. A successful mutation must
 * remain successful even when delivery, configuration or ledger storage fails. */
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
      const recipients = new Set<string>();
      for (const user of values(await read("users"))) {
        if (String(user.id) !== String(assigneeId) || user.disabled === true || user.active === false || user.archived || user.role === "Client") continue;
        const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
        if (email.length > 254 || email.indexOf("@") > 64 ||
            !/^[a-z0-9_%+-](?:[a-z0-9._%+-]*[a-z0-9_%+-])?@ethinos\.com$/i.test(email) || email.includes("..") ||
            clientEmails.has(email) || clientUids.has(String(user.uid ?? user.id))) continue;
        recipients.add(email);
      }
      const name = actor.displayName?.trim();
      return { client, task, recipients, actorName: name && !name.includes("@") ? name.slice(0, 100) : "Client" };
    };
    const initial = await context();
    if (!initial) return;
    for (const recipient of initial.recipients) {
      const ref = db().ref(`clientTaskUpdateEmailDeliveries/${clientId}/${taskId}/${event.id}/${hash(recipient)}`);
      // At-most-once: any existing state (including sending/unknown/skipped)
      // blocks another send. Never reclaim ambiguous transport attempts.
      const claimed = await ref.transaction(current => current ? undefined :
        { state: "sending", createdAt: Date.now() }, undefined, false);
      if (!claimed.committed) continue;
      try {
        // Recheck sharing, live membership/client and assignment after claiming.
        const live = await context();
        if (!live || !live.recipients.has(recipient) || !isEmailConfigured()) {
          await ref.update({ state: "skipped", finishedAt: Date.now() });
          continue;
        }
        let change: string;
        let detail = "";
        if (event.kind === "status") {
          change = `Status changed from ${statusLabel(event.before)} to ${statusLabel(event.after)}`;
        } else if ("title" in event) {
          change = { "subtask-added": "Subtask added", "subtask-completed": "Subtask completed", "subtask-reopened": "Subtask reopened" }[event.kind];
          detail = `<p>${escape(event.title)}</p>`;
        } else {
          change = { message: "New client message", note: "New client note", link: "New client link" }[event.kind];
          const url = event.kind === "link" ? safeLink(event.url) : null;
          detail = `<p style="white-space:pre-wrap">${escape(event.text)}</p>` +
            (url ? `<p><a href="${escape(url)}">${escape(url)}</a></p>` : "");
        }
        const bodyHtml = `<h2>Client task update</h2><p>Client: ${escape(live.client.name)}</p>` +
          `<p>Task: ${escape(live.task.name)}</p><p>Updated by: ${escape(live.actorName)}</p>` +
          `<p>${escape(change)}</p>${detail}<p>Time: ${escape(new Date(event.at).toISOString())} (UTC)</p>`;
        // No hardcoded production/development app URL or invented task deep link.
        await sendEmail({ to: recipient, subject: "Client update on a shared task", bodyHtml, sensitive: true });
        await ref.update({ state: "sent", finishedAt: Date.now() });
      } catch {
        // Transport errors can mean the provider accepted the message. Persist
        // unknown and NEVER retry, even when a client repeats its request.
        try { await ref.update({ state: "unknown", finishedAt: Date.now() }); } catch { /* sending still blocks replay */ }
        logger.warn("Client task update email delivery is unknown; automatic retry disabled");
      }
    }
  } catch {
    logger.warn("Client task update email could not be processed; task changes remain saved");
  }
}
