import React, { useState, useEffect, useCallback } from "react";
import { TasksProvider } from "../context/TasksContext";
import Header from "../components/Header";
import MiniClockBar from "../components/MiniClockBar";
import TaskListPage from "./TaskListPage";
import TimerPage from "./TimerPage";
import { TaskLog, getTaskName } from "../types";
import { Download, RefreshCw, X } from "lucide-react";

interface SelectedTask {
  task: TaskLog;
  clientName: string;
}

type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "progress"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string }
  | { status: "not-available" };

declare global {
  interface Window {
    electronAPI?: {
      minimizeToClock: () => void;
      restoreWindow: () => void;
      closeWindow: () => void;
      minimizeWindow: () => void;
      toggleMaximize: () => void;
      onMiniModeChange: (cb: (isMini: boolean) => void) => () => void;
      onAutoPause: (cb: () => void) => () => void;
      onUpdateStatus: (cb: (payload: Record<string, unknown>) => void) => () => void;
      installUpdate: () => void;
      isElectron: boolean;
      platform: string;
    };
  }
}

function UpdateBanner({ update, onDismiss }: { update: UpdateStatus; onDismiss: () => void }) {
  if (update.status === "idle" || update.status === "checking" || update.status === "not-available") {
    return null;
  }

  if (update.status === "available") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/20 border-b border-indigo-500/30 text-xs text-indigo-300">
        <Download size={11} className="shrink-0 animate-bounce" />
        <span className="flex-1">Downloading update v{update.version}…</span>
        <button onClick={onDismiss} className="text-indigo-400 hover:text-white"><X size={11} /></button>
      </div>
    );
  }

  if (update.status === "progress") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/20 border-b border-indigo-500/30 text-xs text-indigo-300">
        <Download size={11} className="shrink-0" />
        <div className="flex-1">
          <div className="flex justify-between mb-0.5">
            <span>Downloading update…</span>
            <span>{update.percent}%</span>
          </div>
          <div className="w-full bg-indigo-900/60 rounded-full h-1">
            <div
              className="bg-indigo-400 h-1 rounded-full transition-all"
              style={{ width: `${update.percent}%` }}
            />
          </div>
        </div>
        <button onClick={onDismiss} className="text-indigo-400 hover:text-white"><X size={11} /></button>
      </div>
    );
  }

  if (update.status === "downloaded") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 border-b border-emerald-500/30 text-xs text-emerald-300">
        <RefreshCw size={11} className="shrink-0" />
        <span className="flex-1">v{update.version} ready — restart to install</span>
        <button
          onClick={() => window.electronAPI?.installUpdate()}
          className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded text-[10px] font-bold transition-colors"
        >
          Restart
        </button>
        <button onClick={onDismiss} className="text-emerald-400 hover:text-white ml-1"><X size={11} /></button>
      </div>
    );
  }

  return null;
}

export default function MainApp() {
  const [selected, setSelected] = useState<SelectedTask | null>(null);
  const [miniMode, setMiniMode] = useState(false);
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const [liveIsRunning, setLiveIsRunning] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: "idle" });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const isElectron = !!window.electronAPI?.isElectron;

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onMiniModeChange((isMini) => {
      setMiniMode(isMini);
    });
    return unsub;
  }, []);

  // Listen for auto-updater events from the main process
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    const unsub = window.electronAPI.onUpdateStatus((payload) => {
      setBannerDismissed(false);
      setUpdateStatus(payload as UpdateStatus);
    });
    return unsub;
  }, []);

  const handleMinimizeToClock = useCallback(() => {
    window.electronAPI?.minimizeToClock();
  }, []);

  const handleRestore = useCallback(() => {
    window.electronAPI?.restoreWindow();
  }, []);

  const handleMinimizeWindow = useCallback(() => {
    window.electronAPI?.minimizeWindow();
  }, []);

  const handleToggleMaximize = useCallback(() => {
    window.electronAPI?.toggleMaximize();
    setIsMaximized((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.closeWindow();
  }, []);

  const handleElapsedUpdate = useCallback((ms: number, running: boolean) => {
    setLiveElapsedMs(ms);
    setLiveIsRunning(running);
  }, []);

  const handleBack = useCallback(() => {
    setSelected(null);
    setMiniMode(false);
  }, []);

  return (
    <TasksProvider>
      {/* Mini clock overlay — shown when window is shrunk; TimerPage stays mounted below */}
      {miniMode && selected && (
        <div className="fixed inset-0 z-50 bg-[#0f1629] border border-indigo-500/30 rounded-lg overflow-hidden">
          <MiniClockBar
            elapsedMs={liveElapsedMs}
            taskName={getTaskName(selected.task)}
            clientName={selected.clientName}
            isRunning={liveIsRunning}
            onRestore={handleRestore}
          />
        </div>
      )}

      {/* Full UI — always mounted so the timer keeps running in mini mode */}
      <div
        className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 overflow-hidden"
        style={{ visibility: miniMode ? "hidden" : "visible" }}
      >
        <Header
          onMinimizeToClock={isElectron && selected ? handleMinimizeToClock : undefined}
          onMinimizeWindow={isElectron ? handleMinimizeWindow : undefined}
          onToggleMaximize={isElectron ? handleToggleMaximize : undefined}
          onClose={isElectron ? handleClose : undefined}
          isMaximized={isMaximized}
        />

        {/* Auto-update notification strip */}
        {!bannerDismissed && (
          <UpdateBanner
            update={updateStatus}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}

        {selected ? (
          <TimerPage
            task={selected.task}
            clientName={selected.clientName}
            onBack={handleBack}
            onElapsedUpdate={handleElapsedUpdate}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                My Tasks
              </h2>
            </div>
            <TaskListPage
              onSelectTask={(task, clientName) => setSelected({ task, clientName })}
            />
          </div>
        )}
      </div>
    </TasksProvider>
  );
}
