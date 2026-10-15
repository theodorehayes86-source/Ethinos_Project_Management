// Isolated client portal. Mounted by PortalGate BEFORE any staff Firebase
// listeners. Uses only Firebase Auth + the /api/client-portal endpoints; it never
// touches the Realtime Database. Duplicated in pmt-mobile; keep in sync.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut,
} from 'firebase/auth';
import {
  ChevronLeft, Clock, Activity, CheckCircle, AlertTriangle, Calendar, Plus, X, LogOut,
  Loader2, Mail, RefreshCw, ShieldCheck, Building2, ArrowRight, Lock, Search,
} from 'lucide-react';
import { createPortalApi, isRevocationError, portalStats, filterPortalTasks } from './core.js';

const POLL_MS = 30000;

const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  wip: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const statusKey = (s) => {
  const v = String(s || 'Pending').toLowerCase();
  if (v === 'done' || v === 'completed') return 'done';
  if (v === 'wip' || v === 'in progress') return 'wip';
  return 'pending';
};

function Shell({ children }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-50 via-slate-50 to-indigo-50 text-left font-sans">
      {children}
    </div>
  );
}

function AuthCard({ title, subtitle, children }) {
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

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 focus:border-indigo-400';
const primaryBtn = 'w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors';

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

function StatCard({ label, value, icon, tone }) {
  return (
    <div className={`bg-white border ${tone === 'red' ? 'border-red-100' : 'border-slate-100'} rounded-xl px-4 py-3 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${tone === 'red' ? 'text-red-500' : 'text-slate-500'}`}>{label}</span>
        {icon}
      </div>
      <p className={`text-xl font-black mt-1 ${tone === 'red' ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function AddTaskModal({ clientName, onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setBusy(true); setError('');
    try { await onSubmit({ title: title.trim(), description: description.trim(), dueDate: dueDate || undefined }); onClose(); }
    catch (err) { setError(err?.message || 'Could not add task.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Add a task</h3>
            <p className="text-xs text-slate-500">For {clientName}. Your agency team will pick it up.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X size={15} className="text-slate-600" /></button>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title <span className="text-red-500">*</span></span>
          <input data-testid="input-portal-task-title" autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={200} className={inputCls} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
          <textarea data-testid="input-portal-task-description" value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={4000} className={`${inputCls} resize-none`} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date <span className="text-slate-400 normal-case font-normal">(optional)</span></span>
          <input data-testid="input-portal-task-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
        </label>
        {error && <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <button data-testid="button-portal-task-submit" type="submit" disabled={busy} className={primaryBtn}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={15} />} Add task
        </button>
      </form>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-4">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
    </div>
  );
}

function ClientDetail({ client, api, auth, onBack, onRevoked }) {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    const uid = auth.currentUser?.uid;
    const stale = () => seq !== seqRef.current || auth.currentUser?.uid !== uid;
    try {
      const data = await api.listTasks(client.id);
      if (stale()) return;
      setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      setError('');
    } catch (err) {
      if (stale()) return;
      setTasks(null); // never keep stale private content after an error
      setError(err?.message || 'Could not load tasks.');
      if (isRevocationError(err)) onRevoked();
    }
  }, [api, auth, client.id, onRevoked]);

  useEffect(() => {
    setTasks(null);
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      seqRef.current += 1;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const stats = portalStats(tasks || []);
  const visibleTasks = filterPortalTasks(tasks || [], { query, status: statusFilter });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button data-testid="button-portal-back" onClick={onBack} className="p-2 bg-white hover:bg-slate-50 rounded-xl border border-slate-100 shadow-sm">
            <ChevronLeft size={18} className="text-slate-600" />
          </button>
          <h2 data-testid="text-portal-client-name" className="text-xl font-bold text-slate-900 tracking-tight">{client.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="button-portal-refresh" onClick={load} className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg font-semibold text-xs hover:bg-slate-50 flex items-center gap-1.5">
            <RefreshCw size={13} /> Refresh
          </button>
          <button data-testid="button-portal-add-task" onClick={() => setShowAdd(true)} className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg font-bold text-xs hover:bg-indigo-700 flex items-center gap-1.5">
            <Plus size={13} /> Add task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard label="Total Pending" value={stats.pending} icon={<Clock size={13} className="text-orange-500" />} />
        <StatCard label="WIP Tasks" value={stats.wip} icon={<Activity size={13} className="text-blue-500" />} />
        <StatCard label="Completed" value={stats.done} icon={<CheckCircle size={13} className="text-emerald-500" />} />
        <StatCard label="Overdue" value={stats.overdue} tone="red" icon={<AlertTriangle size={13} className="text-red-500" />} />
        <StatCard label="Due Today" value={stats.dueToday} icon={<Calendar size={13} className="text-slate-500" />} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="input-portal-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks" className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-2 ring-indigo-500/20" />
        </div>
        <select data-testid="select-portal-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none">
          <option value="all">All tasks</option>
          <option value="pending">Pending</option>
          <option value="wip">In progress</option>
          <option value="done">Completed</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_3fr] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>Task</span><span>Due date</span><span>Status</span><span>Description</span>
        </div>
        {error ? (
          <div className="p-8 text-center">
            <AlertTriangle size={26} className="text-red-400 mx-auto mb-2" />
            <p data-testid="text-portal-tasks-error" className="text-sm font-semibold text-slate-700">{error}</p>
            <button onClick={load} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">Try again</button>
          </div>
        ) : tasks === null ? <SkeletonRows /> : tasks.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3"><Building2 size={20} className="text-indigo-500" /></div>
            <p className="text-sm font-bold text-slate-800">Nothing shared yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Tasks your agency shares with you will appear here. You can also add a request.</p>
          </div>
        ) : visibleTasks.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-400">No tasks match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleTasks.map(t => (
              <li key={t.id} data-testid={`row-portal-task-${t.id}`} className="px-5 py-3.5 md:grid md:grid-cols-[2fr_1fr_1fr_3fr] md:gap-4 md:items-start space-y-1.5 md:space-y-0">
                <p className="text-sm font-semibold text-slate-900 break-words">{t.title}</p>
                <p className="text-xs text-slate-600 flex items-center gap-1"><Calendar size={11} className="text-slate-400 md:hidden" />{t.dueDate || <span className="text-slate-300">No due date</span>}</p>
                <span className={`inline-flex w-fit text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[statusKey(t.status)]}`}>{t.status || 'Pending'}</span>
                <p className="text-xs text-slate-500 whitespace-pre-wrap break-words">{t.description || <span className="text-slate-300">No description</span>}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddTaskModal
          clientName={client.name}
          onClose={() => setShowAdd(false)}
          onSubmit={async (payload) => {
            try { await api.createTask(client.id, payload); }
            catch (err) { if (isRevocationError(err)) onRevoked(); throw err; }
            await load();
          }}
        />
      )}
    </div>
  );
}

export default function ClientPortal({ auth, user, apiBase, onExitToStaff }) {
  const [verified, setVerified] = useState(!!user?.emailVerified);
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const seqRef = useRef(0);

  const api = React.useMemo(() => createPortalApi({
    base: apiBase,
    getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
  }), [auth, apiBase]);

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
      setSelected(sel => (sel && list.some(c => String(c.id) === String(sel.id)) ? sel : (list.length === 1 ? list[0] : null)));
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

  const handleRevoked = useCallback(() => { seqRef.current += 1; clearPrivate(); loadMe(); }, [clearPrivate, loadMe]);

  const handleSignOut = async () => {
    seqRef.current += 1; // drop any in-flight /me response
    clearPrivate();
    setError('');
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
        {error ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm max-w-md mx-auto mt-10">
            <AlertTriangle size={28} className="text-amber-500 mx-auto mb-2" />
            <p data-testid="text-portal-me-error" className="text-sm font-bold text-slate-800">{error}</p>
            <button onClick={loadMe} className="mt-4 text-xs font-bold text-indigo-600 hover:underline">Try again</button>
          </div>
        ) : clients === null ? (
          <div className="grid gap-3 sm:grid-cols-2 mt-2">{[0, 1].map(i => <div key={i} className="h-20 rounded-xl bg-white/70 animate-pulse" />)}</div>
        ) : selected ? (
          <ClientDetail
            key={selected.id}
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
