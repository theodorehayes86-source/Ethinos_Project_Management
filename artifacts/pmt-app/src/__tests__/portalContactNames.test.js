import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInviteApi, validateNewAccount } from '../lib/clientPortal/core.js';

describe('client contact names', () => {
  const credentials = { password: 'LongPassword12!', confirm: 'LongPassword12!' };
  it('requires both structured name parts for new signup forms', () => {
    expect(validateNewAccount({ ...credentials, firstName: '', lastName: '' })).toMatchObject({ firstName: expect.any(String), lastName: expect.any(String) });
    expect(validateNewAccount({ ...credentials, firstName: 'Alex', lastName: 'Morgan' })).toEqual({});
    expect(validateNewAccount({ ...credentials, firstName: 'A'.repeat(51), lastName: 'Morgan' })).toHaveProperty('firstName');
  });
  it('sends structured names through the invite setup API, but existing-account acceptance stays token-only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) });
    const api = createInviteApi({ fetchImpl });
    await api.accept('token', { firstName: 'Alex', lastName: 'Morgan', password: credentials.password });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ firstName: 'Alex', lastName: 'Morgan' });
    await api.accept('token', {}, 'bearer');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ token: 'token' });
  });
  it('keeps signup and email template surfaces identical on mobile', () => {
    for (const file of ['clientPortal/core.js', 'clientPortal/InviteAccept.jsx', 'creativeStudio/StudioControlPanel.jsx']) {
      expect(readFileSync(new URL(`../../../pmt-mobile/src/lib/${file}`, import.meta.url), 'utf8'))
        .toBe(readFileSync(new URL(`../lib/${file}`, import.meta.url), 'utf8'));
    }
    const signup = readFileSync(new URL('../lib/clientPortal/InviteAccept.jsx', import.meta.url), 'utf8');
    expect(signup).toContain('input-invite-first-name');
    expect(signup).toContain('input-invite-last-name');
    const admin = readFileSync(new URL('../PMT/ClientPortalAdminPanel.jsx', import.meta.url), 'utf8');
    expect(admin).toContain('input-portal-admin-first-name');
    expect(admin).toContain('input-portal-admin-last-name');
    expect(admin).toContain('firstName: editing.firstName.trim()');
  });
});
