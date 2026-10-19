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

/** ?clientDemo=1 (honoured only by PortalGate in DEV builds). */
export const wantsClientDemo = (search) => {
  try { return new URLSearchParams(search || '').get('clientDemo') === '1'; } catch { return false; }
};

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

/** Portal task stats from the API task shape. On Hold is its own bucket. */
export const portalStats = (tasks, now = new Date()) => {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const out = { pending: 0, wip: 0, done: 0, hold: 0, overdue: 0, dueToday: 0 };
  (tasks || []).forEach(t => {
    const b = portalStatusBucket(t.status);
    out[b] += 1;
    const d = parseLooseDate(t.dueDate);
    if (d && b !== 'done') {
      if (d.getTime() === today.getTime()) out.dueToday += 1;
      else if (d < today) out.overdue += 1;
    }
  });
  return out;
};

/** Status bucket used by KPIs, filters and badges. */
export const portalStatusBucket = (status) => {
  const v = String(status || 'Pending').toLowerCase();
  if (v === 'done' || v === 'completed') return 'done';
  if (v === 'wip' || v === 'in progress') return 'wip';
  if (v === 'on hold' || v === 'hold') return 'hold';
  return 'pending';
};

/** Free-text over title/category/description + status bucket (shared by list and calendar). */
export const filterPortalTasks = (tasks, { query = '', status = 'all' } = {}, now = new Date()) => {
  const q = query.trim().toLowerCase();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return (tasks || []).filter(t => {
    if (q && !`${t.title || ''} ${t.category || ''} ${t.description || ''}`.toLowerCase().includes(q)) return false;
    if (status === 'all') return true;
    const b = portalStatusBucket(t.status);
    if (status === 'overdue') { const d = parseLooseDate(t.dueDate); return b !== 'done' && !!d && d < today; }
    return b === status;
  });
};

/** The only statuses a client may set (PATCH contract). On Hold is legacy display-only. */
export const PORTAL_TASK_STATUSES = ['Pending', 'In Progress', 'Completed'];
const STATUS_FOR_BUCKET = { pending: 'Pending', wip: 'In Progress', done: 'Completed', hold: 'On Hold' };
/** Maps canonical/legacy values (WIP, Done, On Hold) onto the dropdown option. */
export const portalStatusValue = (status) => STATUS_FOR_BUCKET[portalStatusBucket(status)];
export const isPortalTaskStatus = (s) => PORTAL_TASK_STATUSES.includes(s);

/** Server may mark a task read-only; absent flag means editable. */
export const statusEditState = (task) => (task?.statusEditable === false
  ? { editable: false, reason: String(task.statusEditReason || 'Your agency is managing this status.') }
  : { editable: true, reason: '' });

export const PORTAL_CATEGORY_MAX = 100;
export const validatePortalTask = ({ title, category } = {}) => {
  const e = {};
  if (!String(title || '').trim()) e.title = 'Title is required.';
  if (String(category || '').trim().length > PORTAL_CATEGORY_MAX) e.category = `Category must be ${PORTAL_CATEGORY_MAX} characters or fewer.`;
  return e;
};

/** Replace one task in a list by id with the server copy (no duplicates). */
export const mergeTask = (tasks, task) => {
  if (!task || task.id === undefined || task.id === null) return tasks;
  const list = Array.isArray(tasks) ? tasks : [];
  let found = false;
  const out = list.map(t => (String(t.id) === String(task.id) ? ((found = true), { ...t, ...task }) : t));
  return found ? out : [...out, task];
};

// ---- Calendar helpers: local calendar days only, never via toISOString (UTC shift).
const pad = (n) => String(n).padStart(2, '0');
export const localDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 6x7 Monday-first grid of local days for a month. */
export const monthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - offset + i);
    return { date: d, key: localDateKey(d), inMonth: d.getMonth() === month };
  });
};

