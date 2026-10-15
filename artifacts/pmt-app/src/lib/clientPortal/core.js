// Client portal shared logic. Pure helpers + an API client factory.
// This file is duplicated verbatim in artifacts/pmt-mobile/src/lib/clientPortal/core.js.
// Keep both copies in sync.

export const STAFF_DOMAIN = '@ethinos.com';
export const canManageClientPortal = (role) => ['Admin', 'Super Admin'].includes(role);
export const SYNTHETIC_CLIENT_IDS = ['__personal__', '__ethinos__'];

export const isStaffEmail = (email) =>
  typeof email === 'string' && email.trim().toLowerCase().endsWith(STAFF_DOMAIN);

/** True when an authenticated account must be routed into the isolated portal. */
export const isClientAccount = (user) => !!user && !isStaffEmail(user.email || '');

/** True when the URL explicitly requests the client sign-in entry (?client=1). */
export const wantsClientEntry = (search) => {
  try {
    const v = new URLSearchParams(search || '').get('client');
    return v === '1' || v === 'true';
  } catch { return false; }
};

export const isRealClientId = (id) =>
  id !== undefined && id !== null && id !== '' && !SYNTHETIC_CLIENT_IDS.includes(String(id));

export const normalizeVisibility = (v) => (v === 'client' ? 'client' : 'internal');

/**
 * Fields to persist on a task for the selected sharing state. clientDescription
 * is never derived from the internal comment; it is cleared when internal.
 */
export const sharingFields = (visibility, clientDescription) => {
  const v = normalizeVisibility(visibility);
  const desc = typeof clientDescription === 'string' ? clientDescription.trim() : '';
  return { visibility: v, clientDescription: v === 'client' && desc ? desc : null };
};

/** Copies, imports and template-created tasks always start internal. */
export const resetSharing = (task) => ({ ...task, visibility: 'internal', clientDescription: null });

/** Whether an edit transitions an existing task from internal to shared. */
export const isNewlyShared = (before, nextVisibility) =>
  normalizeVisibility(before?.visibility) !== 'client' && normalizeVisibility(nextVisibility) === 'client';

/** The exact fields disclosed to the client. Nothing else may be shown. */
export const clientSafeTask = (task, overrides = {}) => {
  const t = { ...task, ...overrides };
  return {
    id: t.id ?? null,
    title: t.name || t.title || 'Untitled task',
    status: t.status || 'Pending',
    dueDate: t.dueDate || null,
    description: (t.clientDescription ?? '') || '',
  };
};

export const sharingConfirmMessage = (task, overrides = {}) => {
  const s = clientSafeTask(task, overrides);
  return [
    'Share this task with the client?',
    '',
    'The client will see ONLY:',
    `  Title: ${s.title}`,
    `  Status: ${s.status}`,
    `  Due date: ${s.dueDate || 'None'}`,
    `  Client description: ${s.description || '(empty)'}`,
    '',
    'Internal comments, assignees, time, QC and checklists stay internal.',
  ].join('\n');
};

/** Client-safe preview list for a staff client-detail "Client preview" mode. */
export const clientPreviewTasks = (logs) =>
  (Array.isArray(logs) ? logs : Object.values(logs || {}))
    .filter(t => t && !t.taskGroupId && t.taskType !== 'checklist' && !t.archived && normalizeVisibility(t.visibility) === 'client')
    .map(t => clientSafeTask(t));

/** Portal task stats from the API task shape. */
export const portalStats = (tasks, now = new Date()) => {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const out = { pending: 0, wip: 0, done: 0, overdue: 0, dueToday: 0 };
  (tasks || []).forEach(t => {
    const st = String(t.status || 'Pending').toLowerCase();
    if (st === 'done' || st === 'completed') out.done += 1;
    else if (st === 'wip' || st === 'in progress') out.wip += 1;
    else out.pending += 1;
    const d = parseLooseDate(t.dueDate);
    if (d && st !== 'done' && st !== 'completed') {
      if (d.getTime() === today.getTime()) out.dueToday += 1;
      else if (d < today) out.overdue += 1;
    }
  });
  return out;
};

/** Portal list filter: free-text over title/description + status bucket. */
export const portalStatusBucket = (status) => {
  const v = String(status || 'Pending').toLowerCase();
  if (v === 'done' || v === 'completed') return 'done';
  if (v === 'wip' || v === 'in progress') return 'wip';
  return 'pending';
};
export const filterPortalTasks = (tasks, { query = '', status = 'all' } = {}, now = new Date()) => {
  const q = query.trim().toLowerCase();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return (tasks || []).filter(t => {
    if (q && !`${t.title || ''} ${t.description || ''}`.toLowerCase().includes(q)) return false;
    if (status === 'all') return true;
    const b = portalStatusBucket(t.status);
    if (status === 'overdue') { const d = parseLooseDate(t.dueDate); return b !== 'done' && !!d && d < today; }
    return b === status;
  });
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function parseLooseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return new Date(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  return null;
}

export class PortalApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * API client. getToken must return a Firebase ID token. All calls use Bearer.
 */
export function createPortalApi({ base, getToken, fetchImpl }) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const call = async (path, { method = 'GET', body } = {}) => {
    const token = await getToken();
    if (!token) throw new PortalApiError('Not signed in', 401);
    const resp = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new PortalApiError(data?.error || `Request failed (${resp.status})`, resp.status);
    return data;
  };
  const enc = encodeURIComponent;
  return {
    me: () => call('/client-portal/me'),
    listTasks: (clientId) => call(`/client-portal/clients/${enc(clientId)}/tasks`),
    createTask: (clientId, { title, description, dueDate }) =>
      call(`/client-portal/clients/${enc(clientId)}/tasks`, {
        method: 'POST',
        body: { title, description, ...(dueDate ? { dueDate } : {}) },
      }),
    adminListUsers: () => call('/client-portal/admin/users'),
    adminCreateUser: (email, clientIds) => call('/client-portal/admin/users', { method: 'POST', body: { email, clientIds } }),
    adminUpdateUser: (uid, patch) => call(`/client-portal/admin/users/${enc(uid)}`, { method: 'PATCH', body: patch }),
    adminInvite: (uid) => call(`/client-portal/admin/users/${enc(uid)}/invite`, { method: 'POST', body: {} }),
  };
}

/** Errors that mean access was revoked/invalid: private data must be cleared. */
export const isRevocationError = (err) => !!err && [401, 403, 404].includes(err.status);
