import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import LoginView from './components/LoginView.jsx';
import EmployeeView from './components/EmployeeView.jsx';
import ManagerDashboard from './components/ManagerDashboard.jsx';
import BottomNav from './components/BottomNav.jsx';
import NotificationsPanel from './components/NotificationsPanel.jsx';
import {
  useAppData,
  useMyTasks,
  usePendingApprovals,
  useEmployeeNotifications,
} from './hooks/useFirebaseData.js';
import { Bell, LogOut, Loader2 } from 'lucide-react';

const MANAGEMENT_ROLES = ['Super Admin', 'Director', 'Business Head', 'Snr Manager', 'Manager', 'Project Manager', 'CSM'];

const SYNTHETIC_CLIENTS = [
  { id: '__personal__', name: 'Personal', synthetic: true, isPersonal: true },
  { id: '__ethinos__', name: 'Ethinos Internal', synthetic: true, isEthinos: true },
];

async function generatePkce() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hashed)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

const isAuthRedirectMode = (() => {
  const p = new URLSearchParams(window.location.search);
  return !!(p.get('code') && p.get('state'));
})();

function AuthRedirectHandler() {
  const [status, setStatus] = useState('Processing Microsoft sign-in…');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get('code');
    const state = p.get('state');
    const error = p.get('error');
    const errorDesc = p.get('error_description');

    window.history.replaceState({}, '', window.location.pathname);

    if (error) { setStatus(`Error: ${errorDesc || error}`); return; }

    let verifier, redirectUri;
    try {
      const padded = state.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(padded + '='.repeat((4 - padded.length % 4) % 4)));
      verifier = decoded.v;
      redirectUri = decoded.r;
    } catch { setStatus('Invalid authentication state.'); return; }

    if (!verifier || !redirectUri) { setStatus('Invalid authentication state.'); return; }

    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    (async () => {
      try {
        const res = await fetch(`${apiBase}/auth/ms-code-exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, verifier, redirectUri }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sign-in failed');
        await signInWithCustomToken(auth, data.customToken);
        window.close();
        setTimeout(() => { window.location.replace(window.location.origin + (import.meta.env.BASE_URL || '/mobile/')); }, 1000);
      } catch (err) {
        setStatus(`Sign-in failed: ${err.message}`);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50 p-6">
      <div className="text-center">
        <Loader2 size={36} className="text-indigo-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-600 font-medium text-sm">{status}</p>
      </div>
    </div>
  );
}

function MainApp() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [msLoginStatus, setMsLoginStatus] = useState('');
  const [activeTab, setActiveTab] = useState('my-tasks');
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(false);

  const { users, clients, clientLogs, categories, loading: dataLoading } = useAppData(!authLoading && !!firebaseUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) setCurrentUser(null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const applyToken = (token) => {
      if (!token) return;
      signInWithCustomToken(auth, token).catch(console.error);
    };

    const consumeStoredToken = () => {
      try {
        const raw = localStorage.getItem('pmt_ms_token');
        if (!raw) return;
        localStorage.removeItem('pmt_ms_token');
        const { customToken, ts } = JSON.parse(raw);
        if (customToken && Date.now() - ts < 5 * 60 * 1000) applyToken(customToken);
      } catch {}
    };

    consumeStoredToken();

    const onMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'pmt-ms-token' && e.data.customToken) {
        applyToken(e.data.customToken);
      }
    };

    const onStorage = (e) => {
      if (e.key !== 'pmt_ms_token' || !e.newValue) return;
      consumeStoredToken();
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser || !users.length) return;
    const email = firebaseUser.email?.toLowerCase();
    const found = users.find(u => u.email?.toLowerCase() === email);
    setCurrentUser(found || null);
    setUserLoading(false);
    if (found && MANAGEMENT_ROLES.includes(found.role)) {
      setActiveTab('team');
    }
  }, [firebaseUser, users]);

  const isManager = MANAGEMENT_ROLES.includes(currentUser?.role);

  const allClients = [...SYNTHETIC_CLIENTS, ...clients];

  const myTasks = useMyTasks(currentUser, clientLogs, allClients);
  const pendingApprovals = usePendingApprovals(currentUser, clientLogs, allClients);
  const employeeNotifications = useEmployeeNotifications(currentUser, clientLogs);

  const lastNotifSeenKey = currentUser ? `pmt_notif_seen_${currentUser.id}` : null;
  const [lastNotifSeen, setLastNotifSeen] = useState(0);

  useEffect(() => {
    if (!lastNotifSeenKey) return;
    try { setLastNotifSeen(parseInt(localStorage.getItem(lastNotifSeenKey) || '0')); } catch {}
  }, [lastNotifSeenKey]);

  const newEmployeeNotifs = employeeNotifications.filter(n => (n.qcReviewedAt || 0) > lastNotifSeen);
  const notifications = isManager ? pendingApprovals : employeeNotifications;
  const notifCount = isManager ? pendingApprovals.length : newEmployeeNotifs.length;

  const handleOpenNotifications = () => {
    setShowNotifications(true);
    if (!isManager && lastNotifSeenKey) {
      const now = Date.now();
      setLastNotifSeen(now);
      try { localStorage.setItem(lastNotifSeenKey, String(now)); } catch {}
    }
  };

  const handleLogin = async (email, password) => {
    if (!email.toLowerCase().endsWith('@ethinos.com')) {
      setLoginError('Access is restricted to @ethinos.com accounts.');
      return;
    }
    try {
      setLoginError('');
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setLoginError('Invalid email or password. Please try again.');
    }
  };

  const handleMicrosoftLogin = async () => {
    setLoginError('');
    setMsLoginStatus('Opening Microsoft sign-in…');
    const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;
    const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;

    if (!clientId || !tenantId) {
      setLoginError('Microsoft login is not configured. Please use email/password.');
      setMsLoginStatus('');
      return;
    }

    const redirectUri = window.location.origin + '/';
    const { verifier, challenge } = await generatePkce();

    const statePayload = btoa(JSON.stringify({ v: verifier, r: redirectUri }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid profile email User.Read');
    authUrl.searchParams.set('state', statePayload);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('prompt', 'select_account');

    const popup = window.open(
      authUrl.toString(),
      'pmt-ms-auth',
      'popup,width=520,height=680,menubar=no,toolbar=no,location=yes,resizable=yes',
    );
    if (!popup) {
      setMsLoginStatus('');
      setLoginError('Pop-ups are blocked. Please allow pop-ups for this site and try again.');
      return;
    }
    setMsLoginStatus('Waiting for Microsoft sign-in…');
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-indigo-50">
        <Loader2 size={36} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <LoginView
        onLogin={handleLogin}
        onMicrosoftLogin={handleMicrosoftLogin}
        loginError={loginError}
        msLoginStatus={msLoginStatus}
        onCancelMsLogin={() => setMsLoginStatus('')}
      />
    );
  }

  if (userLoading || (dataLoading && !currentUser)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-50 gap-3">
        <Loader2 size={36} className="text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading your data…</p>
      </div>
    );
  }

  if (firebaseUser && !dataLoading && !currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-50 p-6 text-center">
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full">
          <p className="text-slate-700 font-bold text-base">Account not found</p>
          <p className="text-slate-500 text-sm mt-2">
            No PMT profile found for <strong>{firebaseUser.email}</strong>. Contact your administrator.
          </p>
          <button
            onClick={handleLogout}
            className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold min-h-[44px]"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const initials = (currentUser?.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col min-h-screen max-w-[430px] mx-auto bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 safe-top sticky top-0 z-20">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-sm">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{currentUser?.name}</p>
          <p className="text-[10px] text-slate-400 truncate">{currentUser?.role} · {currentUser?.department}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenNotifications}
            className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <Bell size={20} />
            {notifCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        {(activeTab === 'team' || activeTab === 'approvals') && isManager && (
          <ManagerDashboard
            currentUser={currentUser}
            users={users}
            clients={allClients}
            clientLogs={clientLogs}
            categories={categories}
            pendingApprovals={pendingApprovals}
            activeTab={activeTab}
          />
        )}
        {activeTab === 'my-tasks' && (
          <EmployeeView
            myTasks={myTasks}
            clientLogs={clientLogs}
            currentUser={currentUser}
            clients={allClients}
            categories={categories}
            users={users}
          />
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isManager={isManager}
        approvalCount={pendingApprovals.length}
      />

      {showNotifications && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          isManager={isManager}
          clientLogs={clientLogs}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

export default function App() {
  if (isAuthRedirectMode) return <AuthRedirectHandler />;
  return <MainApp />;
}
