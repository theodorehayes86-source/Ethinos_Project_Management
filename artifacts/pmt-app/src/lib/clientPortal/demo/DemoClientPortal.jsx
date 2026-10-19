// DEV-ONLY: real ClientPortal + PortalStudio rendered against an in-memory model.
// Loaded lazily by PortalGate only when import.meta.env.DEV and ?clientDemo=1.
import React, { useMemo, useState } from 'react';
import { FlaskConical, RotateCcw, LogOut } from 'lucide-react';
import ClientPortal from '../ClientPortal.jsx';
import { createDemoStore, demoAuth } from './demoModel.js';
import StudioCalendarDemo from './StudioCalendarDemo.jsx';

export function exitDemoUrl(href) {
  const url = new URL(href);
  url.searchParams.delete('clientDemo');
  url.searchParams.delete('client');
  url.searchParams.delete('demoTaskClient');
  url.searchParams.delete('demoTaskView');
  url.searchParams.delete('demoTaskId');
  url.searchParams.delete('demoStudioCalendar');
  return url.pathname + url.search;
}

/** Optional DEV screenshot helpers: ?demoTaskClient=<id>&demoTaskView=calendar|list&demoTaskId=t1. */
export function demoInitialProps(search) {
  const q = new URLSearchParams(search || '');
  const client = q.get('demoTaskClient');
  const view = q.get('demoTaskView');
  const task = q.get('demoTaskId');
  return {
    studioCalendar: q.get('demoStudioCalendar') === '1',
    initialTaskId: task && /^t\d+$/.test(task) ? task : undefined,
    initialClientId: client && /^demo-[a-z]+$/.test(client) ? client : undefined,
    initialTaskView: view === 'calendar' || view === 'list' ? view : undefined,
  };
}

export default function DemoClientPortal() {
  const initial = useMemo(() => demoInitialProps(window.location.search), []);
  const { studioCalendar, ...portalProps } = initial;
  const store = useMemo(() => createDemoStore(), []);
  const auth = useMemo(() => demoAuth(), []);
  const [gen, setGen] = useState(0);
  // Leaving the demo is a navigation back to the normal app, never a Firebase sign-out.
  const exit = () => window.location.assign(exitDemoUrl(window.location.href));
  const reset = () => { store.reset(); setGen(g => g + 1); };
  return (
    <div className="pb-36 sm:pb-20">
      {studioCalendar ? <StudioCalendarDemo key={gen} /> : <ClientPortal key={gen} auth={auth} user={auth.currentUser} apiBase="" portalApi={store.portalApi} studioApi={store.studioApi} onSignOut={exit} {...portalProps} />}
      <div data-testid="banner-client-demo" role="status" className="fixed bottom-0 inset-x-0 z-30 bg-amber-50 border-t border-amber-200 px-4 py-2.5 flex flex-wrap items-center gap-3 text-left">
        <FlaskConical size={15} className="text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800 flex-1 min-w-[200px]"><b>Test Client</b> · Demo data only. Changes stay in this browser tab and nothing is sent or saved.</p>
        <button data-testid="button-client-demo-reset" onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-xs font-semibold text-amber-800 hover:bg-amber-100"><RotateCcw size={12} /> Reset data</button>
        <button data-testid="button-client-demo-exit" onClick={exit} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"><LogOut size={12} /> Exit Test Mode</button>
      </div>
    </div>
  );
}
