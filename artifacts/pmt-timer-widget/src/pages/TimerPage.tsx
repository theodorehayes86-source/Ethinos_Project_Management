import React, { useState, useEffect, useRef, useCallback } from "react";
import { TaskLog, getTaskName } from "../types";
import { useTasks } from "../context/TasksContext";
import { ArrowLeft, Play, Pause, Square, CheckCircle, Send, RotateCcw, ShieldCheck } from "lucide-react";

interface TimerPageProps {
  task: TaskLog;
  clientName: string;
  onBack: () => void;
  onElapsedUpdate?: (ms: number, isRunning: boolean) => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

type TimerState = "idle" | "running" | "paused" | "stopped";

export default function TimerPage({ task, clientName, onBack, onElapsedUpdate }: TimerPageProps) {
  const { updateTaskTimer, updateTaskStatus } = useTasks();

  const initialTimerState: TimerState =
    task.timerState === "stopped" ? "idle" : (task.timerState as TimerState) ?? "idle";

  const [timerState, setTimerState] = useState<TimerState>(initialTimerState);
  const [liveStatus, setLiveStatus] = useState<string>(task.status || "TODO");
  const [liveQcStatus, setLiveQcStatus] = useState<string | null>(task.qcStatus ?? null);

  /**
   * baseElapsedRef: accumulated elapsed ms NOT including the current running segment.
   * total = baseElapsedRef + (Date.now() - startedAtRef) when running.
   */
  const baseElapsedRef = useRef<number>(task.elapsedMs ?? 0);
  const startedAtRef = useRef<number | null>(
    initialTimerState === "running" && task.timerStartedAt
      ? task.timerStartedAt
      : null
  );

  const computeElapsed = useCallback((): number => {
    if (startedAtRef.current === null) return baseElapsedRef.current;
    return baseElapsedRef.current + (Date.now() - startedAtRef.current);
  }, []);

  const [elapsedMs, setElapsedMs] = useState<number>(computeElapsed());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // "done" flow states
  const [showQcPrompt, setShowQcPrompt] = useState(false);
  const [qcSent, setQcSent] = useState(false);

  useEffect(() => {
    if (timerState === "running") {
      intervalRef.current = setInterval(() => {
        const ms = computeElapsed();
        setElapsedMs(ms);
        onElapsedUpdate?.(ms, true);
      }, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      onElapsedUpdate?.(elapsedMs, false);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState, computeElapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timerState !== "running") {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      return;
    }

    syncIntervalRef.current = setInterval(() => {
      void updateTaskTimer(task.clientId, task.taskIndex, task.id, {
        elapsedMs: baseElapsedRef.current,
        timerState: "running",
        timerStartedAt: startedAtRef.current,
        status: liveStatus,
      });
    }, 10000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [timerState, task, updateTaskTimer, liveStatus]);

  /** Stop the sync interval immediately to prevent race-condition overwrites. */
  const stopSyncInterval = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  const handleStart = useCallback(() => {
    const now = Date.now();
    startedAtRef.current = now;
    const nextStatus = liveStatus === "TODO" ? "WIP" : liveStatus;
    setTimerState("running");
    setLiveStatus(nextStatus);
    void updateTaskTimer(task.clientId, task.taskIndex, task.id, {
      elapsedMs: baseElapsedRef.current,
      timerState: "running",
      timerStartedAt: now,
      status: nextStatus,
    });
  }, [task, updateTaskTimer, liveStatus]);

  const handlePause = useCallback(() => {
    stopSyncInterval();
    if (startedAtRef.current !== null) {
      baseElapsedRef.current = computeElapsed();
    }
    startedAtRef.current = null;
    const snapped = baseElapsedRef.current;
    setElapsedMs(snapped);
    setTimerState("paused");
    // Fire-and-forget — UI is already updated
    void updateTaskTimer(task.clientId, task.taskIndex, task.id, {
      elapsedMs: snapped,
      timerState: "paused",
      timerStartedAt: null,
      status: liveStatus,
    });
  }, [task, updateTaskTimer, computeElapsed, liveStatus, stopSyncInterval]);

  const handleStop = useCallback(() => {
    stopSyncInterval();
    if (startedAtRef.current !== null) {
      baseElapsedRef.current = computeElapsed();
    }
    startedAtRef.current = null;
    const snapped = baseElapsedRef.current;
    setElapsedMs(snapped);
    setTimerState("stopped");
    // Fire-and-forget — UI is already updated
    void updateTaskTimer(task.clientId, task.taskIndex, task.id, {
      elapsedMs: snapped,
      timerState: "stopped",
      timerStartedAt: null,
      status: liveStatus,
    });
  }, [task, updateTaskTimer, computeElapsed, liveStatus, stopSyncInterval]);

  /** Called when user clicks the Done button — stop timer and show QC prompt if enabled. */
  const handleDone = useCallback(() => {
    stopSyncInterval();
    if (startedAtRef.current !== null) {
      baseElapsedRef.current = computeElapsed();
    }
    startedAtRef.current = null;
    const snapped = baseElapsedRef.current;
    setElapsedMs(snapped);
    setTimerState("stopped");

    if (task.qcEnabled) {
      // Stop the timer first, then ask about QC
      void updateTaskTimer(task.clientId, task.taskIndex, task.id, {
        elapsedMs: snapped,
        timerState: "stopped",
        timerStartedAt: null,
        status: liveStatus,
      });
      setShowQcPrompt(true);
    } else {
      // No QC — mark done immediately
      setLiveStatus("Done");
      void updateTaskTimer(task.clientId, task.taskIndex, task.id, {
        elapsedMs: snapped,
        timerState: "stopped",
        timerStartedAt: null,
        status: "Done",
      });
      setTimeout(onBack, 1000);
    }
  }, [task, updateTaskTimer, computeElapsed, liveStatus, onBack, stopSyncInterval]);

  const handleMarkDoneSkipQC = useCallback(() => {
    setShowQcPrompt(false);
    setLiveStatus("Done");
    void updateTaskStatus(task.clientId, task.taskIndex, task.id, {
      status: "Done",
      qcStatus: null,
    });
    setTimeout(onBack, 1000);
  }, [task, updateTaskStatus, onBack]);

  const handleSendToQC = useCallback(() => {
    setShowQcPrompt(false);
    setLiveStatus("Done");
    setLiveQcStatus("sent");
    setQcSent(true);
    void updateTaskStatus(task.clientId, task.taskIndex, task.id, {
      status: "Done",
      qcStatus: "sent",
    });
    setTimeout(onBack, 1400);
  }, [task, updateTaskStatus, onBack]);

  const handleResetToWIP = useCallback(() => {
    setLiveStatus("WIP");
    setLiveQcStatus(null);
    void updateTaskStatus(task.clientId, task.taskIndex, task.id, {
      status: "WIP",
      qcStatus: null,
    });
    setTimeout(onBack, 800);
  }, [task, updateTaskStatus, onBack]);

  const isRunning = timerState === "running";
  const isPaused = timerState === "paused";
  const isStopped = timerState === "stopped" || timerState === "idle";
  const isQcRejected = liveQcStatus === "rejected";

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center transition-all"
        >
          <ArrowLeft size={14} className="text-slate-300" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest truncate">
            {clientName}
          </p>
          <p className="text-white text-sm font-semibold leading-tight truncate">
            {getTaskName(task)}
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="relative mb-8">
          <div
            className={`w-48 h-48 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
              isRunning
                ? "border-emerald-400/60 shadow-[0_0_48px_rgba(52,211,153,0.25)]"
                : isPaused
                ? "border-amber-400/60 shadow-[0_0_32px_rgba(251,191,36,0.15)]"
                : "border-white/15"
            }`}
          >
            {isRunning && (
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400/20 animate-ping" />
            )}
            <div className="text-center">
              <p
                className={`text-4xl font-mono font-bold tracking-wider transition-colors ${
                  isRunning
                    ? "text-emerald-300"
                    : isPaused
                    ? "text-amber-300"
                    : "text-white"
                }`}
              >
                {formatMs(elapsedMs)}
              </p>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
                {isRunning ? "Running" : isPaused ? "Paused" : "Stopped"}
              </p>
            </div>
          </div>
        </div>

        {/* QC sent confirmation */}
        {qcSent && (
          <div className="flex flex-col items-center gap-2">
            <ShieldCheck size={32} className="text-indigo-400" />
            <p className="text-indigo-300 font-bold text-sm">Sent for QC!</p>
          </div>
        )}

        {/* QC prompt */}
        {showQcPrompt && !qcSent && (
          <div className="w-full bg-white/8 border border-white/15 rounded-2xl p-4 space-y-3">
            <div className="text-center">
              <p className="text-white font-bold text-sm">Task complete — what's next?</p>
              <p className="text-slate-400 text-xs mt-0.5">This task has a QC reviewer assigned.</p>
            </div>
            <button
              onClick={handleSendToQC}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl py-2.5 text-sm transition-all"
            >
              <Send size={14} />
              Send for QC Review
            </button>
            <button
              onClick={handleMarkDoneSkipQC}
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-slate-300 font-semibold rounded-xl py-2.5 text-sm transition-all border border-white/10"
            >
              <CheckCircle size={14} />
              Mark Done (skip QC)
            </button>
          </div>
        )}

        {/* QC Rejected banner + Reset to WIP */}
        {isQcRejected && !showQcPrompt && !qcSent && (
          <div className="w-full bg-red-500/10 border border-red-400/30 rounded-2xl p-4 space-y-3">
            <div className="text-center">
              <p className="text-red-300 font-bold text-sm">QC Rejected</p>
              <p className="text-slate-400 text-xs mt-0.5">You can rework and resubmit, or reset to WIP.</p>
            </div>
            <button
              onClick={handleResetToWIP}
              className="w-full flex items-center justify-center gap-2 bg-amber-600/80 hover:bg-amber-500 text-white font-bold rounded-xl py-2.5 text-sm transition-all"
            >
              <RotateCcw size={14} />
              Reset to WIP
            </button>
          </div>
        )}

        {/* Normal controls */}
        {!showQcPrompt && !qcSent && !isQcRejected && (
          <div className="flex items-center gap-3">
            {isStopped && (
              <button
                onClick={handleStart}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl px-6 py-3 text-sm transition-all shadow-lg"
              >
                <Play size={16} />
                {elapsedMs > 0 ? "Resume" : "Start"}
              </button>
            )}

            {isRunning && (
              <>
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 bg-amber-600/80 hover:bg-amber-500 text-white font-bold rounded-2xl px-5 py-3 text-sm transition-all shadow-md border border-amber-400/30"
                >
                  <Pause size={16} />
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl px-5 py-3 text-sm transition-all border border-white/15"
                >
                  <Square size={16} />
                  Stop
                </button>
              </>
            )}

            {isPaused && (
              <>
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl px-5 py-3 text-sm transition-all shadow-md"
                >
                  <Play size={16} />
                  Resume
                </button>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl px-5 py-3 text-sm transition-all border border-white/15"
                >
                  <Square size={16} />
                  Stop
                </button>
              </>
            )}

            {(isPaused || timerState === "stopped") && elapsedMs > 0 && (
              <button
                onClick={handleDone}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl px-5 py-3 text-sm transition-all shadow-md"
              >
                <CheckCircle size={16} />
                Done
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-6 pb-4">
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
            Previously recorded
          </p>
          <p className="text-slate-300 text-sm font-mono">
            {formatMs(task.elapsedMs ?? 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
