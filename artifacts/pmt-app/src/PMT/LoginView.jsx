import React, { useState } from 'react';

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const LoginView = ({ onLogin, onGoogleLogin, loginError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin?.(email.trim(), password);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await onGoogleLogin?.();
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-screen overflow-hidden px-4 py-8"
      style={{
        background:
          'radial-gradient(58% 72% at 8% 16%, rgba(241, 94, 88, 0.92) 0%, rgba(241, 94, 88, 0) 62%), radial-gradient(52% 64% at 52% 88%, rgba(82, 110, 255, 0.78) 0%, rgba(82, 110, 255, 0) 66%), radial-gradient(44% 58% at 95% 15%, rgba(236, 232, 123, 0.88) 0%, rgba(236, 232, 123, 0) 64%), linear-gradient(140deg, #eb6f7a 0%, #c86ea0 33%, #8c7fd1 58%, #8ca3d4 74%, #d5dca8 100%)'
      }}
    >
      <div className="pointer-events-none absolute -left-20 top-16 h-80 w-80 rounded-full bg-rose-300/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-yellow-100/30 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 bottom-0 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-400/25 blur-3xl" />

      <div className="relative mx-auto flex min-h-[90vh] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-white/35 bg-white/15 shadow-2xl backdrop-blur-xl md:grid-cols-2">
          <section className="hidden flex-col justify-between bg-gradient-to-br from-rose-400/50 via-indigo-500/45 to-yellow-200/45 p-10 text-white md:flex">
            <div>
              <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white">Plan. Execute. Grow.</h1>
              <p className="mt-4 max-w-sm text-sm text-white/85">
                Centralized project tracking for teams, tasks, and outcomes.
              </p>
            </div>

            <div className="rounded-2xl border border-white/35 bg-white/15 p-4 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/85">Ethinos PMT</p>
              <p className="mt-2 text-sm text-white">Sign in with your Ethinos work email to access your workspace.</p>
            </div>
          </section>

          <section className="border-l border-white/30 bg-white/82 p-8 backdrop-blur-md sm:p-10">
            <div className="mb-6">
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Welcome</h2>
              <p className="mt-1 text-sm text-slate-600">Sign in to continue to your workspace.</p>
            </div>

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLoading ? 'Signing in…' : 'Continue with Google'}
            </button>

            {/* Divider */}
            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">or sign in with email</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-800">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@ethinos.com"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-800">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  required
                />
              </div>

              {loginError && <p className="text-xs font-semibold text-red-600">{loginError}</p>}

              <button
                type="submit"
                className="w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-rose-500 via-indigo-500 to-blue-500 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
              >
                Sign In
              </button>
            </form>

            <p className="mt-5 text-xs font-medium text-slate-500 md:hidden">
              Sign in with your Ethinos work email.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
