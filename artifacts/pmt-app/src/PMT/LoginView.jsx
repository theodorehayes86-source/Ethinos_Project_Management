import React, { useState } from 'react';

const LoginView = ({ onLogin, loginError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin?.(email.trim(), password);
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/85">Demo Access</p>
              <p className="mt-2 text-sm text-white">Email: test@ethinos.com</p>
              <p className="text-sm text-white">Password: ethinos@2026</p>
            </div>
          </section>

          <section className="border-l border-white/30 bg-white/82 p-8 backdrop-blur-md sm:p-10">
            <div className="mb-6">
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Welcome</h2>
              <p className="mt-1 text-sm text-slate-600">Sign in to continue to your workspace.</p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-800">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="test@ethinos.com"
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
              Demo: test@ethinos.com / ethinos@2026
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LoginView;