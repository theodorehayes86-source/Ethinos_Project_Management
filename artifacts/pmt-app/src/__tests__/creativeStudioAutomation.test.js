import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeAutomation, automationPayload, PHASE_DEFAULTS, scheduleSummary } from '../lib/creativeStudio/StudioControlPanel.jsx';
import { reminderRows, phaseLabel } from '../lib/creativeStudio/StudioReminderLog.jsx';
import { createStudioApi } from '../lib/creativeStudio/core.js';

describe('phase automation config', () => {
  it('fills phases for old configs and deep-merges layers', () => {
    const m = mergeAutomation({ enabled: true, sendTime: '10:00' }, { cadenceDays: 2, final: { escalationDays: 4 } });
    expect(m.reference).toEqual(PHASE_DEFAULTS.reference);
    expect(m.final).toMatchObject({ enabled: true, escalationDays: 4, subject: PHASE_DEFAULTS.final.subject });
    expect(m).toMatchObject({ enabled: true, sendTime: '10:00', cadenceDays: 2 });
  });
  it('uses the specified default copy', () => {
    expect(PHASE_DEFAULTS.reference.escalationDays).toBe(5);
    expect(PHASE_DEFAULTS.final.escalationDays).toBe(2);
    expect(PHASE_DEFAULTS.reference.subject).toBe('Action needed: approve references for {{post}}');
    expect(PHASE_DEFAULTS.final.body).toContain('{{deadline}}');
  });
  it('save payload keeps both phases with coerced numbers', () => {
    const p = automationPayload({ ...mergeAutomation(), cadenceDays: '3', reference: { ...PHASE_DEFAULTS.reference, escalationDays: '6', enabled: false } });
    expect(p.cadenceDays).toBe(3);
    expect(p.reference).toEqual({ ...PHASE_DEFAULTS.reference, escalationDays: 6, enabled: false });
    expect(p.final).toEqual(PHASE_DEFAULTS.final);
  });
  it('summarises the shared schedule', () => {
    expect(scheduleSummary({ sendTime: '09:00', cadenceDays: 1 })).toBe('Daily 9:00 AM until approved');
    expect(scheduleSummary({ sendTime: '14:30', cadenceDays: 2 })).toBe('Every 2 days 2:30 PM until approved');
  });
  it('preview sends the selected phase', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createStudioApi({ base: '/api', getToken: async () => 't' });
    await api.preview('c1', { phase: 'final' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phase: 'final' });
    vi.unstubAllGlobals();
  });
});

describe('reminder log rows', () => {
  it('separates backend upcoming (scheduled) from sent history, never inventing statuses', () => {
    const r = reminderRows({
      upcoming: [{ id: 'u1', itemTitle: 'Diwali teaser', approvalPhase: 'final', scheduledAt: '2026-10-20T03:30:00Z', status: 'scheduled' }],
      deliveries: [{ id: 'd1', approvalPhase: 'reference', itemId: 'abcdef1234', status: 'sent', sentAt: 5, createdAt: 1 }],
    }, { id: 'c', name: 'Kamillosan' });
    expect(r.upcoming[0]).toMatchObject({ status: 'scheduled', upcoming: true, when: '2026-10-20T03:30:00Z', clientName: 'Kamillosan' });
    expect(r.sent[0]).toMatchObject({ status: 'sent', upcoming: false, when: 5 });
    expect(phaseLabel(r.upcoming[0])).toBe('Final approval');
    expect(phaseLabel(r.sent[0])).toBe('Reference approval');
    expect(reminderRows({ deliveries: [] }, { id: 'c', name: 'x' }).upcoming).toEqual([]);
    const src = readFileSync(resolve(__dirname, '../lib/creativeStudio/StudioReminderLog.jsx'), 'utf8');
    expect(src).not.toMatch(/opened/i);
  });
  it('mirrors to mobile', () => {
    for (const f of ['StudioControlPanel.jsx', 'StudioReminderLog.jsx', 'core.js']) {
      const d = readFileSync(resolve(__dirname, '../lib/creativeStudio', f), 'utf8');
      expect(readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/creativeStudio', f), 'utf8'), f).toBe(d);
    }
  });
});
