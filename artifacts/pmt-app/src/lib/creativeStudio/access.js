// Navigation is discoverability, not authorization; all data remains API-scoped.
export const STUDIO_CONFIG_CHANGED = 'flow-pro:studio-config-changed';
export function studioCapabilities(bootstrap) {
  const caps = bootstrap.capabilities || {};
  return {
    nav: !!caps.canManageSettings || !!caps.canEdit ||
      (bootstrap.clients || []).some(c => bootstrap.configs?.[c.id]?.enabled === true),
    manage: !!caps.canManageSettings,
    loaded: true,
  };
}

export function watchStudioAccess(api, onChange, target = window) {
  let disposed = false;
  let generation = 0;
  const refresh = async () => {
    const request = ++generation;
    try {
      const data = await api.bootstrap();
      if (!disposed && request === generation) onChange(studioCapabilities(data));
    } catch {
      // Keep a route to the workspace's error/retry surface, never a data grant.
      if (!disposed && request === generation) onChange({ nav: true, manage: false, loaded: true, error: true });
    }
  };
  refresh();
  const timer = setInterval(refresh, 45000);
  target.addEventListener('focus', refresh);
  target.addEventListener(STUDIO_CONFIG_CHANGED, refresh);
  return () => {
    disposed = true;
    clearInterval(timer);
    target.removeEventListener('focus', refresh);
    target.removeEventListener(STUDIO_CONFIG_CHANGED, refresh);
  };
}
