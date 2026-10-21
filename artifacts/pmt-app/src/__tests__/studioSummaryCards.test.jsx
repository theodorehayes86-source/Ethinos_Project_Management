import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DesktopCards from '../lib/creativeStudio/StudioSummaryCards.jsx';
import MobileCards from '../../../pmt-mobile/src/lib/creativeStudio/StudioSummaryCards.jsx';
import { STUDIO_CARDS } from '../lib/creativeStudio/summary.js';

function buttons(element) {
  if (!React.isValidElement(element)) return [];
  if (element.type === 'button') return [element];
  return React.Children.toArray(element.props.children).flatMap(buttons);
}

describe.each([['desktop', DesktopCards], ['mobile', MobileCards]])('%s compact Studio filters', (_, Cards) => {
  it('connects all five clicks to the existing filter keys', () => {
    const onSelect = vi.fn();
    const controls = buttons(Cards({ counts: {}, active: 'all', onSelect }));
    expect(controls).toHaveLength(5);
    STUDIO_CARDS.forEach((card, index) => {
      expect(controls[index].props['data-testid']).toBe(`card-count-${card.key}`);
      expect(controls[index].props['aria-pressed']).toBe(false);
      controls[index].props.onClick();
      expect(onSelect).toHaveBeenLastCalledWith(card.key);
    });
  });
  it.each(STUDIO_CARDS.map(card => [card.key]))('clears %s when tapping the active count again or Clear filter', active => {
    const onSelect = vi.fn();
    const controls = buttons(Cards({ counts: {}, active, onSelect }));
    const selected = controls.find(button => button.props['aria-pressed']);
    expect(selected.props['data-testid']).toBe(`card-count-${active}`);
    selected.props.onClick();
    expect(onSelect).toHaveBeenLastCalledWith('all');
    onSelect.mockClear();
    controls.find(button => button.props['data-testid'] === 'button-clear-card-filter').props.onClick();
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('all');
  });
  it('keeps the approved labels, live counts, full accessible names and overdue warning', () => {
    const html = renderToStaticMarkup(<Cards counts={{ approved: 24, wip: 103, atRisk: 12, scheduled: 9, approvedNotScheduled: 15, overdue: 3 }} active="soon" onSelect={() => {}} />);
    for (const text of ['Approved', 'In progress', 'At risk', 'Scheduled', 'To schedule']) expect(html).toContain(text);
    expect(html).toContain('aria-label="WIP / Awaiting approval: 103"');
    expect(html).toContain('aria-label="Approved, not scheduled: 15"');
    expect(html).toContain('title="Approved, not scheduled"');
    expect(html.replace(/<!--.*?-->/g, '')).toContain('3 overdue');
    expect(html).toContain('Filtering: Close to post date');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
  it('supports empty and missing counts without losing the filter buttons', () => {
    const html = renderToStaticMarkup(<Cards onSelect={() => {}} />);
    expect(html.match(/aria-label="[^"]+: 0"/g)).toHaveLength(5);
    expect(html).not.toContain('button-clear-card-filter');
    expect(html).toContain('Tap a status to filter');
  });
});
