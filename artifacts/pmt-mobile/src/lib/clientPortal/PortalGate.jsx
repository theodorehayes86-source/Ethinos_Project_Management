// Decides between the isolated client portal and the staff app BEFORE the staff
// app (and its Firebase Realtime Database listeners) is mounted.
// Duplicated in pmt-mobile; keep in sync.
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import ClientPortal from './ClientPortal.jsx';
import InviteAccept from './InviteAccept.jsx';
import { isClientAccount, wantsClientEntry, captureInviteToken, clearInviteToken, wantsClientDemo } from './core.js';

// DEV-ONLY client demo. In production import.meta.env.DEV is statically false,
// so this branch and the demo chunk are removed and ?clientDemo=1 is ignored.
const DemoClientPortal = import.meta.env.DEV ? lazy(() => import('./demo/DemoClientPortal.jsx')) : null;
import { captureStudioLink } from '../creativeStudio/core.js';

const Spinner = () => (
  <div className="min-h-[100dvh] flex items-center justify-center bg-indigo-50">
    <Loader2 size={32} className="text-indigo-500 animate-spin" />
  </div>
);

export default function PortalGate({ auth, apiBase, StaffApp, bypass = false }) {
  // Preserve Creative Studio email deep links across sign-in redirects.
  useState(() => captureStudioLink());
  // Invite token: captured from #invite= before any routing, held in memory only.
  const [inviteToken, setInviteToken] = useState(() => captureInviteToken());
  // An active invitation always wins over the demo.
  const [demo] = useState(() => !!DemoClientPortal && !inviteToken && wantsClientDemo(window.location.search));
  const [state, setState] = useState({ ready: false, user: null });
  const [clientEntry, setClientEntry] = useState(() => wantsClientEntry(window.location.search));

  useEffect(() => {
    if (demo || (bypass && !inviteToken)) return undefined;
    return onAuthStateChanged(auth, (user) => {
      // After a client signs out, stay on the client sign-in screen.
      if (isClientAccount(user)) setClientEntry(true);
      setState({ ready: true, user });
    });
  }, [auth, bypass, inviteToken, demo]);

  if (demo) return <Suspense fallback={<Spinner />}><DemoClientPortal /></Suspense>;

  if (bypass && !inviteToken) return <Suspense fallback={<Spinner />}><StaffApp /></Suspense>;
  if (!state.ready) return <Spinner />;

  if (inviteToken) {
    // Stays mounted through sign-in/sign-out; the staff app is never exposed meanwhile.
    return (
      <InviteAccept
        auth={auth}
        user={state.user}
        apiBase={apiBase}
        token={inviteToken}
        onAccepted={() => { clearInviteToken(); setInviteToken(null); setClientEntry(true); }}
        onDismiss={() => { clearInviteToken(); setInviteToken(null); setClientEntry(true); }}
      />
    );
  }

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
