import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { previewPortalApi, createPortalApi, PREVIEW_NOTICE } from '../lib/clientPortal/core.js';
import { studioPreviewApi } from '../lib/creativeStudio/PortalStudio.jsx';
import { createStudioApi } from '../lib/creativeStudio/core.js';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const mob = (p) => readFileSync(resolve(__dirname, '../../../pmt-mobile/src', p), 'utf8');

describe('staff client preview reuses the real portal components', () => {
  it('desktop ClientView and mobile sheet render real ClientTasks read-only over the preview adapter', () => {
    for (const s of [read('PMT/ClientView.jsx'), mob('components/ClientPreviewSheet.jsx')]) {
      expect(s).toMatch(/import ClientTasks from '\.\.\/lib\/clientPortal\/ClientTasks\.jsx'/);
      expect(s).toMatch(/previewPortalApi\(/);
      expect(s).toMatch(/<ClientTasks [^>]*readOnly \/>/);
      expect(s).not.toMatch(/clientPreviewTasks/);
    }
  });
  it('Studio client mode renders real PortalStudio read-only via server preview list', () => {
    const w = read('lib/creativeStudio/StudioWorkspace.jsx');
    expect(w).toMatch(/<PortalStudio key=.*auth=\{auth\} api=\{previewApi\} readOnly \/>/);
    expect(w).toMatch(/studioPreviewApi\(api, previewClients\)/);
  });
  it('preview adapters expose only reads, hitting the server projection endpoints', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ tasks: [] }) }));
    const portal = createPortalApi({ base: '/api', getToken: async () => 't', fetchImpl });
    const pa = previewPortalApi(portal);
    expect(Object.keys(pa)).toEqual(['listTasks', 'getTaskCollaboration']);
    await pa.listTasks('c1');
    await pa.getTaskCollaboration('c1', 't9');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/client-portal/clients/c1/tasks/t9/collaboration');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/client-portal/clients/c1/tasks?preview=client');
    const studio = { previewList: vi.fn(async () => ({ deliverables: [] })), messages: vi.fn(), action: vi.fn(), list: vi.fn() };
    const sa = studioPreviewApi(studio, [{ id: 'c1', name: 'One' }]);
    expect(Object.keys(sa).sort()).toEqual(['bootstrap', 'list', 'messages']);
    expect(await sa.bootstrap()).toEqual({ clients: [{ id: 'c1', name: 'One' }] });
    await sa.list('c1');
    expect(studio.previewList).toHaveBeenCalledWith('c1');
    expect(studio.list).not.toHaveBeenCalled();
    expect(typeof createStudioApi({ base: '', getToken: async () => 't' }).previewList).toBe('function');
    expect(PREVIEW_NOTICE).toMatch(/Read-only/);
  });
  it('readOnly suppresses mutations and staff identity in the real components', () => {
    const t = read('lib/clientPortal/ClientTasks.jsx');
    expect(t).toMatch(/if \(readOnly \|\| !isPortalTaskStatus/);
    expect(t).toMatch(/!readOnly && <button data-testid="button-portal-add-task"/);
    expect(t).toMatch(/showAdd && !readOnly/);
    expect(t).toMatch(/viewer="client"\s+readOnly=\{readOnly\}/);
    const c = read('lib/clientPortal/TaskCollaboration.jsx');
    expect(c.match(/if \(readOnly\) return;/g)).toHaveLength(3);
    expect(c).toMatch(/\{!readOnly && <form onSubmit=\{submitSubtask\}/);
    expect(c).toMatch(/\{!readOnly && <form onSubmit=\{submitEntry\}/);
    expect(c).toMatch(/disabled=\{busy \|\| readOnly\}/);
    expect(t).toMatch(/statusEditable: false/);
    const p = read('lib/creativeStudio/PortalStudio.jsx');
    expect(p).toMatch(/const uid = readOnly \? null/);
    expect(p).toMatch(/if \(readOnly\) return;/);
    expect(p).toMatch(/phase && readOnly \?/);
    expect(p).toMatch(/thread="client" readOnly=\{readOnly\}/);
  });
});
