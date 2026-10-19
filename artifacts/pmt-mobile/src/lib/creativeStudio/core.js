// Creative Studio client: API wrapper + timezone/urgency helpers.
// Contract: docs/creative-studio-api.md. Duplicated in pmt-mobile; keep in sync.

export class StudioApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function createStudioApi({ base, getToken }) {
  const root = `${base}/creative-studio`;
  const enc = encodeURIComponent;
  const call = async (path, { method = 'GET', body } = {}) => {
    const token = await getToken();
    if (!token) throw new StudioApiError('Your session has ended. Sign in again.', 401);
    let resp;
    try {
      resp = await fetch(`${root}${path}`, {
        method,
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new StudioApiError('Connection lost. Check your network and retry.', 0);
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new StudioApiError(data?.error || `Request failed (${resp.status})`, resp.status);
    return data;
  };
  const item = (c, id) => `/clients/${enc(c)}/deliverables/${enc(id)}`;
  return {
    bootstrap: () => call('/bootstrap'),
    saveConfig: async (clientId, body) => {
      const result = await call(`/clients/${enc(clientId)}/config`, { method: 'PUT', body });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('flow-pro:studio-config-changed'));
      return result;
    },
    saveDefaults: (body) => call('/defaults', { method: 'PUT', body }),
    deliveries: (clientId) => call(`/clients/${enc(clientId)}/deliveries`),
    preview: (clientId, opts = {}) => call(`/clients/${enc(clientId)}/preview`, { method: 'POST', body: opts.phase ? { phase: opts.phase } : {} }),
    list: (clientId) => call(`/clients/${enc(clientId)}/deliverables`),
    get: (clientId, id) => call(item(clientId, id)),
    create: (clientId, body) => call(`/clients/${enc(clientId)}/deliverables`, { method: 'POST', body }),
    update: (clientId, id, body) => call(item(clientId, id), { method: 'PATCH', body }),
    action: (clientId, id, body) => call(`${item(clientId, id)}/actions`, { method: 'POST', body }),
    asset: (clientId, id, body) => call(`${item(clientId, id)}/assets`, { method: 'POST', body }),
    messages: (clientId, id, thread) => call(`${item(clientId, id)}/messages/${thread}`),
    send: (clientId, id, thread, body) => call(`${item(clientId, id)}/messages/${thread}`, { method: 'POST', body }),
    activity: (clientId, id) => call(`${item(clientId, id)}/activity`),
  };
}

export const TYPES = ['Post', 'Reel', 'Story'];
export const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'YouTube Shorts'];
export const ASSET_KINDS = [
  { id: 'thumbnail', label: 'Thumbnail' }, { id: 'main', label: 'Main post' }, { id: 'video', label: 'Video' },
  { id: 'copy', label: 'Copy' }, { id: 'file', label: 'File' },
];
export const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC',
];
export const STAGES = {
  internal_draft: { label: 'Internal draft', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  awaiting_reference: { label: 'Awaiting reference approval', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  reference_changes: { label: 'Reference changes requested', tone: 'bg-red-50 text-red-700 border-red-200' },
  in_production: { label: 'In production', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  awaiting_final: { label: 'Awaiting final approval', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  final_changes: { label: 'Final changes requested', tone: 'bg-red-50 text-red-700 border-red-200' },
  final_approved: { label: 'Final approved', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};
export const stageLabel = (s) => STAGES[s]?.label || s || 'Unknown';

export const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const isHttps = (u) => { try { return new URL(String(u)).protocol === 'https:'; } catch { return false; } };

// ---- Timezones (DST-safe via Intl) ----
function parts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
}
const offset = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000; };
export function localToUtc(date, time, tz) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = (time || '09:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offset(guess, tz);
  t = guess - offset(t, tz);
  return new Date(t).toISOString();
}
export function utcToLocal(iso, tz) {
  if (!iso) return { date: '', time: '' };
  const p = parts(Date.parse(iso), tz);
  const z = (n) => String(n).padStart(2, '0');
  return { date: `${p.y}-${z(p.m)}-${z(p.d)}`, time: `${z(p.h)}:${z(p.mi)}` };
}
export const dayKey = (iso, tz) => utcToLocal(iso, tz).date;
export const monthKey = (iso, tz) => dayKey(iso, tz).slice(0, 7);
const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

export function urgency(item, now = Date.now()) {
  if (!item || item.archived || item.scheduled) return null;
  if (!item.plannedAt) return 'unplanned';
  const t = Date.parse(item.plannedAt);
  if (t < now) return 'overdue';
  const tz = item.timezone || 'Asia/Kolkata';
  const diff = dayNum(dayKey(item.plannedAt, tz)) - dayNum(utcToLocal(new Date(now).toISOString(), tz).date);
  return diff <= 3 ? 'soon' : null;
}
export function relativeDay(iso, tz, now = Date.now()) {
  if (!iso) return 'No posting date';
  const diff = dayNum(dayKey(iso, tz)) - dayNum(utcToLocal(new Date(now).toISOString(), tz).date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}
export function fmtInstant(iso, tz, opts = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz || 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...opts }).format(new Date(iso));
}
export const fmtStamp = (ms) => (ms ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : '');
export const tzShort = (tz) => (tz === 'Asia/Kolkata' ? 'IST' : (tz || '').split('/').pop().replace('_', ' '));

export function summarize(items) {
  const s = { approved: 0, wip: 0, soon: 0, scheduled: 0, approvedNotScheduled: 0, overdue: 0 };
  for (const i of items) {
    if (i.archived) continue;
    const approved = i.stage === 'final_approved';
    if (approved) s.approved += 1; else s.wip += 1;
    if (i.scheduled) s.scheduled += 1;
    if (approved && !i.scheduled) s.approvedNotScheduled += 1;
    const u = urgency(i);
    if (u === 'soon') s.soon += 1;
    if (u === 'overdue') s.overdue += 1;
  }
  return s;
}

// What an external member could see for a record (mirrors server filter).
export const clientVisible = (i) => i.shared && !i.archived && i.stage !== 'internal_draft';

// ---- Deep links ----
// Email links: /?client=1&studioClient=<id>&studioItem=<id>. Captured before any
// sign-in redirect (Microsoft OAuth drops query params) and consumed after login.
// The link only selects a record; the API still authorizes every read.
const LINK_KEY = 'flowpro_studio_link';
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export function parseStudioLink(search) {
  const p = new URLSearchParams(search || '');
  const item = p.get('studioItem') || p.get('deliverable');
  const client = p.get('studioClient');
  if (!item || !SAFE_ID.test(item) || (client && !SAFE_ID.test(client))) return null;
  return { item, client: client || null };
}
export function captureStudioLink(search = typeof window !== 'undefined' ? window.location.search : '') {
  const link = parseStudioLink(search);
  try { if (link) sessionStorage.setItem(LINK_KEY, JSON.stringify(link)); } catch { /* storage unavailable */ }
  return link;
}
export function peekStudioLink() {
  if (typeof window === 'undefined') return null;
  const fromUrl = parseStudioLink(window.location.search);
  if (fromUrl) return fromUrl;
  try { const v = JSON.parse(sessionStorage.getItem(LINK_KEY) || 'null'); return v && SAFE_ID.test(v.item) ? v : null; } catch { return null; }
}
export function writeStudioLink(link) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(LINK_KEY); } catch { /* ignore */ }
  const url = new URL(window.location.href);
  url.searchParams.delete('deliverable');
  if (link?.item) { url.searchParams.set('studioItem', link.item); if (link.client) url.searchParams.set('studioClient', link.client); }
  else { url.searchParams.delete('studioItem'); url.searchParams.delete('studioClient'); }
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
