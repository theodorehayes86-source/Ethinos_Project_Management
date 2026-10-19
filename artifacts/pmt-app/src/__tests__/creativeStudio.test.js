import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createStudioApi, localToUtc, utcToLocal, dayKey, monthKey, urgency, summarize, clientVisible,
  parseStudioLink, isHttps, relativeDay,
} from '../lib/creativeStudio/core.js';
import { staffCandidatesFor, peopleIndex } from '../lib/creativeStudio/StudioControlPanel.jsx';

const H = 3600000;

describe('timezone conversion', () => {
  it('converts IST local time to UTC and back', () => {
    expect(localToUtc('2026-10-15', '09:00', 'Asia/Kolkata')).toBe('2026-10-15T03:30:00.000Z');
    expect(utcToLocal('2026-10-15T03:30:00.000Z', 'Asia/Kolkata')).toEqual({ date: '2026-10-15', time: '09:00' });
  });
  it('crosses midnight correctly', () => {
    expect(localToUtc('2026-10-16', '02:00', 'Asia/Kolkata')).toBe('2026-10-15T20:30:00.000Z');
    expect(dayKey('2026-10-15T20:30:00.000Z', 'Asia/Kolkata')).toBe('2026-10-16');
    expect(dayKey('2026-10-15T20:30:00.000Z', 'UTC')).toBe('2026-10-15');
    expect(monthKey('2026-10-31T19:00:00.000Z', 'Asia/Kolkata')).toBe('2026-11');
  });
  it('is daylight-saving safe', () => {
    expect(localToUtc('2026-03-07', '09:00', 'America/New_York')).toBe('2026-03-07T14:00:00.000Z');
    expect(localToUtc('2026-03-09', '09:00', 'America/New_York')).toBe('2026-03-09T13:00:00.000Z');
    expect(localToUtc('2026-10-26', '09:00', 'Europe/London')).toBe('2026-10-26T09:00:00.000Z');
    expect(utcToLocal(localToUtc('2026-11-01', '01:30', 'America/New_York'), 'America/New_York').time).toBe('01:30');
  });
  it('returns null without a date', () => { expect(localToUtc('', '09:00', 'UTC')).toBeNull(); });
});

describe('urgency and counts', () => {
  const now = Date.parse('2026-10-10T06:30:00.000Z'); // 12:00 IST
  const base = { timezone: 'Asia/Kolkata', archived: false, scheduled: null, stage: 'in_production' };
  it('classifies overdue, soon, unplanned and far', () => {
    expect(urgency({ ...base, plannedAt: new Date(now - H).toISOString() }, now)).toBe('overdue');
    expect(urgency({ ...base, plannedAt: '2026-10-13T12:00:00.000Z' }, now)).toBe('soon');
    expect(urgency({ ...base, plannedAt: '2026-10-20T12:00:00.000Z' }, now)).toBeNull();
    expect(urgency({ ...base, plannedAt: null }, now)).toBe('unplanned');
    expect(urgency({ ...base, plannedAt: new Date(now - H).toISOString(), scheduled: { at: 1 } }, now)).toBeNull();
    expect(urgency({ ...base, plannedAt: new Date(now - H).toISOString(), archived: true }, now)).toBeNull();
  });
  it('uses the posting timezone for day boundaries', () => {
    expect(relativeDay('2026-10-10T19:00:00.000Z', 'Asia/Kolkata', now)).toBe('Tomorrow');
    expect(relativeDay('2026-10-10T19:00:00.000Z', 'UTC', now)).toBe('Today');
  });
  it('approved and scheduled overlap; archived excluded; zero results', () => {
    const items = [
      { ...base, id: 'a', stage: 'final_approved', scheduled: { at: 1 }, plannedAt: '2026-12-01T00:00:00Z' },
      { ...base, id: 'b', stage: 'final_approved', plannedAt: '2026-12-01T00:00:00Z' },
      { ...base, id: 'c', stage: 'awaiting_final', plannedAt: '2026-12-01T00:00:00Z' },
      { ...base, id: 'd', stage: 'final_approved', archived: true },
    ];
    const s = summarize(items);
    expect(s).toMatchObject({ approved: 2, scheduled: 1, approvedNotScheduled: 1, wip: 1 });
    expect(summarize([])).toEqual({ approved: 0, wip: 0, soon: 0, scheduled: 0, approvedNotScheduled: 0, overdue: 0 });
  });
  it('client visibility mirrors the server filter', () => {
    expect(clientVisible({ shared: true, archived: false, stage: 'awaiting_reference' })).toBe(true);
    expect(clientVisible({ shared: true, archived: false, stage: 'internal_draft' })).toBe(true);
    expect(clientVisible({ shared: false, archived: false, stage: 'in_production' })).toBe(false);
    expect(clientVisible({ shared: true, archived: true, stage: 'final_approved' })).toBe(false);
  });
});

