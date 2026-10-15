import { format, isValid, parse } from "date-fns";

export type PortalMembership = { email: string; disabled: boolean; clientIds: string[] };
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
  return { email: record.email, disabled: record.disabled !== false, clientIds: clientIds.filter(safeKey) };
}

export function membershipAllows(membership: PortalMembership | null, email: string, clientId?: string): boolean {
  return !!membership && membership.disabled === false &&
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
export function projectClientTask(id: string, task: Record<string, unknown>) {
  if (task.visibility !== "client" || task.taskType === "checklist" || task.taskGroupId || task.archived) return null;
  const status = ["Pending", "In Progress", "WIP", "Completed", "Done", "On Hold"].includes(String(task.status))
    ? String(task.status) : "Pending";
  return {
    id,
    title: typeof task.name === "string" ? task.name : "",
    description: typeof task.clientDescription === "string" ? task.clientDescription : "",
    status,
    dueDate: normalizeDueDate(task.dueDate),
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
