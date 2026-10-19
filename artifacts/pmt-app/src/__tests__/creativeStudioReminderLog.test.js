import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reminderLogClients, canSeeReminderLog, peopleIndex, DELIVERY_KIND } from '../lib/creativeStudio/StudioReminderLog.jsx';
import * as panel from '../lib/creativeStudio/StudioControlPanel.jsx';

const boot = {
  clients: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }],
  configs: { a: { enabled: true }, b: { enabled: true }, c: { enabled: false } },
  capabilities: { manageableClientIds: ['a', 'c', 'zz'] },
  staffCandidates: [{ id: 'u1', name: 'Asha' }],
};

describe('reminder log scoping', () => {
  it('intersects enabled, accessible and manageable clients', () => {
    expect(reminderLogClients(boot).map(c => c.id)).toEqual(['a']);
  });
  it('honours the client filter and never widens it', () => {
    expect(reminderLogClients(boot, 'a').map(c => c.id)).toEqual(['a']);
    expect(reminderLogClients(boot, 'b')).toEqual([]);
    expect(reminderLogClients(boot, 'zz')).toEqual([]);
  });
  it('hides the tab without manageable enabled clients', () => {
    expect(canSeeReminderLog(boot)).toBe(true);
    expect(canSeeReminderLog({ ...boot, capabilities: { manageableClientIds: ['b'] }, configs: { b: { enabled: false } } })).toBe(false);
    expect(canSeeReminderLog({ ...boot, capabilities: {} })).toBe(false);
  });
  it('keeps Control Center helper exports compatible', () => {
    expect(panel.peopleIndex).toBe(peopleIndex);
    expect(panel.DELIVERY_KIND).toBe(DELIVERY_KIND);
    expect(peopleIndex(boot).get('u1')).toBe('Asha');
  });
  it('Control Center no longer fetches or renders the log; workspace does', () => {
    const src = (f) => readFileSync(resolve(__dirname, '../lib/creativeStudio', f), 'utf8');
    expect(src('StudioControlPanel.jsx')).not.toMatch(/api\.deliveries|table-deliveries/);
    expect(src('StudioWorkspace.jsx')).toMatch(/StudioReminderLog/);
    expect(src('StudioReminderLog.jsx')).toMatch(/s !== seq\.current/);
  });
  it('is mirrored to pmt-mobile', () => {
    for (const f of ['StudioReminderLog.jsx', 'StudioWorkspace.jsx', 'StudioControlPanel.jsx']) {
      const d = readFileSync(resolve(__dirname, '../lib/creativeStudio', f), 'utf8');
      const m = readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/creativeStudio', f), 'utf8');
      expect(m, f).toBe(d);
    }
  });
});
