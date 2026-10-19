import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPortalApi } from '../lib/clientPortal/core.js';

describe('permanent portal account deletion', () => {
  it('uses the authenticated DELETE endpoint, not disable', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) });
    const api = createPortalApi({ base: '/api', getToken: async () => 'test', fetchImpl: fetchFn });
    expect(await api.adminDeleteUser('client-a')).toEqual({ deleted: true });
    expect(fetchFn).toHaveBeenCalledWith('/api/client-portal/admin/users/client-a',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer test' }) }));
  });
  it('requires destructive confirmation and keeps disable separate', () => {
    const panel = readFileSync(new URL('../PMT/ClientPortalAdminPanel.jsx', import.meta.url), 'utf8');
    expect(panel).toContain('if (!window.confirm(`Permanently delete');
    expect(panel).toContain('This cannot be undone.');
    expect(panel).toContain('creative work will not be deleted.');
    expect(panel).toContain('api.adminDeleteUser(user.uid)');
    expect(panel).toContain('button-portal-user-toggle-');
    expect(panel).toContain('button-portal-user-delete-');
  });
  it('mirrors the API in mobile', () => {
    const desktop = readFileSync(new URL('../lib/clientPortal/core.js', import.meta.url), 'utf8');
    const mobile = readFileSync(new URL('../../../pmt-mobile/src/lib/clientPortal/core.js', import.meta.url), 'utf8');
    expect(mobile).toBe(desktop);
  });
});
