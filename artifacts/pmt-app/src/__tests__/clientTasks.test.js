import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPortalApi, PORTAL_TASK_STATUSES, portalStatusValue, statusEditState, validatePortalTask, mergeTask,
  localDateKey, monthGrid, shiftMonth, groupTasksByDue, filterPortalTasks, portalStats, clientSafeTask,
} from '../lib/clientPortal/core.js';
import { createDemoStore } from '../lib/clientPortal/demo/demoModel.js';
import { demoInitialProps, exitDemoUrl } from '../lib/clientPortal/demo/DemoClientPortal.jsx';

const src = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('status contract', () => {
  it('offers only Pending / In Progress / Completed', () => {
    expect(PORTAL_TASK_STATUSES).toEqual(['Pending', 'In Progress', 'Completed']);
  });
  it('maps canonical staff values to dropdown values; On Hold stays display-only', () => {
    expect(portalStatusValue('WIP')).toBe('In Progress');
    expect(portalStatusValue('Done')).toBe('Completed');
    expect(portalStatusValue(undefined)).toBe('Pending');
    expect(PORTAL_TASK_STATUSES).not.toContain(portalStatusValue('On Hold'));
  });
  it('obeys statusEditable/statusEditReason', () => {
    expect(statusEditState({})).toEqual({ editable: true, reason: '' });
    expect(statusEditState({ statusEditable: false, statusEditReason: 'Timer running' })).toEqual({ editable: false, reason: 'Timer running' });
    expect(statusEditState({ statusEditable: false }).reason).toMatch(/agency/);
  });
  it('PATCHes status and sends optional category on create', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ task: {} }) }));
    const api = createPortalApi({ base: '/api', getToken: async () => 't', fetchImpl });
    await api.updateTaskStatus('c 1', 't/2', 'In Progress');
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/client-portal/clients/c%201/tasks/t%2F2');
    expect(fetchImpl.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ status: 'In Progress' });
    await api.createTask('c', { title: 'T', description: 'D', category: 'SEO' });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ title: 'T', description: 'D', category: 'SEO' });
  });
  it('surfaces 409 server messages', async () => {
    const api = createPortalApi({ base: '', getToken: async () => 't', fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ error: 'A timer is running on this task.' }) }) });
    await expect(api.updateTaskStatus('c', 't', 'Completed')).rejects.toMatchObject({ status: 409, message: 'A timer is running on this task.' });
  });
  it('validates category length', () => {
    expect(validatePortalTask({ title: 'x', category: 'a'.repeat(101) }).category).toBeTruthy();
    expect(validatePortalTask({ title: 'x', category: 'a'.repeat(100) })).toEqual({});
    expect(validatePortalTask({ title: ' ' }).title).toBeTruthy();
  });
  it('description is clientDescription only', () => {
    expect(clientSafeTask({ title: 'a', comment: 'internal note' }).description).toBe('');
  });
});

describe('merge and filters', () => {
  it('merges the server task without duplicating', () => {
    const list = [{ id: 1, status: 'Pending' }, { id: 2 }];
    const out = mergeTask(list, { id: '1', status: 'Done' });
    expect(out).toHaveLength(2);
    expect(out[0].status).toBe('Done');
    expect(mergeTask(list, { id: 3 })).toHaveLength(3);
    expect(mergeTask(list, null)).toBe(list);
  });
  it('search covers category and On Hold has its own bucket', () => {
    const t = [{ id: 1, title: 'A', category: 'SEO' }, { id: 2, title: 'B', status: 'On Hold' }];
    expect(filterPortalTasks(t, { query: 'seo' }).map(x => x.id)).toEqual([1]);
    expect(filterPortalTasks(t, { status: 'hold' }).map(x => x.id)).toEqual([2]);
    expect(portalStats(t).hold).toBe(1);
  });
});

