import React from "react";
import { Maximize2, GripHorizontal } from "lucide-react";

interface MiniClockBarProps {
  elapsedMs: number;
  taskName: string;
  clientName: string;
  isRunning: boolean;
  onRestore: () => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const isMac = window.electronAPI?.platform === "darwin";

export default function MiniClockBar({
  elapsedMs,
  taskName,
  clientName,
  isRunning,
  onRestore,
}: MiniClockBarProps) {
  return (
    <div
      className="flex items-center h-screen select-none"
      style={{ paddingLeft: isMac ? 80 : 0 } as React.CSSProperties}
    >
      {/* Drag grip — only this narrow strip moves the window */}
      <div
        className="flex items-center justify-center w-6 h-full flex-shrink-0 cursor-grab"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <GripHorizontal size={10} className="text-slate-600 rotate-90" />
      </div>

      {/* Clickable area — restores the full window */}
      <button
        onClick={onRestore}
        title="Click to restore full window"
        className="flex-1 flex items-center gap-2 h-full px-2 hover:bg-white/5 transition-colors group"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
            isRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
          }`}
        />

        <div className="flex-1 min-w-0 text-left">
          <p
            className={`font-mono font-bold text-base tracking-widest leading-none transition-colors ${
              isRunning ? "text-emerald-300" : "text-slate-300"
            }`}
          >
            {formatMs(elapsedMs)}
          </p>
          <p className="text-slate-500 text-[9px] truncate leading-none mt-0.5">
            {clientName} · {taskName}
          </p>
        </div>

        <Maximize2
          size={12}
          className="text-slate-600 group-hover:text-slate-300 transition-colors flex-shrink-0"
        />
      </button>
    </div>
  );
}
