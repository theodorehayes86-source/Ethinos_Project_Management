import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import UserClientAssignments, { assignedClientNames, AssignedClientList, filterAssignedClients } from '../PMT/UserClientAssignments.jsx';

describe('compact Control Centre client assignments', () => {
  it('keeps many assignments in a bounded summary, not an expanding stack', () => {
    const clients = Array.from({ length: 30 }, (_, i) => `Client ${i + 1}`);
    const html = renderToStaticMarkup(<UserClientAssignments userName="Sample Person" clients={clients} />);
    expect(html).toContain('30 clients');
    expect(html).toContain('Client 1, Client 2 +28 more');
    expect(html).toContain('View 30 assigned clients for Sample Person');
    expect(html).not.toContain('Client 30');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('w-[190px]');
    expect(clients).toHaveLength(30);
  });
  it('handles zero and single-client users', () => {
    expect(renderToStaticMarkup(<UserClientAssignments clients={[]} />)).toContain('None');
    const html = renderToStaticMarkup(<UserClientAssignments userName="Sample" clients={['One client']} />);
    expect(html).toContain('1 client<');
    expect(html).not.toContain('more');
  });
  it('lists every full name in a scrollable list without clipping the names', () => {
    const names = ['A very long client name requiring more space than a table pill', 'Second client'];
    const html = renderToStaticMarkup(<AssignedClientList names={names} query="" />);
    names.forEach(name => expect(html).toContain(name));
    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).not.toContain('truncate');
  });
  it('searches only the supplied assigned clients, without changing the assignments', () => {
    const names = ['North Studio', 'South Studio', 'North Brands'];
    expect(filterAssignedClients(names, ' NORTH ')).toEqual(['North Studio', 'North Brands']);
    expect(filterAssignedClients(names, '')).toEqual(names);
    expect(names).toEqual(['North Studio', 'South Studio', 'North Brands']);
    expect(renderToStaticMarkup(<AssignedClientList names={names} query="missing" />)).toContain('No matching clients.');
  });
  it('safely normalizes absent and duplicate assignments for display only', () => {
    expect(assignedClientNames(undefined)).toEqual([]);
    const clients = [' First ', null, '', 'First', 'Second'];
    expect(assignedClientNames(clients)).toEqual(['First', 'Second']);
    expect(clients[0]).toBe(' First ');
  });
});
