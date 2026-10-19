// Isolated client portal. Mounted by PortalGate BEFORE any staff Firebase
// listeners. Uses only Firebase Auth + the /api/client-portal endpoints; it never
// touches the Realtime Database. Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut,
} from 'firebase/auth';
import {
  CheckCircle, AlertTriangle, LogOut, Loader2, Mail, ShieldCheck, Building2, ArrowRight, Lock,
} from 'lucide-react';
import PortalStudio from '../creativeStudio/PortalStudio.jsx';
import { peekStudioLink, createStudioApi } from '../creativeStudio/core.js';
import { createPortalApi, isRevocationError, portalStudioClients } from './core.js';
import ClientTasks from './ClientTasks.jsx';

const POLL_MS = 30000;

function Shell({ children }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50 text-left font-sans">
      {children}
    </div>
  );
}

export function AuthCard({ title, subtitle, children }) {
  return (
    <Shell>
      <div className="min-h-[100dvh] flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 leading-none">Ethinos Flow Pro</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mt-1">Client Portal</p>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-400';
export const primaryBtn = 'w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors';

function SignIn({ auth, onExitToStaff }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setBusy(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setInfo('If an account exists for that email, a reset link is on its way.');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      if (mode === 'reset') setInfo('If an account exists for that email, a reset link is on its way.');
      else setError('Email or password is incorrect.');
    } finally { setBusy(false); }
  };

  return (
    <AuthCard
      title={mode === 'reset' ? 'Reset your password' : 'Client sign in'}
      subtitle={mode === 'reset' ? 'We will email you a secure reset link.' : 'Use the email address your agency invited.'}
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
          <input data-testid="input-portal-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        </label>
        {mode === 'signin' && (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
            <input data-testid="input-portal-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
          </label>
        )}
        {error && <p data-testid="text-portal-error" className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {info && <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{info}</p>}
        <button data-testid="button-portal-submit" type="submit" disabled={busy} className={primaryBtn}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : mode === 'reset' ? <Mail size={15} /> : <Lock size={15} />}
          {mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs font-semibold">
        <button data-testid="button-portal-toggle-reset" type="button" onClick={() => { setMode(mode === 'reset' ? 'signin' : 'reset'); setError(''); setInfo(''); }} className="text-indigo-600 hover:underline">
          {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
        </button>
        {onExitToStaff && (
          <button data-testid="button-portal-staff" type="button" onClick={onExitToStaff} className="text-slate-400 hover:text-slate-600">
            Ethinos staff sign in
          </button>
        )}
      </div>
    </AuthCard>
  );
}

function VerifyGate({ user, onSignOut, onVerified }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const resend = async () => {
    setBusy('send'); setMsg('');
    try { await sendEmailVerification(user); setMsg('Verification email sent. Check your inbox.'); }
    catch { setMsg('Could not send right now. Please wait a minute and try again.'); }
    finally { setBusy(''); }
  };
  const check = async () => {
    setBusy('check'); setMsg('');
    try {
      await user.reload();
      if (user.emailVerified) {
        await user.getIdToken(true); // refresh claims so the API sees email_verified
        onVerified();
      } else setMsg('Not verified yet. Open the link in the email, then try again.');
    } catch { setMsg('Could not check status. Try again.'); }
    finally { setBusy(''); }
  };
  return (
    <AuthCard title="Verify your email" subtitle={`We need to confirm ${user.email} before showing any work.`}>
      <div className="space-y-3">
        <button data-testid="button-portal-verified" onClick={check} disabled={!!busy} className={primaryBtn}>
          {busy === 'check' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={15} />} I have verified
        </button>
        <button data-testid="button-portal-resend" onClick={resend} disabled={!!busy} className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Resend verification email
        </button>
        {msg && <p className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{msg}</p>}
        <button data-testid="button-portal-signout" onClick={onSignOut} className="w-full text-xs font-semibold text-slate-400 hover:text-slate-600 pt-1">Sign out</button>
      </div>
    </AuthCard>
  );
}

// portalApi / studioApi / onSignOut / initialClientId / initialTaskView / initialTaskId are injected
// only by the dev-only demo wrapper; production never passes them.
export default function ClientPortal({ auth, user, apiBase, onExitToStaff, portalApi, studioApi: injectedStudioApi, onSignOut, initialClientId, initialTaskView, initialTaskId }) {
  const [verified, setVerified] = useState(!!user?.emailVerified);
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [section, setSection] = useState(() => (peekStudioLink() ? 'creative' : 'tasks'));
  const seqRef = useRef(0);
  const initialRef = useRef(initialClientId || null);
  // Creative approvals tab exists only while the authorized Studio bootstrap
  // returns at least one enabled client for this member.
  const [studioAvailable, setStudioAvailable] = useState(null); // null = not yet known
  const studioSeq = useRef(0);
  const studioApi = React.useMemo(() => injectedStudioApi || createStudioApi({
    base: apiBase,
    getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
  }), [auth, apiBase, injectedStudioApi]);

  const api = React.useMemo(() => portalApi || createPortalApi({
    base: apiBase,
    getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
  }), [auth, apiBase, portalApi]);

  const clearPrivate = useCallback(() => { setClients(null); setSelected(null); }, []);

  useEffect(() => { setVerified(!!user?.emailVerified); clearPrivate(); setError(''); }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMe = useCallback(async () => {
    const seq = ++seqRef.current;
    const uid = auth.currentUser?.uid;
    const stale = () => seq !== seqRef.current || auth.currentUser?.uid !== uid;
    try {
      const data = await api.me();
      if (stale()) return;
      const list = Array.isArray(data?.clients) ? data.clients : [];
      setClients(list);
      setError('');
      const wanted = initialRef.current ? list.find(c => String(c.id) === String(initialRef.current)) : null;
      initialRef.current = null; // applies to the first load only
      setSelected(sel => (sel && list.some(c => String(c.id) === String(sel.id)) ? sel : (wanted || (list.length === 1 ? list[0] : null))));
    } catch (err) {
      if (stale()) return;
      clearPrivate();
      setError(isRevocationError(err) ? 'Your portal access is not active. Contact your agency.' : (err?.message || 'Could not load your workspace.'));
    }
  }, [api, auth, clearPrivate]);

  useEffect(() => {
    if (!user || !verified) return undefined;
    loadMe();
    const id = setInterval(loadMe, POLL_MS);
    const onFocus = () => loadMe();
    window.addEventListener('focus', onFocus);
    return () => { seqRef.current += 1; clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [user, verified, loadMe]);

  const checkStudio = useCallback(async () => {
    const seq = ++studioSeq.current;
    const uid = auth.currentUser?.uid;
    const stale = () => seq !== studioSeq.current || auth.currentUser?.uid !== uid;
    try {
      const b = await studioApi.bootstrap();
      if (stale()) return;
      setStudioAvailable(portalStudioClients(b).length > 0);
    } catch (err) {
      if (stale()) return;
      // Revoked or disabled: hide and unmount creative content. Transient errors keep the current state.
      if (err?.status !== 0) setStudioAvailable(false);
    }
  }, [auth, studioApi]);

  useEffect(() => {
    if (studioAvailable === false && section === 'creative') setSection('tasks');
  }, [studioAvailable, section]);

  useEffect(() => {
    setStudioAvailable(null);
    if (!user || !verified) return undefined;
    checkStudio();
    const id = setInterval(checkStudio, POLL_MS);
    const onFocus = () => checkStudio();
    window.addEventListener('focus', onFocus);
    return () => { studioSeq.current += 1; clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [user, verified, checkStudio]);

  const handleRevoked = useCallback(() => { seqRef.current += 1; clearPrivate(); loadMe(); }, [clearPrivate, loadMe]);
  const handleStudioRevoked = useCallback(() => { studioSeq.current += 1; setStudioAvailable(false); setSection('tasks'); checkStudio(); }, [checkStudio]);

  const handleSignOut = async () => {
    seqRef.current += 1; // drop any in-flight /me response
    studioSeq.current += 1;
    setStudioAvailable(false);
    clearPrivate();
    setError('');
    if (onSignOut) { onSignOut(); return; }
    try { await signOut(auth); } catch { /* ignore */ }
  };

  if (!user) return <SignIn auth={auth} onExitToStaff={onExitToStaff} />;
  if (!verified) return <VerifyGate user={user} onSignOut={handleSignOut} onVerified={() => setVerified(true)} />;

  return (
    <Shell>
      <header className="bg-white/70 backdrop-blur border-b border-slate-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center"><ShieldCheck size={16} className="text-white" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900 leading-none">Client Portal</p>
            <p data-testid="text-portal-user" className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
          </div>
          <button data-testid="button-portal-logout" onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4">
        {studioAvailable === true && (
          <div className="flex gap-1 mb-4 p-1 rounded-full bg-white border border-slate-200 w-fit" role="tablist" aria-label="Portal section">
            {[['tasks', 'Tasks'], ['creative', 'Creative approvals']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={section === id} data-testid={`tab-portal-${id}`} onClick={() => setSection(id)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${section === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
            ))}
          </div>
        )}
        {section === 'creative' && studioAvailable === true ? (
          <PortalStudio key={user.uid} auth={auth} apiBase={apiBase} onRevoked={handleStudioRevoked} api={injectedStudioApi} />
        ) : section === 'creative' && studioAvailable === null ? (
          <div className="grid gap-3 mt-2" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-20 rounded-xl bg-white/70 animate-pulse" />)}</div>
        ) : error ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm max-w-md mx-auto mt-10">
            <AlertTriangle size={28} className="text-amber-500 mx-auto mb-2" />
            <p data-testid="text-portal-me-error" className="text-sm font-bold text-slate-800">{error}</p>
            <button onClick={loadMe} className="mt-4 text-xs font-bold text-indigo-600 hover:underline">Try again</button>
          </div>
        ) : clients === null ? (
          <div className="grid gap-3 sm:grid-cols-2 mt-2">{[0, 1].map(i => <div key={i} className="h-20 rounded-xl bg-white/70 animate-pulse" />)}</div>
        ) : selected ? (
          <ClientTasks
            key={selected.id}
            initialView={initialTaskView}
            initialTaskId={String(selected.id) === String(initialClientId) ? initialTaskId : undefined}
            client={selected}
            api={api}
            auth={auth}
            onBack={() => setSelected(null)}
            onRevoked={handleRevoked}
          />
        ) : clients.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm max-w-md mx-auto mt-10">
            <Building2 size={26} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">No workspaces assigned</p>
            <p className="text-xs text-slate-500 mt-1">Your agency has not linked any client accounts to this login yet.</p>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-3">Your workspaces</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clients.map(c => (
                <button key={c.id} data-testid={`card-portal-client-${c.id}`} onClick={() => setSelected(c)} className="group bg-white border border-slate-100 rounded-xl p-4 shadow-sm text-left hover:border-indigo-200 transition-colors flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 font-black text-sm flex items-center justify-center">{(c.name || '?').slice(0, 2).toUpperCase()}</div>
                  <span className="flex-1 text-sm font-bold text-slate-900 truncate">{c.name}</span>
                  <ArrowRight size={15} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}
