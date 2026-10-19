import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPortalApi, safeExternalUrl, validateCollabEntry, validateCollabSubtask, requestIdFor, newRequestId,
  isCollabClosedError, isCollaborationEligible, mergeById, sortCollab,
} from '../lib/clientPortal/core.js';
import { createDemoStore } from '../lib/clientPortal/demo/demoModel.js';
import { demoInitialProps, exitDemoUrl } from '../lib/clientPortal/demo/DemoClientPortal.jsx';

const src = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const mobile = (p) => readFileSync(resolve(__dirname, '../../../pmt-mobile/src', p), 'utf8');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
afterEach(() => vi.unstubAllGlobals());

describe('collaboration helpers', () => {
  it('accepts only http(s) links', () => {
    expect(safeExternalUrl('https://a.test/x')).toBe('https://a.test/x');
    expect(safeExternalUrl(' http://a.test ')).toBe('http://a.test/');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '/relative', 'ftp://a', '', `https://a.test/${'x'.repeat(2050)}`]) expect(safeExternalUrl(bad)).toBeNull();
  });
  it('validates entries and subtasks with limits', () => {
    expect(validateCollabEntry({ type: 'message', text: ' ' }).text).toBeTruthy();
    expect(validateCollabEntry({ type: 'note', text: 'x'.repeat(4001) }).text).toBeTruthy();
    expect(validateCollabEntry({ type: 'link', text: '', url: 'https://a.test' })).toEqual({});
    expect(validateCollabEntry({ type: 'link', url: 'javascript:x' }).url).toBeTruthy();
    expect(validateCollabEntry({ type: 'internal', text: 'x' }).type).toBeTruthy();
    expect(validateCollabSubtask({ title: '' }).title).toBeTruthy();
    expect(validateCollabSubtask({ title: 'x'.repeat(201) }).title).toBeTruthy();
    expect(validateCollabSubtask({ title: 'ok' })).toEqual({});
  });
  it('keeps the request id for an unchanged retry and rotates on change', () => {
    expect(newRequestId()).toMatch(UUID);
    const a = requestIdFor(null, { text: 'hi' });
    expect(requestIdFor(a, { text: 'hi' })).toBe(a);
    expect(requestIdFor(a, { text: 'hi!' }).id).not.toBe(a.id);
  });
  it('fails closed on 401/403/404 only', () => {
    expect([401, 403, 404].every(status => isCollabClosedError({ status }))).toBe(true);
    expect(isCollabClosedError({ status: 500 })).toBe(false);
  });
  it('staff eligibility: real client, shared, ordinary, not archived', () => {
    const t = { visibility: 'client' };
    expect(isCollaborationEligible(t, 'c1')).toBe(true);
    expect(isCollaborationEligible({}, 'c1')).toBe(false);
    expect(isCollaborationEligible(t, '__personal__')).toBe(false);
    expect(isCollaborationEligible({ ...t, archived: true }, 'c1')).toBe(false);
    expect(isCollaborationEligible({ ...t, taskGroupId: 'g' }, 'c1')).toBe(false);
    expect(isCollaborationEligible({ ...t, taskType: 'checklist' }, 'c1')).toBe(false);
  });
  it('merges and sorts without duplicates', () => {
    expect(mergeById([{ id: 1, t: 'a' }], { id: '1', t: 'b' })).toHaveLength(1);
    expect(sortCollab([{ createdAt: 2 }, { createdAt: 1 }]).map(x => x.createdAt)).toEqual([1, 2]);
  });
  it('API paths and bodies', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const api = createPortalApi({ base: '/api', getToken: async () => 't', fetchImpl });
    await api.getTaskCollaboration('c 1', 't1');
    await api.addCollaborationEntry('c', 't', { type: 'link', text: '', url: 'https://a.test/', requestId: 'r' });
    await api.addCollaborationSubtask('c', 't', { title: 'S', requestId: 'r2' });
    await api.setCollaborationSubtask('c', 't', 's/1', { completed: true });
    const [g, e, st, p] = fetchImpl.mock.calls;
    expect(g[0]).toBe('/api/client-portal/clients/c%201/tasks/t1/collaboration');
    expect(e[0]).toBe('/api/client-portal/clients/c/tasks/t/collaboration/entries');
    expect(JSON.parse(e[1].body)).toEqual({ type: 'link', text: '', url: 'https://a.test/', requestId: 'r' });
    expect(JSON.parse(st[1].body)).toEqual({ title: 'S', requestId: 'r2' });
    expect(p[0]).toBe('/api/client-portal/clients/c/tasks/t/collaboration/subtasks/s%2F1');
    expect(p[1].method).toBe('PATCH');
    expect(JSON.parse(p[1].body)).toEqual({ completed: true });
  });
});

