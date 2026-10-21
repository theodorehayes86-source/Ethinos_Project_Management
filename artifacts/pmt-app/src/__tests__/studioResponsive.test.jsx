import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import StudioSummaryCards from '../lib/creativeStudio/StudioSummaryCards.jsx';
import StudioCalendar from '../lib/creativeStudio/StudioCalendar.jsx';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Studio uses available width, not the outer browser viewport', () => {
  it('keeps all five summary filters in one compact row at every Studio width', () => {
    const html = renderToStaticMarkup(<StudioSummaryCards counts={{ approved: 2 }} active="approved" onSelect={() => {}} />);
    expect(html).toContain('grid-cols-5');
    expect(html).toContain('min-h-[64px]');
    expect(html).not.toContain('grid-cols-2');
    expect(html).not.toContain('col-span-2');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain(' md:');
  });
  it('switches calendar chips and agenda based on container width', () => {
    const html = renderToStaticMarkup(<StudioCalendar items={[]} month="2026-10" todayKey="2026-10-21" onOpen={() => {}} />);
    expect(html).toContain('grid-cols-7');
    expect(html).toContain('@3xl:hidden');
    expect(html).not.toContain(' md:');
    expect(html).toContain('calendar-deadline-legend');
  });
  it('defines Studio containers without overriding breakpoints for unrelated mobile screens', () => {
    for (const path of ['../index.css', '../../../pmt-mobile/src/index.css']) {
      expect(read(path)).toMatch(/\.cs-root\s*\{[^}]*container-type: inline-size/);
      expect(read(path)).not.toContain('--breakpoint-md:');
    }
  });
  it('keeps responsive Studio modules and fixtures mirrored', () => {
    for (const name of ['ClientSelect', 'PortalStudio', 'StudioCalendar', 'StudioControlPanel', 'StudioReminderLog', 'StudioSummaryCards', 'StudioUI', 'StudioWorkspace']) {
      expect(read(`../lib/creativeStudio/${name}.jsx`), name).toBe(read(`../../../pmt-mobile/src/lib/creativeStudio/${name}.jsx`));
    }
    expect(read('../lib/clientPortal/demo/StudioCalendarDemo.jsx')).toBe(read('../../../pmt-mobile/src/lib/clientPortal/demo/StudioCalendarDemo.jsx'));
  });
  it('removes mobile settings while keeping desktop Control Centre settings', () => {
    const mobile = read('../../../pmt-mobile/src/App.jsx');
    expect(mobile).not.toContain('StudioControlPanel');
    expect(mobile).not.toContain('studioPane');
    expect(mobile).not.toContain('Studio settings');
    expect(mobile).toContain('<StudioWorkspace');
    const desktop = read('../PMT/MasterDataView.jsx');
    expect(desktop).toContain('hidden md:block');
    expect(desktop).toContain('Studio settings are available on desktop.');
  });
});
