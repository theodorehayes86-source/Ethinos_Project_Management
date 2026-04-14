import React, { useState } from "react";
import { useTasks } from "../context/TasksContext";
import { GroupedTasks, TaskLog, getTaskName } from "../types";
import { ChevronRight, ChevronDown, Clock, CheckCircle, Circle, Loader2, AlertCircle, ShieldCheck, ShieldX } from "lucide-react";

interface TaskListPageProps {
  onSelectTask: (task: TaskLog, clientName: string) => void;
}

function getStatusIcon(status: string) {
  switch (status?.toLowerCase()) {
    case "done":
    case "completed":
      return <CheckCircle size={12} className="text-emerald-400" />;
    case "wip":
    case "in progress":
      return <Loader2 size={12} className="text-amber-400 animate-spin" />;
    case "blocked":
      return <AlertCircle size={12} className="text-red-400" />;
    default:
      return <Circle size={12} className="text-slate-500" />;
  }
}

function getStatusBadgeClass(status: string) {
  switch (status?.toLowerCase()) {
    case "done":
    case "completed":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "wip":
    case "in progress":
      return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "blocked":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    default:
      return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
}

function formatDuration(ms: number): string {
  if (!ms) return "0:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function QcBadge({ qcStatus }: { qcStatus?: string | null }) {
  if (!qcStatus) return null;
  if (qcStatus === "sent") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 rounded-full px-2 py-0.5">
        <ShieldCheck size={8} />
        Pending QC
      </span>
    );
  }
  if (qcStatus === "approved") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-2 py-0.5">
        <ShieldCheck size={8} />
        QC Approved
      </span>
    );
  }
  if (qcStatus === "rejected") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/25 rounded-full px-2 py-0.5">
        <ShieldX size={8} />
        QC Rejected
      </span>
    );
  }
  return null;
}

function TaskRow({ task, onSelect }: { task: TaskLog; onSelect: () => void }) {
  const isRunning = task.timerState === "running";
  const isQcRejected = task.qcStatus === "rejected";

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150 text-left group ${
        isQcRejected
          ? "border-red-400/30 bg-red-500/8 hover:bg-red-500/15"
          : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {getStatusIcon(task.status)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{getTaskName(task)}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${getStatusBadgeClass(task.status)}`}
          >
            {task.status || "TODO"}
          </span>
          {task.qcEnabled && <QcBadge qcStatus={task.qcStatus} />}
          {(task.elapsedMs ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <Clock size={9} />
              {formatDuration(task.elapsedMs ?? 0)}
            </span>
          )}
        </div>
      </div>
      {isRunning && (
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
      )}
      <ChevronRight
        size={14}
        className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0"
      />
    </button>
  );
}

function ClientGroup({
  group,
  onSelectTask,
}: {
  group: GroupedTasks;
  onSelectTask: (task: TaskLog, clientName: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const runningCount = group.tasks.filter((t) => t.timerState === "running").length;

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-1 mb-2 group"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 flex-1 text-left truncate">
          {group.clientName}
        </span>
        {runningCount > 0 && !collapsed && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {runningCount} running
          </span>
        )}
        <span className="text-slate-500 group-hover:text-slate-300 transition-colors flex-shrink-0">
          {collapsed
            ? <ChevronRight size={14} />
            : <ChevronDown size={14} />
          }
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-1.5">
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id || `${group.clientId}-${task.taskIndex}`}
              task={task}
              onSelect={() => onSelectTask(task, group.clientName)}
            />
          ))}
        </div>
      )}

      {collapsed && (
        <p className="text-[11px] text-slate-600 px-1 mb-1">
          {group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""} hidden
          {runningCount > 0 && (
            <span className="text-emerald-500 ml-1">· {runningCount} running</span>
          )}
        </p>
      )}
    </div>
  );
}

export default function TaskListPage({ onSelectTask }: TaskListPageProps) {
  const { groupedTasks, loading } = useTasks();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-indigo-400" size={28} />
          <p className="text-slate-400 text-sm">Loading your tasks…</p>
        </div>
      </div>
    );
  }

  if (!groupedTasks.length) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center mx-auto mb-3">
            <Clock size={20} className="text-slate-500" />
          </div>
          <p className="text-slate-400 text-sm font-medium">No tasks assigned</p>
          <p className="text-slate-600 text-xs mt-1">Check with your project manager</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
      {groupedTasks.map((group: GroupedTasks) => (
        <ClientGroup
          key={String(group.clientId)}
          group={group}
          onSelectTask={onSelectTask}
        />
      ))}
    </div>
  );
}
