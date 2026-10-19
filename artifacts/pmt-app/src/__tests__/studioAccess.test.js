import { afterEach, describe, expect, it, vi } from 'vitest';
import { STUDIO_CONFIG_CHANGED, studioCapabilities, watchStudioAccess } from '../lib/creativeStudio/access.js';

afterEach(() => vi.useRealTimers());
const boot = (manage, enabled = false) => ({
  capabilities: { canManageSettings: manage, canEdit: enabled },
  clients: [{ id: 'a' }], configs: { a: { enabled } },
});
describe('Studio navigation access', () => {
  it('keeps settings managers visible with zero enabled clients', () => {
    expect(studioCapabilities(boot(true))).toMatchObject({ nav: true, manage: true });
    expect(studioCapabilities(boot(false))).toMatchObject({ nav: false, manage: false });
  });
  it('refreshes on save, focus and polling, including revocation', async () => {
    vi.useFakeTimers();
    const target = new EventTarget(), changed = vi.fn();
    const api = { bootstrap: vi.fn().mockResolvedValue(boot(false)) };
    const stop = watchStudioAccess(api, changed, target);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith(studioCapabilities(boot(false)));
    api.bootstrap.mockResolvedValue(boot(true, true));
    target.dispatchEvent(new Event(STUDIO_CONFIG_CHANGED));
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith(studioCapabilities(boot(true, true)));
    api.bootstrap.mockResolvedValue(boot(true, false));
    target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith(studioCapabilities(boot(true, false)));
    api.bootstrap.mockResolvedValue(boot(false));
    await vi.advanceTimersByTimeAsync(45000);
    expect(changed).toHaveBeenLastCalledWith(studioCapabilities(boot(false)));
    stop();
    const calls = api.bootstrap.mock.calls.length;
    target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(45000);
    expect(api.bootstrap).toHaveBeenCalledTimes(calls);
  });
  it('retains a retry surface on errors without granting settings access', async () => {
    vi.useFakeTimers();
    const api = { bootstrap: vi.fn().mockRejectedValue(new Error('offline')) }, changed = vi.fn();
    const target = new EventTarget();
    const stop = watchStudioAccess(api, changed, target);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith({ nav: true, manage: false, loaded: true, error: true });
    api.bootstrap.mockResolvedValue(boot(true));
    target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith(studioCapabilities(boot(true)));
    stop();
  });
  it('ignores stale requests and responses after sign-out cleanup', async () => {
    vi.useFakeTimers();
    let resolve;
    const api = { bootstrap: vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(boot(false)) };
    const changed = vi.fn(), target = new EventTarget();
    const stop = watchStudioAccess(api, changed, target);
    target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    resolve(boot(true));
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(studioCapabilities(boot(false)));
    stop();
  });
});
