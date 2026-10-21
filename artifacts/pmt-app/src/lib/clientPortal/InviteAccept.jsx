// Single-link client onboarding. Mounted by PortalGate whenever an invite token
// is held in memory, and kept mounted across Firebase auth changes until the
// invitation is accepted or dismissed. The staff app is never rendered here.
// Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { Loader2, Lock, LogOut, UserPlus, AlertTriangle, CheckCircle, Building2 } from 'lucide-react';
import { AuthCard, inputCls, primaryBtn } from './ClientPortal.jsx';
import { createInviteApi, inviteErrorMessage, validateNewAccount, MIN_PASSWORD } from './core.js';

const fmtDate = (ms) => (ms ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : '');
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function FieldRow({ label, error, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {error && <span className="block text-[11px] font-semibold text-red-600">{error}</span>}
    </label>
  );
}
const ErrorNote = ({ children, testid = 'text-invite-error' }) => (
  <p data-testid={testid} role="alert" className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{children}</p>
);

export default function InviteAccept({ auth, user, apiBase, token, onAccepted, onDismiss }) {
  const api = useMemo(() => createInviteApi({ base: apiBase }), [apiBase]);
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [accountReady, setAccountReady] = useState(false); // accepted, but auto sign-in failed
  const seq = useRef(0);

  const inspect = useCallback(async () => {
    const s = ++seq.current;
    setLoadError(''); setInfo(null);
    try {
      const d = await api.inspect(token);
      if (s === seq.current) { setInfo(d); setFirstName(d.firstName || ''); setLastName(d.lastName || ''); }
    } catch (e) { if (s === seq.current) setLoadError(inviteErrorMessage(e)); }
  }, [api, token]);
  useEffect(() => { inspect(); return () => { seq.current += 1; }; }, [inspect]);

  const finish = useCallback(async () => {
    // Pick up the server-side email verification before the portal mounts.
    try { await auth.currentUser?.reload(); await auth.currentUser?.getIdToken(true); } catch { /* portal re-checks */ }
    onAccepted();
  }, [auth, onAccepted]);

  const acceptSignedIn = useCallback(async () => {
    setBusy('accept'); setError('');
    try {
      const bearer = await auth.currentUser.getIdToken();
      await api.accept(token, {}, bearer);
      await finish();
    } catch (e) { setError(inviteErrorMessage(e)); } finally { setBusy(''); }
  }, [api, auth, token, finish]);

  const createAccount = async (e) => {
    e.preventDefault();
    const errs = validateNewAccount({ firstName, lastName, password, confirm });
    setFieldErrors(errs); setError('');
    if (Object.keys(errs).length) return;
    setBusy('create');
    try {
      await api.accept(token, { firstName: firstName.trim(), lastName: lastName.trim(), password });
      try { await signInWithEmailAndPassword(auth, info.email, password); }
      catch { setPassword(''); setConfirm(''); setBusy(''); setAccountReady(true); return; }
      await finish();
    } catch (err) { setError(inviteErrorMessage(err)); setBusy(''); }
  };

  const signInExisting = async (e) => {
    e.preventDefault();
    setError('');
    if (!password) { setFieldErrors({ password: 'Enter your password.' }); return; }
    setFieldErrors({}); setBusy('signin');
    try {
      const cred = await signInWithEmailAndPassword(auth, info.email, password);
      setPassword('');
      const bearer = await cred.user.getIdToken();
      await api.accept(token, {}, bearer);
      await finish();
    } catch (err) {
      setError(err?.code ? 'Email or password is incorrect.' : inviteErrorMessage(err));
    } finally { setBusy(''); }
  };

  const switchAccount = async () => {
    setBusy('signout');
    try { await signOut(auth); } catch { /* ignore */ } finally { setBusy(''); }
  };

  if (accountReady) {
    // The invite is consumed; never retry accept from here.
    return (
      <AuthCard title="Your account is ready" subtitle="We could not sign you in automatically.">
        <div className="space-y-3">
          <p data-testid="text-invite-account-ready" className="text-sm text-slate-600">Your client account for <b className="text-slate-900">{info?.email}</b> has been created. Sign in with the password you just set.</p>
          <button data-testid="button-invite-go-signin" onClick={onDismiss} className={primaryBtn}><Lock size={15} /> Client sign in</button>
        </div>
      </AuthCard>
    );
  }
  if (loadError) {
    return (
      <AuthCard title="Invitation unavailable" subtitle="We could not open this invitation.">
        <div className="space-y-3">
          <ErrorNote testid="text-invite-load-error">{loadError}</ErrorNote>
          <button data-testid="button-invite-retry" onClick={inspect} className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">Try again</button>
          <button data-testid="button-invite-dismiss" onClick={onDismiss} className="w-full text-xs font-semibold text-indigo-600 hover:underline">Go to client sign in</button>
        </div>
      </AuthCard>
    );
  }
  if (!info) {
    return (
      <AuthCard title="Opening your invitation" subtitle="Checking the link.">
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      </AuthCard>
    );
  }

  const header = (
    <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Invited to</p>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {(info.clientNames || []).length === 0 ? <span className="text-xs text-slate-600">Your agency workspace</span> :
          info.clientNames.map(n => <span key={n} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-full px-2 py-0.5"><Building2 size={11} className="text-indigo-500" />{n}</span>)}
      </div>
      {info.expiresAt ? <p className="text-[11px] text-slate-500 mt-1.5">Link valid until {fmtDate(info.expiresAt)}</p> : null}
    </div>
  );

  // Signed in as someone else: never accept on their behalf.
  if (user && !same(user.email, info.email)) {
    return (
      <AuthCard title="Wrong account" subtitle="This invitation is for a different email address.">
        {header}
        <div className="space-y-3">
          <p data-testid="text-invite-mismatch" className="text-sm text-slate-600">You are signed in as <b className="text-slate-900">{user.email}</b>. The invitation was sent to <b className="text-slate-900">{info.email}</b>. Sign out to continue.</p>
          <button data-testid="button-invite-signout" disabled={!!busy} onClick={switchAccount} className={primaryBtn}>
            {busy === 'signout' ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={15} />} Sign out and continue
          </button>
          <button data-testid="button-invite-dismiss" onClick={onDismiss} className="w-full text-xs font-semibold text-slate-400 hover:text-slate-600">Not now</button>
        </div>
      </AuthCard>
    );
  }

  // Existing identity signed in as the invited email: just accept.
  // New identities (requiresSignIn false) always set name/password via the form below.
  if (user && info.requiresSignIn) {
    return (
      <AuthCard title="Accept invitation" subtitle={`Signed in as ${user.email}.`}>
        {header}
        <div className="space-y-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          <button data-testid="button-invite-accept" disabled={!!busy} onClick={acceptSignedIn} className={primaryBtn}>
            {busy === 'accept' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={15} />} Accept and open portal
          </button>
          <button data-testid="button-invite-signout" disabled={!!busy} onClick={switchAccount} className="w-full text-xs font-semibold text-slate-400 hover:text-slate-600">Use a different account</button>
        </div>
      </AuthCard>
    );
  }

  const emailField = (
    <FieldRow label="Email">
      <input data-testid="input-invite-email" type="email" value={info.email} readOnly aria-readonly="true" className={`${inputCls} text-slate-500 cursor-not-allowed`} />
    </FieldRow>
  );

  if (info.requiresSignIn) {
    return (
      <AuthCard title="Sign in to accept" subtitle="You already have an account with this email. Sign in with your existing password to join.">
        {header}
        <form onSubmit={signInExisting} className="space-y-3">
          {emailField}
          <FieldRow label="Password" error={fieldErrors.password}>
            <input data-testid="input-invite-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
          </FieldRow>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button data-testid="button-invite-signin" type="submit" disabled={!!busy} className={primaryBtn}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />} Sign in and accept
          </button>
          <p className="text-[11px] text-slate-400">Accepting does not change your password.</p>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your client account" subtitle="Set up access to the work your agency shares with you.">
      {header}
      <form onSubmit={createAccount} className="space-y-3" noValidate>
        {emailField}
        <FieldRow label="First name" error={fieldErrors.firstName}>
          <input data-testid="input-invite-first-name" autoComplete="given-name" value={firstName} maxLength={50} onChange={e => setFirstName(e.target.value)} className={inputCls} />
        </FieldRow>
        <FieldRow label="Last name" error={fieldErrors.lastName}>
          <input data-testid="input-invite-last-name" autoComplete="family-name" value={lastName} maxLength={50} onChange={e => setLastName(e.target.value)} className={inputCls} />
        </FieldRow>
        <FieldRow label="Password" error={fieldErrors.password}>
          <input data-testid="input-invite-new-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
        </FieldRow>
        <FieldRow label="Confirm password" error={fieldErrors.confirm}>
          <input data-testid="input-invite-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
        </FieldRow>
        <p className="text-[11px] text-slate-400">At least {MIN_PASSWORD} characters.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button data-testid="button-invite-create" type="submit" disabled={!!busy} className={primaryBtn}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={15} />} Create account
        </button>
        <p className="text-[11px] text-slate-500 flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 text-slate-400 shrink-0" />Only this email address can use this link.</p>
      </form>
    </AuthCard>
  );
}
