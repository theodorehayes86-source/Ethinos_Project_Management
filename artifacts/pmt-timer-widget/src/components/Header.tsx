import React from "react";
import { LogOut, Timer, Minus, X, Maximize2, Minimize2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTasks } from "../context/TasksContext";
import SyncIndicator from "./SyncIndicator";

interface HeaderProps {
  onMinimizeToClock?: () => void;
  onMinimizeWindow?: () => void;
  onToggleMaximize?: () => void;
  onClose?: () => void;
  isMaximized?: boolean;
}

const isMac = window.electronAPI?.platform === "darwin";

export default function Header({
  onMinimizeToClock,
  onMinimizeWindow,
  onToggleMaximize,
  onClose,
  isMaximized,
}: HeaderProps) {
  const { pmtUser, logout } = useAuth();
  const { syncStatus, flushQueue } = useTasks();

  return (
    <div
      className="flex items-center py-3 border-b border-white/10 flex-shrink-0 select-none"
      style={{
        paddingLeft: isMac ? 80 : 16,
        paddingRight: 16,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center flex-shrink-0">
          <Timer size={14} className="text-indigo-300" />
        </div>
        <div className="min-w-0">
          <p className="text-white text-xs font-bold leading-tight truncate">Ethinos Timer Pro</p>
          {pmtUser && (
            <p className="text-slate-500 text-[10px] truncate">{pmtUser.name || pmtUser.email}</p>
          )}
        </div>
      </div>

      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <SyncIndicator
          state={syncStatus.state}
          pendingCount={syncStatus.pendingCount}
          onFlush={flushQueue}
        />

        {onMinimizeToClock && (
          <button
            onClick={onMinimizeToClock}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-indigo-500/30 border border-white/10 flex items-center justify-center transition-all"
            title="Minimize to clock bar"
          >
            <Timer size={11} className="text-slate-400" />
          </button>
        )}

        <button
          onClick={logout}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-all"
          title="Logout"
        >
          <LogOut size={11} className="text-slate-400" />
        </button>

        {!isMac && onMinimizeWindow && (
          <button
            onClick={onMinimizeWindow}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-all"
            title="Minimise"
          >
            <Minus size={11} className="text-slate-400" />
          </button>
        )}

        {!isMac && onToggleMaximize && (
          <button
            onClick={onToggleMaximize}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-all"
            title={isMaximized ? "Restore" : "Maximise"}
          >
            {isMaximized
              ? <Minimize2 size={11} className="text-slate-400" />
              : <Maximize2 size={11} className="text-slate-400" />
            }
          </button>
        )}

        {!isMac && onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/50 border border-white/10 hover:border-red-500/40 flex items-center justify-center transition-all group"
            title="Close"
          >
            <X size={11} className="text-slate-400 group-hover:text-red-300 transition-colors" />
          </button>
        )}
      </div>
    </div>
  );
}
