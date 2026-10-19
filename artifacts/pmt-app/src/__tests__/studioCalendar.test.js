import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { studioMonthGrid, groupStudioByDay, isStudioLayout } from '../lib/creativeStudio/calendar.js';
import { demoInitialProps } from '../lib/clientPortal/demo/DemoClientPortal.jsx';
import { studioDemoItems } from '../lib/clientPortal/demo/StudioCalendarDemo.jsx';

const src = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const mobile = (p) => readFileSync(resolve(__dirname, '../../../pmt-mobile/src', p), 'utf8');

describe('studio month grid', () => {
  it('is Monday-first with 42 cells', () => {
    const g = studioMonthGrid('2026-02'); // 1 Feb 2026 is a Sunday
    expect(g).toHaveLength(42);
    expect(g[0].key).toBe('2026-01-26');
    expect(g[6]).toMatchObject({ key: '2026-02-01', inMonth: true, weekday: 6 });
    expect(g.filter(c => c.inMonth)).toHaveLength(28);
  });
  it('handles leap years and month lengths', () => {
    expect(studioMonthGrid('2028-02').filter(c => c.inMonth).map(c => c.key).pop()).toBe('2028-02-29');
    expect(studioMonthGrid('2026-04').filter(c => c.inMonth)).toHaveLength(30);
  });
  it('crosses year boundaries', () => {
    const dec = studioMonthGrid('2026-12');
    expect(dec[0].key).toBe('2026-11-30');
    expect(dec.at(-1).key).toBe('2027-01-10');
    expect(studioMonthGrid('2027-01')[0].key).toBe('2026-12-28');
  });
});

describe('timezone placement', () => {
  it("uses each item's own timezone, not UTC or the viewer", () => {
    const { byDay } = groupStudioByDay([
      { id: 'ist', plannedAt: '2026-03-09T20:00:00.000Z', timezone: 'Asia/Kolkata' },     // 10 Mar 01:30 IST
      { id: 'ldn', plannedAt: '2026-03-09T20:00:00.000Z', timezone: 'Europe/London' },    // 9 Mar 20:00
      { id: 'ny', plannedAt: '2026-01-01T03:00:00.000Z', timezone: 'America/New_York' },  // 31 Dec 2025 22:00
    ]);
    expect(byDay['2026-03-10'].map(i => i.id)).toEqual(['ist']);
    expect(byDay['2026-03-09'].map(i => i.id)).toEqual(['ldn']);
    expect(byDay['2025-12-31'].map(i => i.id)).toEqual(['ny']);
  });
  it('sorts by instant and separates unscheduled/invalid', () => {
    const { byDay, unscheduled } = groupStudioByDay([
      { id: 'b', plannedAt: '2026-03-05T10:00:00Z', timezone: 'Asia/Kolkata' },
      { id: 'a', plannedAt: '2026-03-05T04:00:00Z', timezone: 'Asia/Kolkata' },
      { id: 'u', plannedAt: null }, { id: 'bad', plannedAt: 'nope' },
    ]);
    expect(byDay['2026-03-05'].map(i => i.id)).toEqual(['a', 'b']);
    expect(unscheduled.map(i => i.id)).toEqual(['u', 'bad']);
  });
  it('layout values are allow-listed', () => {
    expect(isStudioLayout('calendar')).toBe(true);
    expect(isStudioLayout('kanban')).toBe(false);
  });
});

