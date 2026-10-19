import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createDemoStore, DEMO_UID, DEMO_EMAIL, DEMO_CLIENTS } from '../lib/clientPortal/demo/demoModel.js';
import { exitDemoUrl } from '../lib/clientPortal/demo/DemoClientPortal.jsx';
import { wantsClientDemo } from '../lib/clientPortal/core.js';
import { TEST_USERS, CLIENT_DEMO } from '../PMT/TestModePanel.jsx';

const src = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('demo model isolation', () => {
  it('never touches fetch', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const s = createDemoStore();
    await s.portalApi.me(); await s.portalApi.listTasks('demo-harbour'); await s.studioApi.bootstrap();
    await s.studioApi.list('demo-harbour'); await s.studioApi.messages('demo-harbour', 'd-ref', 'client');
    expect(f).not.toHaveBeenCalled();
  });
  it('has no Firebase/network imports', () => {
    for (const f of ['lib/clientPortal/demo/demoModel.js', 'lib/clientPortal/demo/DemoClientPortal.jsx']) {
      expect(src(f)).not.toMatch(/firebase|fetch\(|getIdToken|signOut\(|localStorage|sessionStorage/);
    }
  });
  it('creates tasks locally, isolated per store and reset', async () => {
    const a = createDemoStore(); const b = createDemoStore();
    const before = (await a.portalApi.listTasks('demo-kestrel')).tasks.length;
    await a.portalApi.createTask('demo-kestrel', { title: 'New brief', description: 'x' });
    expect((await a.portalApi.listTasks('demo-kestrel')).tasks).toHaveLength(before + 1);
    expect((await b.portalApi.listTasks('demo-kestrel')).tasks).toHaveLength(before);
    a.reset();
    expect((await a.portalApi.listTasks('demo-kestrel')).tasks).toHaveLength(before);
    await expect(a.portalApi.listTasks('other')).rejects.toMatchObject({ status: 403 });
  });
  it('one studio-enabled client only', async () => {
    const s = createDemoStore();
    const b = await s.studioApi.bootstrap();
    expect(b.clients.map(c => c.id)).toEqual(['demo-harbour']);
    expect(b.configs['demo-kestrel'].enabled).toBe(false);
    expect(DEMO_CLIENTS).toHaveLength(2);
    expect(DEMO_EMAIL).toBe('client@example.test');
  });
  it('approves and requests changes locally with revision checks', async () => {
    const s = createDemoStore();
    const ref = (await s.studioApi.list('demo-harbour')).deliverables.find(d => d.id === 'd-ref');
    expect(ref.approvals.reference.approverUid).toBe(DEMO_UID);
    await expect(s.studioApi.action('demo-harbour', 'd-ref', { revision: ref.revision, action: 'decide', phase: 'reference', decision: 'changes_requested' })).rejects.toMatchObject({ status: 400 });
    const r = await s.studioApi.action('demo-harbour', 'd-ref', { revision: ref.revision, action: 'decide', phase: 'reference', decision: 'approved' });
    expect(r.deliverable.stage).toBe('in_production');
    await expect(s.studioApi.action('demo-harbour', 'd-ref', { revision: ref.revision, action: 'decide', phase: 'reference', decision: 'approved' })).rejects.toMatchObject({ status: 409 });
    const fin = (await s.studioApi.list('demo-harbour')).deliverables.find(d => d.id === 'd-final');
    const f = await s.studioApi.action('demo-harbour', 'd-final', { revision: fin.revision, action: 'decide', phase: 'final', decision: 'changes_requested', feedback: 'Swap slide 3' });
    expect(f.deliverable.stage).toBe('final_changes');
    expect((await createDemoStore().studioApi.list('demo-harbour')).deliverables.find(d => d.id === 'd-final').stage).toBe('awaiting_final');
  });
  it('client thread only, idempotent sends', async () => {
    const s = createDemoStore();
    await s.studioApi.send('demo-harbour', 'd-final', 'client', { idempotencyKey: 'k1', text: 'hi' });
    await s.studioApi.send('demo-harbour', 'd-final', 'client', { idempotencyKey: 'k1', text: 'hi' });
    expect((await s.studioApi.messages('demo-harbour', 'd-final', 'client')).messages).toHaveLength(1);
    await expect(s.studioApi.messages('demo-harbour', 'd-final', 'internal')).rejects.toMatchObject({ status: 403 });
  });
});

describe('gate and entry', () => {
  const gate = src('lib/clientPortal/PortalGate.jsx');
  it('demo is DEV-gated, lazy and loses to an active invitation', () => {
    expect(gate).toMatch(/const DemoClientPortal = import\.meta\.env\.DEV \? lazy\(\(\) => import\('\.\/demo\/DemoClientPortal\.jsx'\)\) : null;/);
    expect(gate).toMatch(/!!DemoClientPortal && !inviteToken && wantsClientDemo/);
    expect(gate.indexOf('if (demo) return')).toBeLessThan(gate.indexOf('if (bypass && !inviteToken) return <Suspense'));
    expect(gate).toMatch(/if \(demo \|\| \(bypass && !inviteToken\)\) return undefined;/);
  });
  it('parses only clientDemo=1', () => {
    expect(wantsClientDemo('?clientDemo=1')).toBe(true);
    expect(wantsClientDemo('?clientDemo=true')).toBe(false);
  });
  it('exit leaves demo without signing out', () => {
    expect(exitDemoUrl('https://a.test/?client=1&clientDemo=1&x=2')).toBe('/?x=2');
    expect(src('lib/clientPortal/demo/DemoClientPortal.jsx')).toMatch(/onSignOut=\{exit\}/);
    expect(src('lib/clientPortal/ClientPortal.jsx')).toMatch(/if \(onSignOut\) \{ onSignOut\(\); return; \}/);
  });
  it('injected APIs replace real clients rather than falling back', () => {
    expect(src('lib/clientPortal/ClientPortal.jsx')).toMatch(/portalApi \|\| createPortalApi/);
    expect(src('lib/creativeStudio/PortalStudio.jsx')).toMatch(/injectedApi \? null : createStudioApi/);
  });
  it('staff impersonation list never contains the client', () => {
    expect(TEST_USERS.some(u => u.email === CLIENT_DEMO.email || !u.email.endsWith('@ethinos.com'))).toBe(false);
    expect(CLIENT_DEMO.href).toContain('clientDemo=1');
  });
  it('mirrored to pmt-mobile', () => {
    const walk = (d) => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)).map(x => join(f, x)) : [f]));
    const dir = resolve(__dirname, '../lib/clientPortal');
    for (const f of walk(dir)) expect(readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/clientPortal', f), 'utf8'), f).toBe(readFileSync(join(dir, f), 'utf8'));
    expect(readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/creativeStudio/PortalStudio.jsx'), 'utf8')).toBe(src('lib/creativeStudio/PortalStudio.jsx'));
  });
});
