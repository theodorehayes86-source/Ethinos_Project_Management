import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ClientSelect from '../lib/creativeStudio/ClientSelect.jsx';

describe('Studio client dropdown', () => {
  it('labels the dropdown and shows only supplied authorized clients', () => {
    const html = renderToStaticMarkup(<ClientSelect clients={[{ id: 'a', name: 'Client A' }]} value="a" onChange={() => {}} />);
    expect(html).toContain('aria-label="Select client"');
    expect(html).toContain('All clients');
    expect(html).toContain('value="a" selected=""');
    expect(html).toContain('Client A');
    expect(html).not.toContain('disabled=""');
  });
  it('keeps a visible disabled selector when there are no enabled clients', () => {
    const html = renderToStaticMarkup(<ClientSelect clients={[]} value="removed" onChange={() => {}} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('No enabled clients');
    expect(html).toContain('value="all" selected=""');
  });
  it('uses identical components on desktop and mobile', () => {
    const desktop = readFileSync(new URL('../lib/creativeStudio/ClientSelect.jsx', import.meta.url), 'utf8');
    const mobile = readFileSync(new URL('../../../pmt-mobile/src/lib/creativeStudio/ClientSelect.jsx', import.meta.url), 'utf8');
    expect(desktop).toBe(mobile);
  });
});