describe('workspace wiring', () => {
  const w = src('lib/creativeStudio/StudioWorkspace.jsx');
  it('calendar is a layout inside Content plan fed by the same filtered dataset', () => {
    expect(w).toMatch(/<StudioCalendar items=\{filtered\} month=\{month\}/);
    expect(w).toMatch(/onOpen=\{setSelectedId\}/);
    expect(w).toMatch(/button-plan-layout-/);
    expect(w).toMatch(/planLayout === 'calendar' \?/);
    expect(w).toMatch(/\[\['plan', 'Content plan'\], \['tracker', 'Deliverables'\]/); // no new main nav
    expect(w).toMatch(/JSON\.stringify\(\{ view, month, planLayout,/);
  });
  it('calendar never edits dates or calls the API', () => {
    const c = src('lib/creativeStudio/StudioCalendar.jsx');
    expect(c).not.toMatch(/api\.|fetch|draggable|onDrop|plannedAt\s*=/);
    expect(c).toMatch(/aria-label="Content calendar month"/);
    expect(c).toMatch(/calendar-unscheduled/);
  });
  it('dev fixture is only reachable via the demo query and has a cross-day item', () => {
    expect(demoInitialProps('?demoStudioCalendar=1').studioCalendar).toBe(true);
    expect(demoInitialProps('').studioCalendar).toBe(false);
    const items = studioDemoItems('2026-03');
    const { byDay, unscheduled } = groupStudioByDay(items);
    expect(byDay['2026-03-10'].map(i => i.id)).toContain('sd3');
    expect(byDay['2026-03-09'].map(i => i.id)).toContain('sd4');
    expect(unscheduled).toHaveLength(1);
    expect(src('lib/clientPortal/demo/StudioCalendarDemo.jsx')).not.toMatch(/createStudioApi|fetch\(|getIdToken/);
  });
  it('mirrored to pmt-mobile', () => {
    for (const f of ['creativeStudio/calendar.js', 'creativeStudio/StudioCalendar.jsx', 'creativeStudio/StudioWorkspace.jsx', 'clientPortal/demo/StudioCalendarDemo.jsx', 'clientPortal/demo/DemoClientPortal.jsx']) {
      expect(mobile(`lib/${f}`), f).toBe(src(`lib/${f}`));
    }
  });
});

describe('client portal shared studio items', () => {
  it('clientVisible: explicit share is the only gate (drafts included, unshared/archived excluded)', async () => {
    const { clientVisible } = await import('../lib/creativeStudio/core.js');
    expect(clientVisible({ shared: true, archived: false, stage: 'internal_draft' })).toBe(true);
    expect(clientVisible({ shared: false, archived: false, stage: 'final_approved' })).toBe(false);
    expect(clientVisible({ shared: true, archived: true, stage: 'final_approved' })).toBe(false);
    expect(clientVisible(null)).toBe(false);
  });
  it('demo store lists shared drafts and excludes unshared and archived', async () => {
    const { createDemoStore } = await import('../lib/clientPortal/demo/demoModel.js');
    const { deliverables } = await createDemoStore().studioApi.list('demo-harbour');
    const ids = deliverables.map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining(['d-draft', 'd-undated']));
    expect(ids).not.toContain('d-hidden');
    expect(ids).not.toContain('d-archived');
    const { byDay, unscheduled } = groupStudioByDay(deliverables);
    const draft = deliverables.find(d => d.id === 'd-draft');
    const { dayKey } = await import('../lib/creativeStudio/core.js');
    expect(byDay[dayKey(draft.plannedAt, draft.timezone)].map(d => d.id)).toContain('d-draft');
    expect(unscheduled.map(d => d.id)).toEqual(['d-undated']);
  });
  it('PortalStudio renders the shared StudioCalendar from API items only and opens PortalDetail', () => {
    const p = src('lib/creativeStudio/PortalStudio.jsx');
    expect(p).toMatch(/<StudioCalendar items=\{items\} month=\{month\} todayKey=\{portalTodayKey\(\)\} selectedId=\{openId\} onOpen=\{setOpenId\}/);
    expect(p).toMatch(/button-portal-layout-/);
    expect(p).toMatch(/if \(open\) return <PortalDetail/);
    expect(mobile('lib/creativeStudio/PortalStudio.jsx')).toBe(p);
  });
  it('portal today key follows the given timezone', async () => {
    const { portalTodayKey } = await import('../lib/creativeStudio/PortalStudio.jsx');
    const t = Date.parse('2026-12-31T20:00:00Z');
    expect(portalTodayKey(t, 'Asia/Kolkata')).toBe('2027-01-01');
    expect(portalTodayKey(t, 'America/New_York')).toBe('2026-12-31');
  });
});