describe('calendar helpers (local dates)', () => {
  it('local keys never shift via UTC', () => {
    expect(localDateKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
  it('builds a Monday-first 42 cell grid', () => {
    const g = monthGrid(2026, 1); // Feb 2026 starts Sunday
    expect(g).toHaveLength(42);
    expect(g[0].key).toBe('2026-01-26');
    expect(g[6].key).toBe('2026-02-01');
    expect(g.filter(c => c.inMonth)).toHaveLength(28);
  });
  it('shifts months across years', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });
  it('groups by local due date with undated separate', () => {
    const { byDate, undated } = groupTasksByDue([{ id: 1, dueDate: '2026-03-05' }, { id: 2, dueDate: '5th Mar 2026' }, { id: 3 }, { id: 4, dueDate: 'soon' }]);
    expect(byDate['2026-03-05'].map(t => t.id)).toEqual([1, 2]);
    expect(undated.map(t => t.id)).toEqual([3, 4]);
  });
});

describe('demo task operations', () => {
  it('updates status locally with canonical storage and no fetch', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const s = createDemoStore();
    const r = await s.portalApi.updateTaskStatus('demo-harbour', 't1', 'In Progress');
    expect(r.task.status).toBe('WIP');
    expect((await s.portalApi.listTasks('demo-harbour')).tasks.find(t => t.id === 't1').status).toBe('WIP');
    expect((await createDemoStore().portalApi.listTasks('demo-harbour')).tasks.find(t => t.id === 't1').status).toBe('Pending');
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects On Hold, unknown tasks, locked tasks and other clients', async () => {
    const s = createDemoStore();
    await expect(s.portalApi.updateTaskStatus('demo-harbour', 't1', 'On Hold')).rejects.toMatchObject({ status: 400 });
    await expect(s.portalApi.updateTaskStatus('demo-harbour', 'nope', 'Completed')).rejects.toMatchObject({ status: 404 });
    await expect(s.portalApi.updateTaskStatus('demo-harbour', 't6', 'Completed')).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/time/) });
    await expect(s.portalApi.updateTaskStatus('demo-kestrel', 't1', 'Completed')).rejects.toMatchObject({ status: 404 });
    await expect(s.portalApi.updateTaskStatus('other', 't1', 'Completed')).rejects.toMatchObject({ status: 403 });
  });
  it('creates with category and validates its length', async () => {
    const s = createDemoStore();
    const { task } = await s.portalApi.createTask('demo-kestrel', { title: 'New', category: ' Social ' });
    expect(task.category).toBe('Social');
    await expect(s.portalApi.createTask('demo-kestrel', { title: 'x', category: 'a'.repeat(101) })).rejects.toMatchObject({ status: 400 });
  });
  it('seed has categories, descriptions, undated and locked tasks; no internal fields', async () => {
    const { tasks } = await createDemoStore().portalApi.listTasks('demo-harbour');
    expect(tasks.every(t => t.category)).toBe(true);
    expect(tasks.some(t => !t.dueDate)).toBe(true);
    expect(tasks.some(t => t.statusEditable === false && t.statusEditReason)).toBe(true);
    for (const t of tasks) expect(Object.keys(t).sort()).toEqual(expect.not.arrayContaining(['comment', 'assignee', 'checklist', 'qc', 'timer']));
  });
  it('seed due dates are local YYYY-MM-DD', async () => {
    const now = new Date(2026, 4, 10, 0, 15).getTime(); // just after local midnight
    const { tasks } = await createDemoStore({ now: () => now }).portalApi.listTasks('demo-kestrel');
    expect(tasks.find(t => t.id === 't4').dueDate).toBe('2026-05-10');
  });
  it('initial props are allow-listed and stripped on exit', () => {
    expect(demoInitialProps('?demoTaskClient=demo-harbour&demoTaskView=calendar')).toEqual({ initialClientId: 'demo-harbour', initialTaskView: 'calendar' });
    expect(demoInitialProps('?demoTaskClient=../x&demoTaskView=admin')).toEqual({ initialClientId: undefined, initialTaskView: undefined });
    expect(exitDemoUrl('https://a.test/?clientDemo=1&demoTaskClient=demo-harbour&demoTaskView=calendar')).toBe('/');
  });
});

describe('UI wiring', () => {
  const ui = src('lib/clientPortal/ClientTasks.jsx');
  it('guards list loads against in-flight or finished status saves', () => {
    expect(ui).toMatch(/if \(epoch !== epochRef\.current \|\| inflight\.current\.size > 0\) return;/);
    expect(ui).toMatch(/inflight\.current\.has\(id\)/);
    expect(ui).toMatch(/opRef\.current\[id\] !== op/);
    expect(ui).toMatch(/setTasks\(ts => mergeTask\(ts, res\.task\)\)/);
  });
  it('no silent failures: missing task or error shows retry', () => {
    expect(ui).toMatch(/if \(!res\?\.task\) throw/);
    expect(ui).toMatch(/button-status-retry-/);
  });
  it('list and calendar share filters and the detail view', () => {
    expect(ui).toMatch(/<CalendarView tasks=\{visible\}/);
    expect(ui).toMatch(/<TaskList tasks=\{visible\}/);
    expect(ui).toMatch(/<TaskDetail\s+task=\{openTask\}\s+statusProps=\{statusPropsFor\(openTask\)\}/);
  });
  it('shows no internal task fields', () => {
    expect(ui.slice(ui.indexOf('import React'))).not.toMatch(/\.comment\b|assignee|checklist|qcStatus|timeLogs|clientDescription/);
    expect(src('lib/clientPortal/ClientPortal.jsx')).toMatch(/initialView=\{initialTaskView\}/);
  });
});
