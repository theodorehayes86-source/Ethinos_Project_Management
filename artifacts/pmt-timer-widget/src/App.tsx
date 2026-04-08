import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import MainApp from "./pages/MainApp";
import { Loader2, AlertTriangle } from "lucide-react";

function AppInner() {
  const { firebaseUser, pmtUser, loading, pmtUserNotFound, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginPage />;
  }

  if (pmtUserNotFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-amber-300" />
          </div>
          <h2 className="text-white font-bold text-base mb-2">Account not in PMT</h2>
          <p className="text-slate-400 text-sm mb-5">
            Your login ({firebaseUser.email}) is not linked to a PMT user record. Contact your manager.
          </p>
          <button
            onClick={logout}
            className="bg-white/10 hover:bg-white/20 border border-white/15 text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!pmtUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  return <MainApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