export const shiftMonth = ({ year, month }, delta) => {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/** Groups tasks by local due-date key; unparseable/missing dates go to undated. */
export const groupTasksByDue = (tasks) => {
  const byDate = {};
  const undated = [];
  (tasks || []).forEach(t => {
    const d = parseLooseDate(t.dueDate);
    if (!d) { undated.push(t); return; }
    const k = localDateKey(d);
    (byDate[k] = byDate[k] || []).push(t);
  });
  return { byDate, undated };
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
    createTask: (clientId, { title, description, dueDate, category }) =>
      call(`/client-portal/clients/${enc(clientId)}/tasks`, {
        method: 'POST',
        body: { title, description, ...(dueDate ? { dueDate } : {}), ...(category ? { category } : {}) },
      }),
    updateTaskStatus: (clientId, taskId, status) =>
      call(`/client-portal/clients/${enc(clientId)}/tasks/${enc(taskId)}`, { method: 'PATCH', body: { status } }),
    adminListUsers: () => call('/client-portal/admin/users'),
    adminCreateUser: (email, clientIds) => call('/client-portal/admin/users', { method: 'POST', body: { email, clientIds } }),
    adminUpdateUser: (uid, patch) => call(`/client-portal/admin/users/${enc(uid)}`, { method: 'PATCH', body: patch }),
    adminInvite: (uid) => call(`/client-portal/admin/users/${enc(uid)}/invite`, { method: 'POST', body: {} }),
    adminRevokeInvite: (uid) => call(`/client-portal/admin/users/${enc(uid)}/invite/revoke`, { method: 'POST', body: {} }),
    adminDeleteUser: (uid) => call(`/client-portal/admin/users/${enc(uid)}`, { method: 'DELETE' }),
  };
}

/** Errors that mean access was revoked/invalid: private data must be cleared. */
export const isRevocationError = (err) => !!err && [401, 403, 404].includes(err.status);

// ---------------------------------------------------------------------------
// Single-link onboarding. Invite URL: <root>?client=1#invite=TOKEN.
// The token lives only in module memory: never in storage, URL history or logs.

const TOKEN_RE = /^[A-Za-z0-9._~-]{16,512}$/;
export const parseInviteFragment = (hash) => {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  let v = null;
  try { v = new URLSearchParams(raw).get('invite'); } catch { return null; }
  return v && TOKEN_RE.test(v) ? v : null;
};

let inviteTokenMemo = null;
/** Reads #invite=..., strips it from the address bar (keeping ?client=1) and caches it in memory. Idempotent. */
export function captureInviteToken(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.location) return inviteTokenMemo;
  const token = parseInviteFragment(win.location.hash);
  if (token) {
    inviteTokenMemo = token;
    try {
      const url = new URL(win.location.href);
      url.hash = '';
      url.searchParams.set('client', '1');
      win.history.replaceState(null, '', url.pathname + url.search);
    } catch { /* address bar cleanup is best effort */ }
  }
  return inviteTokenMemo;
}
export const clearInviteToken = () => { inviteTokenMemo = null; };

