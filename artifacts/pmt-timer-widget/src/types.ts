export interface PMTUser {
  id: number | string;
  name: string;
  email: string;
  role?: string;
  assignedProjects?: (number | string)[];
}

export interface Client {
  id: number | string;
  name: string;
  projectId?: number | string;
}

export interface TaskLog {
  id: string;
  /** The PMT app stores the task name as `name`. `taskName` kept for compatibility. */
  name?: string;
  taskName?: string;
  status: string;
  assigneeId: number | string;
  elapsedMs?: number;
  timeTaken?: string;
  timerState?: "idle" | "running" | "paused" | "stopped";
  timerStartedAt?: number | null;
  clientId: number | string;
  /**
   * The actual Firebase key for this task within clientLogs/${clientId}.
   * Populated from Object.entries() so it is always stable, even after
   * deletions or reorders. Replaces the old derived `taskIndex`.
   */
  taskKey: string;
  description?: string;
  category?: string;
  /** Created date — format: "1st Apr 2024" (do MMM yyyy) */
  date?: string;
  /** Due date — format: "1st Apr 2024" (do MMM yyyy) */
  dueDate?: string;
  qcEnabled?: boolean;
  qcStatus?: string | null;
  qcAssigneeName?: string | null;
  /**
   * Server-side last-write timestamp (ms since epoch). Written with every
   * Firebase update so the offline queue can detect and discard stale entries.
   */
  updatedAt?: number;
}

export interface GroupedTasks {
  clientId: number | string;
  clientName: string;
  tasks: TaskLog[];
}

/** Returns the display name for a task, handling both field name variants. */
export function getTaskName(task: TaskLog): string {
  return task.taskName || task.name || "Untitled Task";
}
