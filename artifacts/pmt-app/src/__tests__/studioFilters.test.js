import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesStudioCard, studioCardCounts, STUDIO_CARDS, isStudioCard } from '../lib/creativeStudio/summary.js';
import { studioDeadlineTone, mostUrgentStudioTone, DEADLINE_TONES } from '../lib/creativeStudio/calendar.js';
import StudioSummaryCards from '../lib/creativeStudio/StudioSummaryCards.jsx';
import StudioCalendar from '../lib/creativeStudio/StudioCalendar.jsx';

const now = Date.parse('2026-10-19T06:30:00Z'); // noon IST
const base = { timezone: 'Asia/Kolkata', stage: 'in_production' };
const items = [
  { ...base, id: 'far', plannedAt: '2026-10-29T06:30:00Z' },
  { ...base, id: 'close', plannedAt: '2026-10-20T06:30:00Z' },
  { ...base, id: 'overdue', plannedAt: '2026-10-18T06:30:00Z' },
  { ...base, id: 'approved', stage: 'final_approved' },
  { ...base, id: 'scheduled', stage: 'final_approved', scheduled: true },
  { ...base, id: 'archived', archived: true, stage: 'final_approved', scheduled: true },
];

describe('Studio summary filters', () => {
  it.each([
    ['approved', ['approved', 'scheduled']],
    ['wip', ['far', 'close', 'overdue']],
    ['soon', ['close', 'overdue']],
    ['scheduled', ['scheduled']],
    ['ans', ['approved']],
  ])('%s selects exactly its counted records', (key, expected) => {
    const rows = items.filter(i => matchesStudioCard(i, key, now));
    expect(rows.map(i => i.id)).toEqual(expected);
    const card = STUDIO_CARDS.find(c => c.key === key);
    expect(studioCardCounts(items, now)[card.count]).toBe(rows.length);
  });
  it('all restores the base dataset; persisted invalid card keys are rejected', () => {
    expect(items.filter(i => matchesStudioCard(i, 'all', now))).toEqual(items);
    expect(isStudioCard('ans')).toBe(true);
    expect(isStudioCard('unknown')).toBe(false);
    expect(matchesStudioCard(items[0], 'unknown', now)).toBe(false);
  });
  it('does not broaden a client/owner/stage-scoped dataset', () => {
    const scope = items.filter(i => i.id === 'close');
    expect(scope.filter(i => matchesStudioCard(i, 'soon', now)).map(i => i.id)).toEqual(['close']);
    expect(studioCardCounts(scope, now).approved).toBe(0);
  });
  it('renders keyboard-operable filter buttons, an active state and clear button', () => {
    const html = renderToStaticMarkup(React.createElement(StudioSummaryCards, {
      counts: studioCardCounts(items, now), active: 'soon', onSelect: () => {},
    }));
    expect(html).toContain('data-testid="card-count-soon" aria-pressed="true"');
    expect(html.match(/aria-pressed=/g)).toHaveLength(5);
    expect(html).toContain('button-clear-card-filter');
    expect(html).toContain('Filtering: Close to post date');
    expect(html.match(/<button type="button"/g)).toHaveLength(6);
  });
});

describe('calendar deadline colours', () => {
  it.each([
    [-1, 'overdue'], [0, 'close'], [2, 'close'], [2.01, 'middle'],
    [7, 'middle'], [7.01, 'far'],
  ])('a posting deadline %s days from now is %s', (days, expected) => {
    expect(studioDeadlineTone({ ...base, plannedAt: new Date(now + days * 86400000).toISOString() }, now)).toBe(expected);
  });
  it('uses the production deadline instead of a later post time, including its clock', () => {
    const item = { ...base, plannedAt: '2026-12-01T00:00:00Z', productionDueDate: '2026-10-19', productionDueTime: '11:59' };
    expect(studioDeadlineTone(item, now)).toBe('overdue');
    expect(studioDeadlineTone({ ...item, productionDueTime: '12:01' }, now)).toBe('close');
  });
  it('keeps a date-only deadline due all day in the item timezone', () => {
    const item = { productionDueDate: '2026-10-19', timezone: 'Asia/Kolkata' };
    expect(studioDeadlineTone(item, Date.parse('2026-10-19T18:29:59Z'))).toBe('close');
    expect(studioDeadlineTone(item, Date.parse('2026-10-19T18:30:00Z'))).toBe('overdue');
  });
  it('converts deadline times in a daylight-saving timezone', () => {
    const item = { productionDueDate: '2026-11-02', productionDueTime: '09:00', timezone: 'America/New_York' };
    expect(studioDeadlineTone(item, Date.parse('2026-11-02T13:59:00Z'))).toBe('close');
    expect(studioDeadlineTone(item, Date.parse('2026-11-02T14:01:00Z'))).toBe('overdue');
  });
  it('treats missing/invalid dates as neutral, never overdue', () => {
    expect(studioDeadlineTone({}, now)).toBe('none');
    expect(studioDeadlineTone({ plannedAt: 'bad' }, now)).toBe('none');
    expect(studioDeadlineTone({ productionDueDate: 'bad' }, now)).toBe('none');
  });
  it('chooses the most urgent item for mixed dates, not whichever is first', () => {
    expect(mostUrgentStudioTone([items[0], items[2], items[1]], now)).toBe('overdue');
    expect(mostUrgentStudioTone([items[1], items[0]], now)).toBe('close');
    expect(mostUrgentStudioTone([], now)).toBe('none');
    expect(DEADLINE_TONES.overdue.badge).toContain('bg-red-900');
    expect(DEADLINE_TONES.middle.dot).toBe('bg-orange-500');
  });
  it('renders the colour legend and explanatory deadline text in the real calendar', () => {
    const html = renderToStaticMarkup(React.createElement(StudioCalendar, {
      items: [{ ...items[0], title: 'Sample post', type: 'Post' }],
      month: '2026-10', todayKey: '2026-10-19', onOpen: () => {},
    }));
    expect(html).toContain('calendar-deadline-legend');
    expect(html).toContain('More than 7 days away');
    expect(html).toContain('3–7 days away');
    expect(html).toContain('Within 2 days');
    expect(html).toContain('Past deadline');
    expect(html).toContain('Posting deadline:');
  });
});

describe('filter wiring and desktop/mobile parity', () => {
  const source = path => readFileSync(resolve(__dirname, '../lib', path), 'utf8');
  it('applies the selected card to every view, independently of counts, and persists/clears it', () => {
    const w = source('creativeStudio/StudioWorkspace.jsx');
    expect(w).toContain('scoped.filter(i => matchesStudioCard(i, cardF, now))');
    expect(w).toContain('studioCardCounts(scoped, now)');
    expect(w).toContain('deadlineF, cardF }');
    expect(w).toContain("setCardF('all')");
    const c = source('creativeStudio/StudioSummaryCards.jsx');
    expect(c).toContain("onSelect(pressed ? 'all' : c.key)");
    expect(c).toContain("onSelect('all')");
  });
  it('keeps desktop and mobile components and helpers identical', () => {
    for (const f of ['StudioWorkspace.jsx', 'StudioCalendar.jsx', 'StudioSummaryCards.jsx', 'calendar.js', 'summary.js']) {
      expect(readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/creativeStudio', f), 'utf8'), f).toBe(source(`creativeStudio/${f}`));
    }
  });
});
