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
  taskName: string;
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
}

export interface GroupedTasks {
  clientId: number | string;
  clientName: string;
  tasks: TaskLog[];
}

