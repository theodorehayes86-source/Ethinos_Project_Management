import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isClientAccount, wantsClientEntry, isRealClientId, sharingFields, resetSharing,
  isNewlyShared, clientSafeTask, clientPreviewTasks, sharingConfirmMessage,
  createPortalApi, isRevocationError, portalStats, parseLooseDate, canManageClientPortal,
} from '../lib/clientPortal/core.js';

describe('client portal routing', () => {
  it('makes invitation management available to exactly the API administrator roles', () => {
    expect(canManageClientPortal('Admin')).toBe(true);
    expect(canManageClientPortal('Super Admin')).toBe(true);
    for (const role of ['Client', 'CSM', 'Business Head', 'Employee', 'Director', undefined]) {
      expect(canManageClientPortal(role)).toBe(false);
    }
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    expect(app).toContain('const canSeeControlCenter = canManageClientPortal(currentUser?.role)');
    const view = readFileSync(new URL('../PMT/MasterDataView.jsx', import.meta.url), 'utf8');
    expect(view.match(/if \(tab.id === 'clientPortal'\) return canManageClientPortal/g)).toHaveLength(2);
  });
  it('uses the gated bootstrap from the actual HTML entry', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain('/src/main.jsx');
    const entry = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
    expect(entry).toContain("import './main.tsx'");
    expect(entry).not.toContain('<App');
    const bootstrap = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
    expect(bootstrap).toContain('<PortalGate');
  });
  it('routes non-ethinos accounts to the portal', () => {
    expect(isClientAccount({ email: 'a@brand.com' })).toBe(true);
    expect(isClientAccount({ email: 'Theo@Ethinos.com' })).toBe(false);
    expect(isClientAccount(null)).toBe(false);
  });
  it('detects ?client=1', () => {
    expect(wantsClientEntry('?client=1')).toBe(true);
    expect(wantsClientEntry('?foo=1')).toBe(false);
  });
});

describe('sharing fields', () => {
  it('defaults internal and clears client description', () => {
    expect(sharingFields(undefined, 'x')).toEqual({ visibility: 'internal', clientDescription: null });
    expect(sharingFields('client', '  hi ')).toEqual({ visibility: 'client', clientDescription: 'hi' });
  });
  it('reverting to internal clears client description', () => {
    expect(sharingFields('internal', 'secret')).toEqual({ visibility: 'internal', clientDescription: null });
  });
  it('copies reset to internal', () => {
    expect(resetSharing({ name: 'a', visibility: 'client', clientDescription: 'd' })).toMatchObject({ visibility: 'internal', clientDescription: null });
  });
  it('detects newly shared', () => {
    expect(isNewlyShared({}, 'client')).toBe(true);
    expect(isNewlyShared({ visibility: 'client' }, 'client')).toBe(false);
  });
  it('synthetic clients are not shareable', () => {
    expect(isRealClientId('__personal__')).toBe(false);
    expect(isRealClientId('__ethinos__')).toBe(false);
    expect(isRealClientId('c1')).toBe(true);
  });
});

