import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseInviteFragment, captureInviteToken, clearInviteToken, createInviteApi, createPortalApi,
  validateNewAccount, inviteErrorMessage, inviteStatus, portalStudioClients,
} from '../lib/clientPortal/core.js';

const TOKEN = 'abcDEF0123456789_-.~xyz';
const fakeWin = (href) => {
  const u = new URL(href);
  const win = {
    location: { href: u.href, hash: u.hash, search: u.search },
    history: { replaceState: vi.fn((_, __, next) => { const n = new URL(next, u.origin); win.location = { href: n.href, hash: n.hash, search: n.search }; }) },
  };
  return win;
};

describe('invite fragment handling', () => {
  beforeEach(() => clearInviteToken());
  it('parses only well-formed invite tokens', () => {
    expect(parseInviteFragment(`#invite=${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteFragment('#invite=short')).toBeNull();
    expect(parseInviteFragment('#invite=<script>alert(1)</script>xxxxxxxx')).toBeNull();
    expect(parseInviteFragment('')).toBeNull();
  });
  it('captures, strips the fragment, keeps ?client=1 and is idempotent', () => {
    const win = fakeWin(`https://app.test/?client=1#invite=${TOKEN}`);
    expect(captureInviteToken(win)).toBe(TOKEN);
    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/?client=1');
    expect(win.location.hash).toBe('');
    expect(captureInviteToken(win)).toBe(TOKEN); // second render (StrictMode) still sees it
    clearInviteToken();
    expect(captureInviteToken(win)).toBeNull();
  });
  it('adds client=1 when the link lacks it', () => {
    const win = fakeWin(`https://app.test/#invite=${TOKEN}`);
    captureInviteToken(win);
    expect(win.history.replaceState.mock.calls[0][2]).toBe('/?client=1');
  });
  it('never persists or logs the token', () => {
    const src = readFileSync(resolve(__dirname, '../lib/clientPortal/core.js'), 'utf8');
    const block = src.slice(src.indexOf('Single-link onboarding'));
    expect(block).not.toMatch(/localStorage|sessionStorage|console\./);
    const ui = readFileSync(resolve(__dirname, '../lib/clientPortal/InviteAccept.jsx'), 'utf8');
    expect(ui).not.toMatch(/localStorage|sessionStorage|console\.|sendPasswordResetEmail|updatePassword/);
  });
});

describe('invite API', () => {
  it('inspect is unauthenticated; accept sends name/password or a bearer', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ accepted: true }) }));
    const api = createInviteApi({ base: '/api', fetchImpl });
    await api.inspect(TOKEN);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/client-portal/invitations/inspect');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ token: TOKEN });
    await api.accept(TOKEN, { displayName: 'Meera', password: 'x'.repeat(12) });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ token: TOKEN, displayName: 'Meera', password: 'x'.repeat(12) });
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBeUndefined();
    await api.accept(TOKEN, {}, 'idtok');
    expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBe('Bearer idtok');
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({ token: TOKEN });
  });
  it('maps errors with status', async () => {
    const api = createInviteApi({ base: '/api', fetchImpl: async () => ({ ok: false, status: 410, json: async () => ({}) }) });
    const err = await api.inspect(TOKEN).catch(e => e);
    expect(err.status).toBe(410);
    expect(inviteErrorMessage(err)).toMatch(/expired/);
    expect(inviteErrorMessage({ status: 404 })).toMatch(/revoked/);
  });
  it('admin revoke hits the revoke endpoint', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const api = createPortalApi({ base: '/api', getToken: async () => 't', fetchImpl });
    await api.adminRevokeInvite('u 1');
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/client-portal/admin/users/u%201/invite/revoke');
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
  });
});

describe('account and status helpers', () => {
  it('validates new accounts', () => {
    expect(validateNewAccount({ displayName: '', password: 'short', confirm: 'x' })).toMatchObject({ displayName: expect.any(String), password: expect.any(String), confirm: expect.any(String) });
    expect(validateNewAccount({ displayName: 'A', password: 'a'.repeat(12), confirm: 'a'.repeat(12) })).toEqual({});
  });
  it('derives invite statuses', () => {
    expect(inviteStatus({ invitationStatus: 'pending', invitationExpiresAt: 10 }, 20)).toBe('expired');
    expect(inviteStatus({ invitationStatus: 'pending', invitationExpiresAt: 30 }, 20)).toBe('pending');
    expect(inviteStatus({ invitationStatus: 'revoked' })).toBe('revoked');
    expect(inviteStatus({})).toBeNull();
  });
  it('studio tab needs at least one enabled client', () => {
    expect(portalStudioClients({ clients: [] })).toEqual([]);
    expect(portalStudioClients({ clients: [{ id: 'a' }], configs: { a: { enabled: false } } })).toEqual([]);
    expect(portalStudioClients({ clients: [{ id: 'a' }] })).toEqual([]);
    expect(portalStudioClients({ clients: [{ id: 'a' }], configs: { a: { enabled: true } } })).toHaveLength(1);
    expect(portalStudioClients(null)).toEqual([]);
  });
});

describe('wiring and parity', () => {
  const src = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
  it('gate renders the invite flow before staff/portal routing', () => {
    const g = src('lib/clientPortal/PortalGate.jsx');
    expect(g.indexOf('if (inviteToken)')).toBeLessThan(g.indexOf('const portalMode'));
    expect(g).toMatch(/useState\(\(\) => captureInviteToken\(\)\)/);
  });
  it('portal hides Creative approvals until studio bootstrap allows it', () => {
    const p = src('lib/clientPortal/ClientPortal.jsx');
    expect(p).toMatch(/studioAvailable === true && \(/);
    expect(p).toMatch(/studioAvailable === false && section === 'creative'\) setSection\('tasks'\)/);
  });
  it('admin panel exposes revoke and invite status', () => {
    const a = src('PMT/ClientPortalAdminPanel.jsx');
    expect(a).toMatch(/adminRevokeInvite/);
    expect(a).toMatch(/inviteStatus\(u\)/);
  });
  it('clientPortal files are mirrored to pmt-mobile', () => {
    const dir = resolve(__dirname, '../lib/clientPortal');
    for (const f of readdirSync(dir).filter(f => /\.(jsx?|tsx?)$/.test(f))) {
      expect(readFileSync(resolve(__dirname, '../../../pmt-mobile/src/lib/clientPortal', f), 'utf8'), f).toBe(readFileSync(resolve(dir, f), 'utf8'));
    }
  });
});

describe('invite flow branches', () => {
  const ui = readFileSync(resolve(__dirname, '../lib/clientPortal/InviteAccept.jsx'), 'utf8');
  it('only skips password setup for existing identities', () => {
    expect(ui).toMatch(/if \(user && info\.requiresSignIn\)/);
  });
  it('keeps an account-ready card instead of dismissing after failed auto sign-in', () => {
    const create = ui.slice(ui.indexOf('const createAccount'), ui.indexOf('const signInExisting'));
    expect(create).toMatch(/setAccountReady\(true\)/);
    expect(create).not.toMatch(/onDismiss/);
    const card = ui.slice(ui.indexOf('if (accountReady)'), ui.indexOf('if (loadError)'));
    expect(card).toMatch(/button-invite-go-signin/);
    expect(card).not.toMatch(/accept\(/);
  });
});