export const MIN_PASSWORD = 12;
export function validateNewAccount({ displayName, password, confirm }) {
  const errors = {};
  if (!String(displayName || '').trim()) errors.displayName = 'Enter your name.';
  else if (String(displayName).trim().length > 100) errors.displayName = 'Keep your name under 100 characters.';
  if (String(password || '').length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  else if (String(password).length > 128) errors.password = 'Use at most 128 characters.';
  if (password !== confirm) errors.confirm = 'Passwords do not match.';
  return errors;
}

/** Friendly copy for invite errors. Server message wins when it is specific. */
export function inviteErrorMessage(err) {
  const st = err?.status;
  if (st === 410) return err?.message && !/^Request failed/.test(err.message) ? err.message : 'This invitation has expired. Ask your agency to send a new link.';
  if (st === 404) return 'This invitation link is not valid. It may have been revoked or replaced by a newer link.';
  if (st === 409) return err?.message && !/^Request failed/.test(err.message) ? err.message : 'This invitation has already been used or revoked.';
  if (st === 403) return err?.message || 'This invitation belongs to a different email address.';
  if (st === 0) return 'Connection lost. Check your network and retry.';
  return err?.message || 'Something went wrong. Try again.';
}

/** Public invitation API. inspect is unauthenticated; accept optionally carries a Bearer token. */
export function createInviteApi({ base, fetchImpl }) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const post = async (path, body, bearer) => {
    let resp;
    try {
      resp = await doFetch(`${base}/client-portal/invitations/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch { throw new PortalApiError('Connection lost', 0); }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new PortalApiError(data?.error || `Request failed (${resp.status})`, resp.status);
    return data;
  };
  return {
    inspect: (token) => post('inspect', { token }),
    accept: (token, { displayName, password } = {}, bearer) => post('accept', {
      token, ...(displayName ? { displayName } : {}), ...(password ? { password } : {}),
    }, bearer),
  };
}

export const INVITE_STATUSES = ['pending', 'expired', 'revoked', 'accepted'];
/** Admin list status. Pending invites past expiry read as expired even before the server sweeps. */
export function inviteStatus(u, now = Date.now()) {
  const raw = u?.invitationStatus || u?.inviteStatus || null;
  const exp = Number(u?.invitationExpiresAt || u?.expiresAt || 0);
  if (raw === 'pending' && exp && exp < now) return 'expired';
  return INVITE_STATUSES.includes(raw) ? raw : null;
}

/** Studio clients a portal member can open: enabled ones from the authorized bootstrap. */
export const portalStudioClients = (bootstrap) =>
  (bootstrap?.clients || []).filter(c => c && bootstrap?.configs?.[c.id]?.enabled === true);

// ---- Staff bulk "Share with client" (Clients view). Only the selected rows
// change; repeat series / future occurrences are untouched.
export const SHARE_SKIP_REASONS = {
  missing: 'No longer exists',
  checklist: 'Checklist item',
  grouped: 'Part of a checklist group',
  archived: 'Archived',
  synthetic: 'Personal / internal workspace',
  permission: 'You cannot edit this task',
};

/** Why a task cannot be shared, or null when eligible. */
export const shareIneligibleReason = (task, { clientId, canEdit } = {}) => {
  if (!task) return 'missing';
  if (!isRealClientId(clientId)) return 'synthetic';
  if (task.taskType === 'checklist') return 'checklist';
  if (task.taskGroupId) return 'grouped';
  if (task.archived) return 'archived';
  if (typeof canEdit === 'function' && !canEdit(task)) return 'permission';
  return null;
};

/** Splits the current selection into eligible rows and skipped rows with reasons. */
export const planClientShare = (logs, selectedIds, opts = {}) => {
  const list = Array.isArray(logs) ? logs : Object.values(logs || {});
  const byId = new Map(list.filter(Boolean).map(t => [String(t.id), t]));
  const eligible = [];
  const skipped = [];
  [...(selectedIds || [])].map(String).forEach(id => {
    const task = byId.get(id);
    const reason = shareIneligibleReason(task, opts);
    if (reason) skipped.push({ id, title: task ? (task.name || task.title || 'Untitled task') : 'Removed task', reason, label: SHARE_SKIP_REASONS[reason] });
    else eligible.push({ id, task, alreadyShared: normalizeVisibility(task.visibility) === 'client', clientDescription: task.clientDescription || '' });
  });
  return { eligible, skipped };
};

/**
 * Applies drafts ({ [id]: clientDescription }) to the latest list, re-checking
 * existence and eligibility. Never reads internal comments. Already shared rows
 * keep their description when the draft is blank.
 */
export const applyClientShare = (logs, drafts, opts = {}) => {
  const list = Array.isArray(logs) ? logs : Object.values(logs || {});
  const ids = Object.keys(drafts || {});
  const shared = [];
  const skipped = [];
  const byId = new Map(list.filter(Boolean).map(t => [String(t.id), t]));
  ids.forEach(id => {
    const reason = shareIneligibleReason(byId.get(id), opts);
    if (reason) skipped.push({ id, reason, label: SHARE_SKIP_REASONS[reason] });
  });
  const skip = new Set(skipped.map(s => s.id));
  const updated = list.map(t => {
    const id = String(t?.id);
    if (!t || !(id in drafts) || skip.has(id)) return t;
    const draft = typeof drafts[id] === 'string' ? drafts[id].trim() : '';
    const keep = normalizeVisibility(t.visibility) === 'client' && !draft ? (t.clientDescription || '') : draft;
    shared.push(id);
    return { ...t, ...sharingFields('client', keep) };
  });
  return { updated, shared, skipped };
};