describe('demo collaboration', () => {
  const rid = () => newRequestId();
  it('seeded, local, idempotent, reset-isolated, no fetch', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const s = createDemoStore();
    const c = await s.portalApi.getTaskCollaboration('demo-harbour', 't1');
    expect(c.entries.map(e => e.type).sort()).toEqual(['link', 'message', 'note']);
    expect(c.subtasks).toHaveLength(2);
    const id = rid();
    const a = await s.portalApi.addCollaborationEntry('demo-harbour', 't1', { type: 'message', text: 'Hi', requestId: id });
    const b = await s.portalApi.addCollaborationEntry('demo-harbour', 't1', { type: 'message', text: 'Hi', requestId: id });
    expect(b.entry.id).toBe(a.entry.id);
    const { subtask } = await s.portalApi.addCollaborationSubtask('demo-harbour', 't1', { title: 'New', requestId: rid() });
    expect((await s.portalApi.setCollaborationSubtask('demo-harbour', 't1', subtask.id, { completed: true })).subtask.completed).toBe(true);
    expect((await s.portalApi.getTaskCollaboration('demo-harbour', 't1')).entries).toHaveLength(4);
    expect((await createDemoStore().portalApi.getTaskCollaboration('demo-harbour', 't1')).entries).toHaveLength(3);
    s.reset();
    expect((await s.portalApi.getTaskCollaboration('demo-harbour', 't1')).subtasks).toHaveLength(2);
    expect(f).not.toHaveBeenCalled();
  });
  it('validates and enforces access', async () => {
    const s = createDemoStore();
    await expect(s.portalApi.addCollaborationEntry('demo-harbour', 't1', { type: 'link', url: 'javascript:x', requestId: rid() })).rejects.toMatchObject({ status: 400 });
    await expect(s.portalApi.addCollaborationEntry('demo-harbour', 't1', { type: 'message', text: '', requestId: rid() })).rejects.toMatchObject({ status: 400 });
    await expect(s.portalApi.addCollaborationEntry('demo-harbour', 't1', { type: 'message', text: 'x', requestId: 'nope' })).rejects.toMatchObject({ status: 400 });
    await expect(s.portalApi.getTaskCollaboration('demo-kestrel', 't1')).rejects.toMatchObject({ status: 404 });
    await expect(s.portalApi.getTaskCollaboration('other', 't1')).rejects.toMatchObject({ status: 403 });
  });
  it('demoTaskId is allow-listed and stripped', () => {
    expect(demoInitialProps('?demoTaskClient=demo-harbour&demoTaskId=t1').initialTaskId).toBe('t1');
    expect(demoInitialProps('?demoTaskId=../x').initialTaskId).toBeUndefined();
    expect(exitDemoUrl('https://a.test/?clientDemo=1&demoTaskId=t1')).toBe('/');
  });
});

