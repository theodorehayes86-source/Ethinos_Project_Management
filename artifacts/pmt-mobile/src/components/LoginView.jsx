import React, { useState } from 'react';
import { Mail, Lock, LogIn, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginView({ onLogin, onMicrosoftLogin, loginError, msLoginStatus, onCancelMsLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msLoading, setMsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onLogin(email.trim().toLowerCase(), password);
    } finally {
      setLoading(false);
    }
  };

  const handleMs = async () => {
    setMsLoading(true);
    try {
      await onMicrosoftLogin();
    } finally {
      setMsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-lg border border-slate-100 overflow-hidden">
            <img src={`${import.meta.env.BASE_URL}ethinos-icon.png`} alt="Ethinos" className="w-full h-full object-contain p-1" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">PMT Mobile</h1>
          <p className="text-slate-500 text-sm mt-1">Ethinos Consulting Tracker</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-4">
          {msLoginStatus ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <Loader2 size={18} className="text-indigo-500 animate-spin flex-shrink-0" />
                <p className="text-sm text-indigo-700 font-medium flex-1">{msLoginStatus}</p>
              </div>
              <button
                onClick={onCancelMsLogin}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handleMs}
                disabled={msLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-all shadow-sm active:scale-[0.98] min-h-[44px]"
              >
                {msLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F35325"/>
                    <rect x="11" y="1" width="9" height="9" fill="#81BC06"/>
                    <rect x="1" y="11" width="9" height="9" fill="#05A6F0"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFBA08"/>
                  </svg>
                )}
                Sign in with Microsoft 365
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    placeholder="your@ethinos.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-slate-50 min-h-[44px]"
                  />
                </div>

                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-slate-50 min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-3.5"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {loginError && (
                  <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">{loginError}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || msLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm transition-all shadow-md active:scale-[0.98] min-h-[44px] disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                  Sign In
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Restricted to @ethinos.com accounts
        </p>
      </div>
    </div>
  );
}
