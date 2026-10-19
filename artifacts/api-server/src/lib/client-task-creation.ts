import { createHash } from "node:crypto";
import { normalizeDueDate } from "./client-portal";

type TaskOptions = {
  dueDate?: string; reminderDate?: string; reminderTime?: string; reminderTimezone?: string;
  subtasks?: string[]; links?: { text: string; url: string }[];
};

/** Validate calendar dates and user-entered URLs beyond the API's shape checks. */
export function validateClientTaskOptions(body: TaskOptions): string | null {
  if (body.dueDate && normalizeDueDate(body.dueDate) !== body.dueDate)
    return "Provide a valid due date.";
  if (body.reminderDate) {
    if (!body.dueDate) return "Set a due date before adding a reminder.";
    if (normalizeDueDate(body.reminderDate) !== body.reminderDate || body.reminderDate > body.dueDate)
      return "The reminder must be a valid date on or before the due date.";
  } else if (body.reminderTime || body.reminderTimezone) {
    return "Set a reminder date before choosing its time or timezone.";
  }
  if (body.reminderTimezone) {
    try { new Intl.DateTimeFormat("en", { timeZone: body.reminderTimezone }).format(); }
    catch { return "Choose a valid reminder timezone."; }
  }
  if (body.subtasks?.some(title => !title.trim())) return "Each subtask needs a title.";
  for (const link of body.links ?? []) {
    if (!link.text.trim()) return "Each link needs a label.";
    try {
      const url = new URL(link.url);
      if (!/^https?:\/\//i.test(link.url) || !["http:", "https:"].includes(url.protocol) ||
          url.username || url.password || /[\s\u0000-\u001f\u007f]/.test(link.url)) throw new Error();
    } catch { return "Links must use HTTP or HTTPS without credentials or spaces."; }
  }
  return null;
}

export function clientTaskReminder(body: TaskOptions) {
  if (!body.reminderDate || !body.dueDate) return {};
  const offset = (Date.parse(`${body.reminderDate}T00:00:00Z`) - Date.parse(`${body.dueDate}T00:00:00Z`)) / 86_400_000;
  return { reminderOffsets: [String(offset)], reminderTime: body.reminderTime ?? "09:00",
    reminderTimezone: body.reminderTimezone ?? "Asia/Kolkata" };
}

/** The same client-safe collaboration records used by both staff and clients.
 * Persist together with the parent task in one Firebase multi-path update. */
export function initialTaskCollaboration(body: TaskOptions, uid: string, authorName: string, createdAt: number) {
  const id = (kind: string, index: number) => createHash("sha256").update(`${uid}:initial:${kind}:${index}`).digest("hex");
  const actor = { authorUid: uid, authorName, createdAt };
  const subtasks = Object.fromEntries((body.subtasks ?? []).map((title, i) =>
    [id("subtask", i), { ...actor, title: title.trim(), completed: false }]));
  const entries = Object.fromEntries((body.links ?? []).map((link, i) =>
    [id("link", i), { ...actor, type: "link", text: link.text.trim(), url: new URL(link.url).href }]));
  return { ...(Object.keys(subtasks).length ? { subtasks } : {}), ...(Object.keys(entries).length ? { entries } : {}) };
}