describe('component and wiring', () => {
  const c = src('lib/clientPortal/TaskCollaboration.jsx');
  it('links open safely; stale/unmount guards; fail closed clears content', () => {
    expect(c).toMatch(/target="_blank" rel="noopener noreferrer"/);
    expect(c).toMatch(/const href = e\.type === 'link' \? safeExternalUrl\(e\.url\)/);
    expect(c).toMatch(/seq !== seqRef\.current/);
    expect(c).toMatch(/aliveRef\.current = false/);
    const fc = c.slice(c.indexOf('const failClosed'), c.indexOf('const load'));
    expect(fc).toMatch(/setData\(null\)/);
    expect(fc).toMatch(/onClosedRef\.current\?\.\(err\)/);
    expect(c).toMatch(/busyRef\.current\.entry/);
    expect(c).toMatch(/requestIdFor\(entrySlot\.current, payload\)/);
    expect(c).toMatch(/Shared with client/);
  });
  it('never touches internal messages/steps', () => {
    const body = c.slice(c.indexOf('import React'));
    expect(body).not.toMatch(/\.messages\b|\.steps\b|\.comment\b|firebase/);
  });
  it('client detail embeds collaboration with the selected client id', () => {
    const t = src('lib/clientPortal/ClientTasks.jsx');
    expect(t).toMatch(/<TaskCollaboration[\s\S]*?clientId=\{client\.id\}[\s\S]*?taskId=\{openTask\.id\}/);
  });
  it('desktop staff: eligible tasks of the selected client only, staff token api', () => {
    const v = src('PMT/ClientView.jsx');
    expect(v).toMatch(/collaboration=\{isCollaborationEligible\(detailTask, selectedClient\?\.id\) && \(clientLogs\[selectedClient\.id\] \|\| \[\]\)\.some/);
    expect(v).toMatch(/clientId=\{selectedClient\.id\}/);
    expect(v).toMatch(/getToken: async \(\) => \(auth\.currentUser \? auth\.currentUser\.getIdToken\(\) : null\)/);
    expect(src('PMT/TaskDetailPanel.jsx')).toMatch(/\{collaboration && \(/);
  });
  it('mobile staff: uses task._clientId and saved visibility', () => {
    const m = mobile('components/TaskDetailSheet.jsx');
    expect(m).toMatch(/isCollaborationEligible\(\{ \.\.\.task, visibility: savedVisibility \}, task\._clientId\)/);
    expect(m).toMatch(/clientId=\{task\._clientId\}/);
  });
  it('mirrored', () => {
    for (const f of ['TaskCollaboration.jsx', 'ClientTasks.jsx', 'ClientPortal.jsx', 'core.js', 'demo/demoModel.js', 'demo/DemoClientPortal.jsx']) {
      expect(mobile(`lib/clientPortal/${f}`), f).toBe(src(`lib/clientPortal/${f}`));
    }
  });
});

import { createMutationGate } from '../lib/clientPortal/core.js';
describe('load/mutation race guard', () => {
  it('drops a load that overlapped any mutation start, end or in-flight state', () => {
    const g = createMutationGate();
    const s0 = g.snapshot();
    expect(g.canInstall(s0)).toBe(true);
    g.begin();
    const s1 = g.snapshot();
    expect(g.canInstall(s0)).toBe(false); // started after load began
    expect(g.canInstall(s1)).toBe(false); // in flight
    g.end();
    expect(g.canInstall(s1)).toBe(false); // finished after load began
    const s2 = g.snapshot();
    expect(g.canInstall(s2)).toBe(true);
    g.begin(); g.begin(); g.end();
    expect(g.inFlight()).toBe(1);
    expect(g.canInstall(g.snapshot())).toBe(false);
  });
  it('component gates every mutation and closed state', () => {
    const c = readFileSync(resolve(__dirname, '../lib/clientPortal/TaskCollaboration.jsx'), 'utf8');
    expect(c.match(/gate\.begin\(\)/g)).toHaveLength(3);
    expect(c.match(/gate\.end\(\)/g)).toHaveLength(3);
    expect(c).toMatch(/if \(!gate\.canInstall\(snap\)\) return;/);
    expect(c.match(/if \(!canApply\(\)\) return;/g)).toHaveLength(3);
    expect(c).toMatch(/const canApply = \(\) => aliveRef\.current && !closedRef\.current/);
  });
  it('demo rejects requestId reuse with changed payload (409) and replays identical', async () => {
    const s = createDemoStore();
    const id = newRequestId();
    const a = await s.portalApi.addCollaborationSubtask('demo-harbour', 't1', { title: 'A', requestId: id });
    expect((await s.portalApi.addCollaborationSubtask('demo-harbour', 't1', { title: 'A', requestId: id })).subtask.id).toBe(a.subtask.id);
    await expect(s.portalApi.addCollaborationSubtask('demo-harbour', 't1', { title: 'B', requestId: id })).rejects.toMatchObject({ status: 409 });
    const e = newRequestId();
    await s.portalApi.addCollaborationEntry('demo-harbour', 't1', { type: 'note', text: 'x', requestId: e });
    await expect(s.portalApi.addCollaborationEntry('demo-harbour', 't1', { type: 'note', text: 'y', requestId: e })).rejects.toMatchObject({ status: 409 });
  });
});
