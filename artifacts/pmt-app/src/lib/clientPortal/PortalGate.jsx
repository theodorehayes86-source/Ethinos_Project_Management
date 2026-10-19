// Decides between the isolated client portal and the staff app BEFORE the staff
// app (and its Firebase Realtime Database listeners) is mounted.
// Duplicated in pmt-mobile; keep in sync.
import React, { Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import ClientPortal from './ClientPortal.jsx';
import { isClientAccount, wantsClientEntry } from './core.js';
import { captureStudioLink } from '../creativeStudio/core.js';

const Spinner = () => (
  <div className="min-h-[100dvh] flex items-center justify-center bg-indigo-50">
    <Loader2 size={32} className="text-indigo-500 animate-spin" />
  </div>
);

export default function PortalGate({ auth, apiBase, StaffApp, bypass = false }) {
  // Preserve Creative Studio email deep links across sign-in redirects.
  useState(() => captureStudioLink());
  const [state, setState] = useState({ ready: false, user: null });
  const [clientEntry, setClientEntry] = useState(() => wantsClientEntry(window.location.search));

  useEffect(() => {
    if (bypass) return undefined;
    return onAuthStateChanged(auth, (user) => {
      // After a client signs out, stay on the client sign-in screen.
      if (isClientAccount(user)) setClientEntry(true);
      setState({ ready: true, user });
    });
  }, [auth, bypass]);

  if (bypass) return <Suspense fallback={<Spinner />}><StaffApp /></Suspense>;
  if (!state.ready) return <Spinner />;

  const portalMode = isClientAccount(state.user) || (!state.user && clientEntry);
  if (portalMode) {
    return (
      <ClientPortal
        auth={auth}
        user={state.user}
        apiBase={apiBase}
        onExitToStaff={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('client');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          setClientEntry(false);
        }}
      />
    );
  }
  return <Suspense fallback={<Spinner />}><StaffApp /></Suspense>;
}
