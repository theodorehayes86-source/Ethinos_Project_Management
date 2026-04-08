import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setLocalError(e.message || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col">
      {/* Drag handle — lets users drag the frameless window */}
      <div
        className="h-8 flex-shrink-0 flex items-center justify-center select-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="w-10 h-1 rounded-full bg-white/10" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className="w-full bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl overflow-hidden"
          style={{ maxWidth: "360px" }}
        >
          <div className="p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 overflow-hidden">
                <img src="./ethinos-logo.png" alt="Ethinos" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Ethinos Timer Pro
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Ethinos Consulting Tracker
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@ethinos.com"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400/50 transition-all"
                />
              </div>

              {displayError && (
                <div className="bg-red-500/15 border border-red-400/30 rounded-xl px-4 py-3 text-red-300 text-sm">
                  {displayError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl py-3 text-sm tracking-wide transition-all duration-200 mt-2"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
