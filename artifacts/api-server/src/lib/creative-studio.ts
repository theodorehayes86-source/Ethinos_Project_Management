import { randomUUID } from "node:crypto";
import { safeKey } from "./client-portal";

export type RecordData = Record<string, any>;
export class StudioError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new StudioError(status, message); };
export const values = (raw: any): RecordData[] => Object.entries(raw ?? {}).filter(([, v]) => v && typeof v === "object").map(([id, v]) => ({ ...v as object, id: String((v as RecordData).id ?? id) }));
export const ids = (raw: any): string[] => Array.isArray(raw) ? raw.map(String) : [];
export function strict(body: any, keys: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) fail(400, "Invalid or unknown fields.");
}
export function text(value: any, max = 10000, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(400, "Invalid text.");
  return value.trim();
}
export function timezone(value: any): string {
  if (typeof value !== "string") fail(400, "Invalid timezone.");
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); } catch { fail(400, "Invalid IANA timezone."); }
  return value;
}
export function https(value: any): string {
  try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw Error(); }
  catch { fail(400, "Provide an HTTPS link without embedded credentials."); }
  return text(value, 2048, true);
}
export type ApprovalPhase = "reference" | "final";
export const DEFAULTS = {
  enabled: false, sendTime: "09:00", timezone: "Asia/Kolkata", cadenceDays: 1,
  reference: {
    enabled: true, escalationDays: 5,
    subject: "Action needed: approve references for {{post}}",
    body: "Hi {{recipientName}}, references for {{post}} going live on {{date}} are ready. Review the moodboard and thumbnail on SharePoint and approve in Creative Studio.",
  },
  final: {
    enabled: true, escalationDays: 2,
    subject: "Final approval needed: {{post}} goes live {{date}}",
    body: "Hi {{recipientName}}, the final {{type}} for {{post}} is ready. Approve by {{deadline}} so the team can schedule it on time.",
  },
};
/** Merge legacy records without losing phase defaults or inherited global settings. */
export function automationSettings(...layers: (RecordData | null | undefined)[]) {
  const out = { ...DEFAULTS, reference: { ...DEFAULTS.reference }, final: { ...DEFAULTS.final } };
  for (const layer of layers) if (layer) {
    Object.assign(out, layer, {
      reference: { ...out.reference, ...layer.reference },
      final: { ...out.final, ...layer.final },
    });
  }
  // Upgrade only a greeting token; company references elsewhere remain intact.
  for (const phase of ["reference", "final"] as const) out[phase].body = out[phase].body.replace(/^(\s*(?:hi|hello|dear)\s+){{client}}(?=\s*[,!:\n])/i, "$1{{recipientName}}");
  return out;
}
export function automation(body: any) {
  strict(body, ["enabled", "sendTime", "timezone", "cadenceDays", "reference", "final"]);
  if (typeof body.enabled !== "boolean" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.sendTime) || !Number.isInteger(body.cadenceDays) || body.cadenceDays < 1 || body.cadenceDays > 30) fail(400, "Invalid automation settings.");
  const phases: RecordData = {};
  for (const phase of ["reference", "final"] as const) if (body[phase] !== undefined) {
    const p = body[phase];
    strict(p, ["enabled", "escalationDays", "subject", "body"]);
    if (typeof p.enabled !== "boolean" || !Number.isInteger(p.escalationDays) || p.escalationDays < 0 || p.escalationDays > 365) fail(400, "Invalid phase automation settings.");
    const subject = text(p.subject, 240, true), templateBody = text(p.body, 10000, true);
    if (/[\r\n]/.test(subject)) fail(400, "Subject must be a single line.");
    if ([subject, templateBody].some(t => (t.match(/{{.*?}}/g) ?? []).some(token => !["{{client}}", "{{firstName}}", "{{lastName}}", "{{recipientName}}", "{{post}}", "{{date}}", "{{type}}", "{{deadline}}"].includes(token)))) fail(400, "Unsupported template placeholder.");
    phases[phase] = { enabled: p.enabled, escalationDays: p.escalationDays, subject, body: templateBody };
  }
  return { enabled: body.enabled, sendTime: body.sendTime, timezone: timezone(body.timezone), cadenceDays: body.cadenceDays, ...phases };
}
export const fields = ["title", "type", "ownerId", "brief", "caption", "platforms", "productionDueDate", "productionDueTime", "plannedAt", "timezone"];
export function editable(body: any, creating = false): RecordData {
  strict(body, [...fields, ...(creating ? [] : ["revision"])]);
  const out: RecordData = creating ? { caption: "", platforms: [], productionDueDate: null, productionDueTime: null, plannedAt: null, timezone: "Asia/Kolkata" } : {};
  if (body.productionDueTime && !body.productionDueDate) fail(400, "Provide a production date with its deadline time.");
  if (creating && ["title", "type", "ownerId", "brief"].some(k => body[k] === undefined)) fail(400, "Title, type, owner and brief are required.");
  for (const k of fields) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (["title", "brief", "caption"].includes(k)) out[k] = text(v, k === "title" ? 240 : 10000, k === "title");
    else if (k === "type") { if (!["Post", "Reel", "Story"].includes(v)) fail(400, "Invalid content type."); out[k] = v; }
    else if (k === "ownerId") { if (!safeKey(v)) fail(400, "Invalid owner."); out[k] = v; }
    else if (k === "timezone") out[k] = timezone(v);
    else if (k === "platforms") {
      if (!Array.isArray(v) || v.length > 4 || v.some(p => !["Instagram", "Facebook", "LinkedIn", "YouTube Shorts"].includes(p))) fail(400, "Invalid platforms.");
      out[k] = [...new Set(v)];
    } else if (k === "productionDueTime") {
      if (v !== null && (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))) fail(400, "Invalid production deadline time.");
      out[k] = v;
    } else if (k === "plannedAt") {
      if (v !== null && (typeof v !== "string" || !/T.*Z$/.test(v) || !Number.isFinite(Date.parse(v)))) fail(400, "Use an ISO UTC posting instant.");
      out[k] = v;
    } else {
      if (v !== null && (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) fail(400, "Invalid production deadline.");
      out[k] = v;
    }
  }
  if (body.productionDueDate === null) out.productionDueTime = null;
  return out;
}
export const hasStudioDepartmentAccess = (user: RecordData) =>
  ["social", "design"].includes(String(user.department ?? "").trim().toLowerCase());