describe('deep links and validation', () => {
  it('parses email link parameters', () => {
    expect(parseStudioLink('?client=1&studioClient=c1&studioItem=item_9')).toEqual({ item: 'item_9', client: 'c1' });
    expect(parseStudioLink('?deliverable=abc')).toEqual({ item: 'abc', client: null });
    expect(parseStudioLink('?studioItem=../x')).toBeNull();
    expect(parseStudioLink('?studioClient=c1')).toBeNull();
  });
  it('accepts https links only', () => {
    expect(isHttps('https://contoso.sharepoint.com/x')).toBe(true);
    expect(isHttps('http://x.com')).toBe(false);
    expect(isHttps('javascript:alert(1)')).toBe(false);
  });
});

describe('API mapping', () => {
  afterEach(() => vi.restoreAllMocks());
  const setup = (json = {}, ok = true, status = 200) => {
    const fetchMock = vi.fn(async () => ({ ok, status, json: async () => json }));
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, api: createStudioApi({ base: '/api', getToken: async () => 'tok' }) };
  };
  it('sends bearer token and exact paths/bodies', async () => {
    const { fetchMock, api } = setup({ deliverable: {} });
    await api.action('c 1', 'i1', { revision: 3, action: 'schedule', link: 'https://x' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/creative-studio/clients/c%201/deliverables/i1/actions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ revision: 3, action: 'schedule', link: 'https://x' });
    await api.send('c1', 'i1', 'internal', { idempotencyKey: 'k', text: 'hi' });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/creative-studio/clients/c1/deliverables/i1/messages/internal');
    await api.saveConfig('c1', { enabled: true });
    expect(fetchMock.mock.calls[2][1].method).toBe('PUT');
    await api.deliveries('c1');
    expect(fetchMock.mock.calls[3][0]).toBe('/api/creative-studio/clients/c1/deliveries');
  });
  it('surfaces server error and status (409)', async () => {
    const { api } = setup({ error: 'This deliverable changed.' }, false, 409);
    await expect(api.update('c', 'i', { revision: 1 })).rejects.toMatchObject({ status: 409, message: 'This deliverable changed.' });
  });
  it('fails closed without a token', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const api = createStudioApi({ base: '/api', getToken: async () => null });
    await expect(api.bootstrap()).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses staffCandidates (not raw users) per client and resolves delivery recipients', () => {
    const boot = {
      staffCandidates: [{ id: 'u1', name: 'Asha', clientIds: ['c1'] }, { id: 'u2', name: 'Ravi', clientIds: ['c2'] }],
      owners: [{ id: 'u3', name: 'Meera', clientIds: ['c1'] }],
      approvers: [{ uid: 'x9', name: 'Client Reviewer', clientIds: ['c1'] }],
    };
    expect(staffCandidatesFor(boot, 'c1').map(u => u.id)).toEqual(['u1']);
    expect(staffCandidatesFor({}, 'c1')).toEqual([]);
    const idx = peopleIndex(boot);
    expect(idx.get('x9')).toBe('Client Reviewer');
    expect(idx.get('u3')).toBe('Meera');
  });
});
