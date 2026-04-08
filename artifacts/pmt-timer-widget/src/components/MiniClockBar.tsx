import React from "react";
import { Maximize2 } from "lucide-react";

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

export default function MiniClockBar({
  elapsedMs,
  taskName,
  clientName,
  isRunning,
  onRestore,
}: MiniClockBarProps) {
  return (
    <div
      className="flex items-center h-screen px-3 gap-2 select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
          isRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
        }`}
      />

      <div className="flex-1 min-w-0">
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

      <button
        onClick={onRestore}
        title="Restore"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/25 border border-white/15 flex items-center justify-center transition-all flex-shrink-0"
      >
        <Maximize2 size={10} className="text-slate-300" />
      </button>
    </div>
  );
}