export function permissions(user: RecordData, client: RecordData, config: RecordData) {
  const admin = ["Admin", "Super Admin"].includes(user.role);
  const owner = ["Business Head", "BH", "CSM"].includes(user.role) && ids(client.ownerIds).includes(String(user.id));
  const manager = admin || owner;
  const editor = manager || (ids(user.assignedProjects).includes(client.name) &&
    (hasStudioDepartmentAccess(user) || [...ids(config.editorIds), ...ids(config.ownerIds)].includes(String(user.id))));
  return { manager, editor, admin };
}
export function project(item: RecordData, external: boolean): RecordData {
  const common = ["id", "clientId", "title", "type", "caption", "platforms", "plannedAt", "timezone", "revision", "stage", "shared", "archived", "scheduled", "createdAt", "updatedAt"];
  const result = Object.fromEntries([...common, ...(!external ? ["ownerId", "brief", "productionDueDate", "productionDueTime"] : [])].map(k => [k, item[k] ?? null]));
  result.platforms = item.platforms ?? [];
  // A client sees submitted snapshots, never unpublished asset replacements.
  result.assets = external
    ? Object.entries(item.approvals ?? {}).flatMap(([phase, approval]) => values((approval as RecordData).snapshot?.assets).map(a => ({ ...a, phase })))
    : values(item.assets).map(a => ({ ...a, history: values(a.history) }));
  result.approvals = Object.fromEntries(Object.entries(item.approvals ?? {}).map(([phase, a]) => {
    const approval = a as RecordData;
    return [phase, external ? Object.fromEntries(["revision", "approverUid", "status", "feedback", "decidedAt", "requestedAt", "snapshot"].filter(k => approval[k] !== undefined).map(k => [k, approval[k]])) : approval];
  }));
  return result;
}
export function invalidate(item: RecordData, phase = "reference") {
  item.scheduled = null;
  if (phase === "reference") { item.approvals = {}; item.stage = "internal_draft"; }
  else { delete item.approvals?.final; item.stage = item.approvals?.reference?.status === "approved" ? "in_production" : "internal_draft"; }
}
export function audit(item: RecordData, actor: string, action: string, now: number, details?: RecordData) {
  item.activity ??= {};
  item.activity[randomUUID()] = { actor, action, at: now, revision: item.revision, ...(details ? { details: structuredClone(details) } : {}) };
}

/** Calendar-day urgency in the posting zone, without assuming every day is 24h. */
export function studioUrgency(item: RecordData, now = Date.now(), escalationDays = 3): "none" | "near" | "overdue" {
  if (!item.plannedAt || item.archived || item.scheduled || item.stage === "final_approved") return "none";
  const instant = Date.parse(item.plannedAt);
  if (!Number.isFinite(instant)) return "none";
  if (instant < now) return "overdue";
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: item.timezone ?? "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
  const ordinal = (timestamp: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(p => [p.type, p.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000;
  };
  return ordinal(instant) - ordinal(now) <= escalationDays ? "near" : "none";
}
