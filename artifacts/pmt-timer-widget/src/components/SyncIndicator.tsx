import React from "react";
import { Wifi, WifiOff, RefreshCw, Check } from "lucide-react";

interface SyncIndicatorProps {
  state: "synced" | "pending" | "offline";
  pendingCount: number;
  onFlush: () => void;
}

export default function SyncIndicator({ state, pendingCount, onFlush }: SyncIndicatorProps) {
  if (state === "synced") {
    return (
      <div className="flex items-center gap-1.5 text-emerald-400">
        <Check size={12} />
        <span className="text-[10px] font-semibold">Synced</span>
      </div>
    );
  }

  if (state === "offline") {
    return (
      <div className="flex items-center gap-1.5 text-red-400">
        <WifiOff size={12} />
        <span className="text-[10px] font-semibold">Offline{pendingCount > 0 ? ` (${pendingCount})` : ""}</span>
      </div>
    );
  }

  return (
    <button
      onClick={onFlush}
      className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors"
    >
      <RefreshCw size={12} className="animate-spin" />
      <span className="text-[10px] font-semibold">Pending ({pendingCount})</span>
    </button>
  );
}
