import { format, isValid, parse } from "date-fns";

export type PortalMembership = { email: string; firstName?: string; lastName?: string; disabled: boolean; clientIds: string[]; onboardingRequired?: boolean; invitationStatus?: "pending" | "expired" | "revoked" | "accepted"; invitationExpiresAt?: number };
export const contactFullName = (record: { firstName?: string; lastName?: string }) =>
  [record.firstName, record.lastName].filter(Boolean).join(" ").trim();
/** Optional for legacy callers; explicit name updates must supply both parts. */
export function validContactNames(record: { firstName?: unknown; lastName?: unknown }) {
  return record.firstName === undefined && record.lastName === undefined ||
    [record.firstName, record.lastName].every(v => typeof v === "string" && v.trim().length > 0 && v.trim().length <= 50 && !/[\u0000-\u001f\u007f]/.test(v));
}
export const isStaffEmail = (email: unknown): boolean =>
  typeof email === "string" && email.toLowerCase().endsWith("@ethinos.com");
export const safeKey = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** RTDB removes empty arrays, so a membership with no clients has no clientIds child. */
export function normalizeMembership(value: unknown): PortalMembership | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.email !== "string") return null;
  const ids = record.clientIds;
  const clientIds = Array.isArray(ids) ? ids : ids && typeof ids === "object" ? Object.values(ids) : [];
  const invitation = record.invitation as Record<string, unknown> | undefined;
  const invitationStatus = invitation
    ? invitation.status === "accepted" ? "accepted" : invitation.status === "revoked" ? "revoked"
      : Number(invitation.expiresAt) <= Date.now() ? "expired" : "pending"
    : record.onboardingRequired === true ? "revoked" : "accepted";
  return { email: record.email, disabled: record.disabled !== false || record.deletionInProgress === true, clientIds: clientIds.filter(safeKey),
    ...(typeof record.firstName === "string" ? { firstName: record.firstName.trim() } : {}),
    ...(typeof record.lastName === "string" ? { lastName: record.lastName.trim() } : {}),
    onboardingRequired: record.onboardingRequired === true, invitationStatus,
    ...(invitation ? { invitationExpiresAt: Number(invitation.expiresAt) } : {}) };
}

export function membershipAllows(membership: PortalMembership | null, email: string, clientId?: string): boolean {
  return !!membership && membership.disabled === false &&
    (!membership.onboardingRequired || membership.invitationStatus === "accepted") &&
    membership.email.toLowerCase() === email.toLowerCase() &&
    Array.isArray(membership.clientIds) &&
    (!clientId || membership.clientIds.includes(clientId));
}

export function normalizeDueDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  for (const pattern of ["yyyy-MM-dd", "do MMM yyyy", "d MMM yyyy"]) {
    const date = parse(value, pattern, new Date(2000, 0, 1));
    if (isValid(date)) return format(date, "yyyy-MM-dd");
  }
  return "";
}

/** Allow-list only. Never spread a stored task or fall back to its internal comment. */
export function clientTaskStatusEditReason(task: Record<string, unknown>): string {
  if (task.timerState === "running" || task.timerState === "paused") {
    return "Your account team must stop the task timer before its status can be changed.";
  }
  if (task.qcEnabled || task.qcStatus) {
    return "Your account team manages status changes for tasks with internal quality review.";
  }
  return "";
}

export function projectClientTask(id: string, task: Record<string, unknown>, clientId?: string) {
  if (clientId && task.clientId != null && task.clientId !== clientId) return null;
  if (task.visibility !== "client" || (task.taskType != null && task.taskType !== "task") || task.taskGroupId || task.archived) return null;
  const status = ["Pending", "In Progress", "WIP", "Completed", "Done", "On Hold"].includes(String(task.status))
    ? String(task.status) : "Pending";
  const statusEditReason = clientTaskStatusEditReason(task);
  const dueDate = normalizeDueDate(task.dueDate);
  let reminder: Record<string, string> = {};
  const offset = Array.isArray(task.reminderOffsets) ? Number(task.reminderOffsets[0]) : NaN;
  if (task.source === "client-portal" && dueDate && Number.isSafeInteger(offset)) {
    const reminderDate = new Date(Date.parse(`${dueDate}T00:00:00Z`) + offset * 86_400_000);
    if (Number.isFinite(reminderDate.getTime())) reminder = {
      reminderDate: reminderDate.toISOString().slice(0, 10),
      reminderTime: typeof task.reminderTime === "string" ? task.reminderTime : "09:00",
      reminderTimezone: typeof task.reminderTimezone === "string" ? task.reminderTimezone : "Asia/Kolkata",
    };
  }
  return {
    id,
    title: typeof task.name === "string" ? task.name : "",
    description: typeof task.clientDescription === "string" ? task.clientDescription : "",
    category: typeof task.category === "string" ? task.category : "",
    status,
    statusEditable: !statusEditReason,
    statusEditReason,
    dueDate,
    ...reminder,
  };
}

export function clientDirectory(raw: unknown): Array<{ id: string; name: string }> {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") return [];
    const client = value as Record<string, unknown>;
    const id = String(client.id ?? key);
    if (!safeKey(id) || id.startsWith("__") || client.deleted || client.archived) return [];
    return [{ id, name: typeof client.name === "string" ? client.name : "Client" }];
  });
}
