import React, { useState, useEffect, useRef, useCallback } from "react";
import { TaskLog } from "../types";
import { useTasks } from "../context/TasksContext";
import { ArrowLeft, Play, Pause, Square, CheckCircle } from "lucide-react";

interface TimerPageProps {
  task: TaskLog;
  clientName: string;
  onBack: () => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

type TimerState = "idle" | "running" | "paused" | "stopped";

export default function TimerPage({ task, clientName, onBack }: TimerPageProps) {
  const { updateTaskTimer } = useTasks();

  const initialTimerState: TimerState =
    task.timerState === "stopped" ? "idle" : (task.timerState as TimerState) ?? "idle";

  const [timerState, setTimerState] = useState<TimerState>(initialTimerState);

  const [liveStatus, setLiveStatus] = useState<string>(task.status || "TODO");

  /**
   * baseElapsedRef: the accumulated elapsed time NOT including the currently-running segment.
   * When timer is running: total = baseElapsedRef + (Date.now() - startedAtRef)
   * We always persist baseElapsedRef + timerStartedAt to Firebase, NOT the computed total,
   * so that on reload the same formula produces the correct result without double-counting.
   */
  const baseElapsedRef = useRef<number>(
    task.timerState === "running" && task.timerStartedAt
      ? task.elapsedMs ?? 0
      : task.elapsedMs ?? 0
  );

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
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (timerState === "running") {
      intervalRef.current = setInterval(() => {
        setElapsedMs(computeElapsed());
      }, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState, computeElapsed]);

  useEffect(() => {
    if (timerState !== "running") {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      return;
    }

    syncIntervalRef.current = setInterval(async () => {
      /**
       * Periodic sync: write baseElapsedRef (NOT computeElapsed) and the original timerStartedAt.
       * On reload, Firebase has: elapsedMs = base, timerStartedAt = T
       * Widget computes: base + (now - T) = correct total. No double-count.
       */
      await updateTaskTimer(task.clientId, task.taskIndex, task.id, {
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

  const handleStart = useCallback(async () => {
    const now = Date.now();
    startedAtRef.current = now;
    const nextStatus = liveStatus === "TODO" ? "WIP" : liveStatus;
    setTimerState("running");
    setLiveStatus(nextStatus);
    await updateTaskTimer(task.clientId, task.taskIndex, task.id, {
      elapsedMs: baseElapsedRef.current,
      timerState: "running",
      timerStartedAt: now,
      status: nextStatus,
    });
  }, [task, updateTaskTimer, liveStatus]);

  const handlePause = useCallback(async () => {
    if (startedAtRef.current !== null) {
      baseElapsedRef.current = computeElapsed();
    }
    startedAtRef.current = null;
    const snapped = baseElapsedRef.current;
    setElapsedMs(snapped);
    setTimerState("paused");
    await updateTaskTimer(task.clientId, task.taskIndex, task.id, {
      elapsedMs: snapped,
      timerState: "paused",
      timerStartedAt: null,
      status: liveStatus,
    });
  }, [task, updateTaskTimer, computeElapsed, liveStatus]);

  const handleStop = useCallback(async () => {
    if (startedAtRef.current !== null) {
      baseElapsedRef.current = computeElapsed();
    }
    startedAtRef.current = null;
    const snapped = baseElapsedRef.current;
    setElapsedMs(snapped);
    setTimerState("stopped");
    await updateTaskTimer(task.clientId, task.taskIndex, task.id, {
      elapsedMs: snapped,
      timerState: "stopped",
      timerStartedAt: null,
      status: liveStatus,
    });
  }, [task, updateTaskTimer, computeElapsed, liveStatus]);

  const handleDone = useCallback(async () => {
    if (startedAtRef.current !== null) {
      baseElapsedRef.current = computeElapsed();
    }
    startedAtRef.current = null;
    const snapped = baseElapsedRef.current;
    setElapsedMs(snapped);
    setTimerState("stopped");
    setLiveStatus("Done");
    setDone(true);
    await updateTaskTimer(task.clientId, task.taskIndex, task.id, {
      elapsedMs: snapped,
      timerState: "stopped",
      timerStartedAt: null,
      status: "Done",
    });
    setTimeout(onBack, 1200);
  }, [task, updateTaskTimer, computeElapsed, onBack]);

  const isRunning = timerState === "running";
  const isPaused = timerState === "paused";
  const isStopped = timerState === "stopped" || timerState === "idle";

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
            {task.taskName || "Untitled Task"}
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

        {done ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle size={32} className="text-emerald-400" />
            <p className="text-emerald-300 font-bold text-sm">Task marked done!</p>
          </div>
        ) : (
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