describe('client-safe projection', () => {
  it('exposes independent email and Teams controls for client task updates in Notifications', () => {
    const source = readFileSync(new URL('../PMT/MasterDataView.jsx', import.meta.url), 'utf8');
    const teams = source.slice(source.indexOf('const TEAMS_PING_EVENTS'), source.indexOf('const NOTIFICATION_EVENTS'));
    expect(teams).toContain("'client-task-updated'");
    expect(source).toContain("id: 'client-task-updated', label: 'Client Task Updated'");
    expect(source).toContain("return eventId === 'mention' || eventId === 'client-task-updated'");
    expect(source).toContain('onUpdateNotificationSetting(event.id, { enabled: !isEnabled })');
    expect(source).toContain('onUpdateNotificationSetting(event.id, { teamsActivityEnabled: !teamsEnabled })');
    expect(source).toContain("event.id === 'client-task-updated' ? (");
    expect(source).toContain('Additional recipients cannot be added.');
  });
  const task = { id: 't1', name: 'Launch', status: 'WIP', dueDate: '5th Aug 2026', comment: 'INTERNAL SECRET', assigneeName: 'Theo', steps: [{ label: 's' }] };
  it('never exposes internal comment', () => {
    const s = clientSafeTask(task);
    expect(s).toEqual({ id: 't1', title: 'Launch', category: '', date: null, status: 'WIP', dueDate: '5th Aug 2026', description: '' });
    expect(JSON.stringify(s)).not.toContain('INTERNAL');
    expect(sharingConfirmMessage(task)).not.toContain('INTERNAL SECRET');
  });
  it('preview includes only client-visible ordinary tasks', () => {
    const list = clientPreviewTasks([
      { ...task, category: 'Social Media', visibility: 'client', clientDescription: 'Public' },
      { ...task, id: 't2' },
      { ...task, id: 't3', visibility: 'client', taskGroupId: 'g' },
      { ...task, id: 't4', visibility: 'client', archived: true },
    ]);
    expect(list.map(t => t.id)).toEqual(['t1']);
    expect(list[0].description).toBe('Public');
    expect(list[0].category).toBe('Social Media');
  });
  it('includes category in sharing confirmation and renders it in both client previews', () => {
    expect(sharingConfirmMessage({ ...task, category: 'Content' })).toContain('Category: Content');
    expect(clientSafeTask({ ...task, category: null }).category).toBe('');
    expect(clientSafeTask({ ...task, category: { internal: 'SECRET' } }).category).toBe('');
    const desktop = readFileSync(new URL('../PMT/ClientView.jsx', import.meta.url), 'utf8');
    const mobile = readFileSync(new URL('../../../pmt-mobile/src/components/ClientPreviewSheet.jsx', import.meta.url), 'utf8');
    expect(desktop).toContain('<span>Category</span>');
    for (const source of [desktop, mobile]) {
      expect(source).toContain('preview-category-${t.id}');
      expect(source).toContain("t.category ||");
      expect(source).toContain('Uncategorised');
    }
  });
  it('keeps the task date distinct from its due date in both previews', () => {
    const [preview] = clientPreviewTasks([{ ...task, visibility: 'client', date: '1st Aug 2026' }]);
    expect(preview.date).toBe('1st Aug 2026');
    expect(preview.dueDate).toBe('5th Aug 2026');
    expect(clientSafeTask(task).date).toBeNull();
    expect(clientSafeTask({ ...task, date: { internal: 'SECRET' } }).date).toBeNull();
    const desktop = readFileSync(new URL('../PMT/ClientView.jsx', import.meta.url), 'utf8');
    const mobile = readFileSync(new URL('../../../pmt-mobile/src/components/ClientPreviewSheet.jsx', import.meta.url), 'utf8');
    expect(desktop).toContain('<span>Date</span>');
    for (const source of [desktop, mobile]) {
      expect(source).toContain('preview-date-${t.id}');
      expect(source).toContain('t.date ||');
      expect(source).toContain('No date');
    }
  });
});

describe('portal api', () => {
  it('sends bearer token and surfaces {error}', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) }));
    const api = createPortalApi({ base: '/api', getToken: async () => 'tok', fetchImpl });
    await expect(api.me()).rejects.toMatchObject({ message: 'Forbidden', status: 403 });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/client-portal/me');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    try { await api.me(); } catch (e) { expect(isRevocationError(e)).toBe(true); }
  });
  it('omits empty dueDate on create', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ task: {} }) }));
    const api = createPortalApi({ base: '/api', getToken: async () => 'tok', fetchImpl });
    await api.createTask('c 1', { title: 'T', description: 'D' });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/client-portal/clients/c%201/tasks');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ title: 'T', description: 'D' });
  });
});

describe('stats', () => {
  it('counts statuses including In Progress / Completed', () => {
    const now = new Date(2026, 7, 5);
    const s = portalStats([
      { status: 'In Progress', dueDate: '2026-08-05' },
      { status: 'Completed', dueDate: '2026-08-01' },
      { status: 'On Hold', dueDate: '2026-08-01' },
    ], now);
    expect(s).toEqual({ pending: 0, wip: 1, done: 1, hold: 1, overdue: 1, dueToday: 1 });
    expect(parseLooseDate('5th Aug 2026').getDate()).toBe(5);
  });
});

import { filterPortalTasks } from '../lib/clientPortal/core.js';
describe('portal filters', () => {
  const tasks = [
    { id: 1, title: 'Brief', description: 'Spring promo', status: 'In Progress', dueDate: '2026-08-01' },
    { id: 2, title: 'Report', description: '', status: 'Completed', dueDate: '2026-07-01' },
    { id: 3, title: 'Assets', description: '', status: 'Pending', dueDate: '2026-07-01' },
  ];
  const now = new Date(2026, 7, 5);
  it('searches title and description', () => {
    expect(filterPortalTasks(tasks, { query: 'promo' }, now).map(t => t.id)).toEqual([1]);
  });
  it('filters by status bucket and overdue', () => {
    expect(filterPortalTasks(tasks, { status: 'done' }, now).map(t => t.id)).toEqual([2]);
    expect(filterPortalTasks(tasks, { status: 'overdue' }, now).map(t => t.id)).toEqual([1, 3]);
  });
});
