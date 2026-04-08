import React, { useState, useEffect, useCallback } from "react";
import { TasksProvider } from "../context/TasksContext";
import Header from "../components/Header";
import MiniClockBar from "../components/MiniClockBar";
import TaskListPage from "./TaskListPage";
import TimerPage from "./TimerPage";
import { TaskLog } from "../types";

interface SelectedTask {
  task: TaskLog;
  clientName: string;
}

declare global {
  interface Window {
    electronAPI?: {
      minimizeToClock: () => void;
      restoreWindow: () => void;
      onMiniModeChange: (cb: (isMini: boolean) => void) => () => void;
      isElectron: boolean;
    };
  }
}

export default function MainApp() {
  const [selected, setSelected] = useState<SelectedTask | null>(null);
  const [miniMode, setMiniMode] = useState(false);
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const [liveIsRunning, setLiveIsRunning] = useState(false);

  const isElectron = !!window.electronAPI?.isElectron;

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onMiniModeChange((isMini) => {
      setMiniMode(isMini);
    });
    return unsub;
  }, []);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.minimizeToClock();
  }, []);

  const handleRestore = useCallback(() => {
    window.electronAPI?.restoreWindow();
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
            taskName={selected.task.taskName || "Untitled Task"}
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
          onMinimize={isElectron && selected ? handleMinimize : undefined}
        />
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
