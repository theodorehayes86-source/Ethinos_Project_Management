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
  taskIndex: number;
  description?: string;
  category?: string;
  qcEnabled?: boolean;
  qcStatus?: string | null;
  qcAssigneeName?: string | null;
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
