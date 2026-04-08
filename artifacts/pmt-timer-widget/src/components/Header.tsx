import React from "react";
import { LogOut, Timer } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTasks } from "../context/TasksContext";
import SyncIndicator from "./SyncIndicator";

export default function Header() {
  const { pmtUser, logout } = useAuth();
  const { syncStatus, flushQueue } = useTasks();

  return (
    <div className="flex items-center px-4 py-3 border-b border-white/10 flex-shrink-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center flex-shrink-0">
          <Timer size={14} className="text-indigo-300" />
        </div>
        <div className="min-w-0">
          <p className="text-white text-xs font-bold leading-tight truncate">PMT Timer</p>
          {pmtUser && (
            <p className="text-slate-500 text-[10px] truncate">{pmtUser.name || pmtUser.email}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SyncIndicator
          state={syncStatus.state}
          pendingCount={syncStatus.pendingCount}
          onFlush={flushQueue}
        />
        <button
          onClick={logout}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-all"
          title="Logout"
        >
          <LogOut size={12} className="text-slate-400" />
        </button>
      </div>
    </div>
  );
}
