import React, { useState } from 'react';

const DEPARTMENTS = ['Analytics', 'Biddable', 'Client Servicing', 'Content', 'Creative', 'Growth', 'Performance', 'SEO', 'Technology'];
const REGIONS = ['North', 'South', 'West'];

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-800">{label}</label>
    <div className="mt-1">{children}</div>
  </div>
);

const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

const LoginView = ({ onLogin, onMicrosoftLogin, onCreateAccount, onResetPassword, loginError, msLoginStatus, onCancelMsLogin, departments: deptsProp, regions: regionsProp }) => {
  const depts = (deptsProp && deptsProp.length > 0) ? [...deptsProp].sort() : DEPARTMENTS;
  const regs  = (regionsProp && regionsProp.length > 0) ? regionsProp : REGIONS;
  const [mode, setMode] = useState('signin'); // 'signin' | 'register' | 'reset'

  // Sign-in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msLoading, setMsLoading] = useState(false);

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regDept, setRegDept] = useState('');
  const [regRegion, setRegRegion] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Reset password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setRegError('');
    setResetError('');
    setResetSent(false);
    setResetEmail('');
  };

  const handleSignIn = (e) => {
    e.preventDefault();
    onLogin?.(email.trim(), password);
  };

  const handleMicrosoftSignIn = async () => {
    setMsLoading(true);
    try {
      await onMicrosoftLogin?.();
    } finally {
      setMsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError('');
    if (!regName.trim()) { setRegError('Please enter your full name.'); return; }
    if (!regDept) { setRegError('Please select your department.'); return; }
    if (!regRegion) { setRegError('Please select your region.'); return; }
    if (regPassword.length < 6) { setRegError('Password must be at least 6 characters.'); return; }
    if (regPassword !== regConfirm) { setRegError('Passwords do not match.'); return; }

    setRegLoading(true);
    try {
      await onCreateAccount?.({
        name: regName,
        email: regEmail,
        password: regPassword,
        department: regDept,
        region: regRegion,
      });
    } catch {
      setRegError('Something went wrong. Please try again.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetError('');
    if (!resetEmail.trim()) { setResetError('Please enter your email address.'); return; }
    setResetLoading(true);
    try {
      await onResetPassword?.(resetEmail.trim());
      setResetSent(true);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('user-not-found') || msg.includes('invalid-email') || msg.includes('No account')) {
        setResetError('No account found with that email address.');
      } else if (msg.includes('not configured') || msg.includes('Email service')) {
        setResetError('Email service is not configured. Please contact your administrator.');
      } else {
        setResetError('Could not send reset email. Please try again.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const bg = {
    background:
      'radial-gradient(58% 72% at 8% 16%, rgba(241, 94, 88, 0.92) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(52% 64% at 52% 88%, rgba(82, 110, 255, 0.78) 0%, rgba(82, 110, 255, 0) 66%), radial-gradient(44% 58% at 95% 15%, rgba(236, 232, 123, 0.88) 0%, rgba(236, 232, 123, 0) 64%), linear-gradient(140deg, #eb6f7a 0%, #c86ea0 33%, #8c7fd1 58%, #8ca3d4 74%, #d5dca8 100%)'
  };

  return (
    <div className="relative min-h-screen w-screen overflow-hidden px-4 py-8" style={bg}>
      <div className="pointer-events-none absolute -left-20 top-16 h-80 w-80 rounded-full bg-rose-300/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-yellow-100/30 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 bottom-0 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-400/25 blur-3xl" />

      <div className="relative mx-auto flex min-h-[90vh] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-white/35 bg-white/15 shadow-2xl backdrop-blur-xl md:grid-cols-2">

          {/* Left panel */}
          <section className="hidden flex-col justify-between bg-gradient-to-br from-rose-400/50 via-indigo-500/45 to-yellow-200/45 p-10 text-white md:flex">
            <div>
              <div className="inline-flex items-center rounded-2xl border border-white/30 bg-white/90 px-5 py-2.5 shadow-md backdrop-blur-sm">
                <img src="/ethinos-logo.png" alt="Ethinos" className="h-6 w-auto object-contain" />
              </div>
              <h1 className="mt-8 text-4xl font-black leading-tight tracking-tight text-white">Plan. Execute. Grow.</h1>
              <p className="mt-4 max-w-sm text-sm text-white/85">
                Centralized project tracking for teams, tasks, and outcomes.
              </p>
            </div>
            <div className="rounded-2xl border border-white/35 bg-white/15 p-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/85">Ethinos Flow Pro</p>
              <p className="mt-2 text-sm text-white">
                {mode === 'signin'
                  ? 'Sign in with your Ethinos Microsoft account to access your workspace.'
                  : mode === 'register'
                  ? 'Create your account to get started. Your manager will assign your projects once you are set up.'
                  : 'Enter your email and we\'ll send you a link to reset your password.'}
              </p>
            </div>
          </section>

          {/* Right panel */}
          <section className="border-l border-white/30 bg-white/82 p-8 backdrop-blur-md sm:p-10">

            {mode === 'signin' && (
              <>
                <div className="mb-6">
                  <img src="/ethinos-logo.png" alt="Ethinos" className="mb-4 h-7 w-auto object-contain md:hidden" />
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Welcome</h2>
                  <p className="mt-1 text-sm text-slate-600">Sign in to continue to your workspace.</p>
                </div>

                {/* Microsoft Sign-In Button */}
                <button
                  type="button"
                  onClick={handleMicrosoftSignIn}
                  disabled={msLoading || !!msLoginStatus}
                  className="mb-2 w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white py-2.5 px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-60"
                >
                  <MicrosoftIcon />
                  {msLoading ? 'Opening sign-in…' : 'Sign in with Microsoft'}
                </button>

                {msLoginStatus && (
                  <div className="mb-4 text-center">
                    <p className="text-xs font-semibold text-indigo-600 animate-pulse">{msLoginStatus}</p>
                    <button
                      type="button"
                      onClick={onCancelMsLogin}
                      className="mt-1 text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="relative mb-5 flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs font-medium text-slate-400">or use email & password</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <form className="space-y-4" onSubmit={handleSignIn}>
                  <Field label="Email">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@ethinos.com" className={inputCls} required />
                  </Field>
                  <Field label="Password">
                    <div className="relative">
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" className={inputCls} required />
                    </div>
                  </Field>

                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {loginError && <p className="text-xs font-semibold text-red-600">{loginError}</p>}

                  <button type="submit" className="w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-rose-500 via-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110">
                    Sign In
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-slate-500">
                  Don't have an account?{' '}
                  <button onClick={() => switchMode('register')} className="font-semibold text-indigo-600 hover:underline">
                    Create account
                  </button>
                </p>
              </>
            )}

            {mode === 'reset' && (
              <>
                <div className="mb-6">
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Reset Password</h2>
                  <p className="mt-1 text-sm text-slate-600">Enter your work email and we'll send a reset link.</p>
                </div>

                {resetSent ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
                    <p className="text-2xl mb-2">📬</p>
                    <p className="text-sm font-bold text-emerald-800">Reset email sent!</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Check your inbox at <span className="font-semibold">{resetEmail}</span> and follow the link to set a new password.
                    </p>
                    <button
                      onClick={() => switchMode('signin')}
                      className="mt-4 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={handleReset}>
                    <Field label="Work Email">
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="you@ethinos.com"
                        className={inputCls}
                        required
                        autoFocus
                      />
                    </Field>

                    {resetError && <p className="text-xs font-semibold text-red-600">{resetError}</p>}

                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-rose-500 via-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
                    >
                      {resetLoading ? 'Sending…' : 'Send Reset Link'}
                    </button>
                  </form>
                )}

                <p className="mt-5 text-center text-sm text-slate-500">
                  Remembered it?{' '}
                  <button onClick={() => switchMode('signin')} className="font-semibold text-indigo-600 hover:underline">
                    Back to sign in
                  </button>
                </p>
              </>
            )}

            {mode === 'register' && (
              <>
                <div className="mb-5">
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Create Account</h2>
                  <p className="mt-1 text-sm text-slate-600">Fill in your details. You'll get basic access to start.</p>
                </div>

                <form className="space-y-3" onSubmit={handleRegister}>
                  <Field label="Full Name">
                    <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="e.g. Priya Sharma" className={inputCls} required />
                  </Field>

                  <Field label="Work Email">
                    <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@ethinos.com" className={inputCls} required />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Department">
                      <select value={regDept} onChange={e => setRegDept(e.target.value)} className={inputCls} required>
                        <option value="">Select…</option>
                        {depts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </Field>
                    <Field label="Region">
                      <select value={regRegion} onChange={e => setRegRegion(e.target.value)} className={inputCls} required>
                        <option value="">Select…</option>
                        {regs.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </Field>
                  </div>

                  <Field label="Password">
                    <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Min. 6 characters" className={inputCls} required />
                  </Field>

                  <Field label="Confirm Password">
                    <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="Repeat password" className={inputCls} required />
                  </Field>

                  {(regError || loginError) && (
                    <p className="text-xs font-semibold text-red-600">{regError || loginError}</p>
                  )}

                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs text-amber-700">
                      <span className="font-bold">Basic access only.</span> Your manager will assign clients and upgrade your role once your account is approved.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-rose-500 via-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
                  >
                    {regLoading ? 'Creating account…' : 'Create Account'}
                  </button>
                </form>

                <p className="mt-5 text-center text-sm text-slate-500">
                  Already have an account?{' '}
                  <button onClick={() => switchMode('signin')} className="font-semibold text-indigo-600 hover:underline">
                    Sign in
                  </button>
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
