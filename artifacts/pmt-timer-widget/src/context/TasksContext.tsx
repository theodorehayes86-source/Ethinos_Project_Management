import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { ref, onValue, update } from "firebase/database";
import { db, connectedRef } from "../firebase";
import { useAuth } from "./AuthContext";
import { Client, GroupedTasks, TaskLog } from "../types";
import { enqueue, loadQueue, dequeueByKey, QueuedWrite } from "../offlineQueue";

/** Max ms to wait for Firebase write acknowledgment before falling back to local queue. */
const WRITE_TIMEOUT_MS = 2000;

interface SyncStatus {
  state: "synced" | "pending" | "offline";
  pendingCount: number;
}

interface TasksContextValue {
  groupedTasks: GroupedTasks[];
  loading: boolean;
  syncStatus: SyncStatus;
  updateTaskTimer: (
    clientId: number | string,
    taskIndex: number,
    taskId: string,
    payload: Partial<TaskLog>
  ) => Promise<void>;
  updateTaskStatus: (
    clientId: number | string,
    taskIndex: number,
    taskId: string,
    fields: { status?: string; qcStatus?: string | null }
  ) => Promise<void>;
  flushQueue: () => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Race a Firebase write against a hard timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("write timeout")), ms)
    ),
  ]);
}

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { pmtUser } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [rawLogs, setRawLogs] = useState<Record<string, TaskLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => ({
    state: loadQueue().length > 0 ? "pending" : "synced",
    pendingCount: loadQueue().length,
  }));

  /**
   * Tracks whether Firebase's own WebSocket is connected.
   * Using a ref so read/write inside callbacks is always current without
   * causing extra re-renders of the whole component tree.
   */
  const firebaseConnectedRef = useRef<boolean>(false);

  /**
   * Ref to the latest flush function so the connectivity listener can always
   * call the current version without needing to be re-registered.
   */
  const flushQueueRef = useRef<() => Promise<void>>(async () => {});

  // ─── Write helper ───────────────────────────────────────────────────────

  const doWrite = useCallback(
    async (
      clientId: number | string,
      taskIndex: number,
      payload: Record<string, unknown>
    ) => {
      await withTimeout(
        update(ref(db, `clientLogs/${clientId}/${taskIndex}`), payload),
        WRITE_TIMEOUT_MS
      );
    },
    []
  );

  // ─── Queue flush ─────────────────────────────────────────────────────────

  const flushQueueInternal = useCallback(async () => {
    const queue = loadQueue();
    if (!queue.length) {
      setSyncStatus({ state: "synced", pendingCount: 0 });
      return;
    }
    setSyncStatus({ state: "pending", pendingCount: queue.length });

    for (const item of queue) {
      try {
        await doWrite(item.clientId, item.taskIndex, item.payload);
        dequeueByKey(item);
      } catch {
        // Leave it — will retry on next reconnect
      }
    }

    const remaining = loadQueue().length;
    setSyncStatus({
      state: remaining > 0 ? "pending" : "synced",
      pendingCount: remaining,
    });
  }, [doWrite]);

  // Keep the ref in sync with the latest flush function
  useEffect(() => {
    flushQueueRef.current = flushQueueInternal;
  }, [flushQueueInternal]);

  // ─── Firebase connection sentinel ────────────────────────────────────────

  useEffect(() => {
    const unsub = onValue(connectedRef, (snap) => {
      const connected = snap.val() === true;
      const wasConnected = firebaseConnectedRef.current;
      firebaseConnectedRef.current = connected;

      setSyncStatus((prev) => ({
        ...prev,
        state: connected
          ? prev.pendingCount > 0 ? "pending" : "synced"
          : "offline",
      }));

      // Flush the local queue immediately on reconnect
      if (connected && !wasConnected) {
        void flushQueueRef.current();
      }
    });
    return unsub;
  }, []); // empty — stable ref handles the callback update

  // ─── Data listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!pmtUser) return;
    const unsubs: (() => void)[] = [];

    const u1 = onValue(ref(db, "clients"), (snap) => {
      const val = snap.val();
      if (!val) return;
      const list: Client[] = Array.isArray(val) ? val : Object.values(val);
      setClients(list);
    });
    unsubs.push(u1);

    const u2 = onValue(ref(db, "clientLogs"), (snap) => {
      const val = snap.val();
      setRawLogs(val || {});
      setLoading(false);
    });
    unsubs.push(u2);

    return () => unsubs.forEach((u) => u());
  }, [pmtUser]);

  // ─── Grouped tasks ───────────────────────────────────────────────────────

  const groupedTasks = React.useMemo<GroupedTasks[]>(() => {
    if (!pmtUser) return [];

    const assignedProjects: string[] = (pmtUser.assignedProjects as string[]) || [];
    const isAll =
      pmtUser.role === "Super Admin" ||
      pmtUser.role === "Admin" ||
      assignedProjects.includes("All");

    const accessibleClients = isAll
      ? clients
      : clients.filter((c) => assignedProjects.includes(c.name));

    const SYNTHETIC_CLIENTS: Client[] = [
      { id: "__personal__", name: "Personal" },
      { id: "__ethinos__", name: "Ethinos" },
    ];

    const allClients = [...accessibleClients, ...SYNTHETIC_CLIENTS];

    return allClients
      .map((client) => {
        const allLogs = rawLogs[String(client.id)] || [];
        const arr: TaskLog[] = Array.isArray(allLogs)
          ? allLogs
          : Object.values(allLogs);

        const tasks = arr
          .map((log, idx) => ({ ...log, clientId: client.id, taskIndex: idx }))
          .filter((log) => String(log.assigneeId) === String(pmtUser.id));

        return {
          clientId: client.id,
          clientName: client.name,
          tasks,
        };
      })
      .filter((g) => g.tasks.length > 0);
  }, [clients, rawLogs, pmtUser]);

  // ─── Write helpers ───────────────────────────────────────────────────────

  const updateTaskTimer = useCallback(
    async (
      clientId: number | string,
      taskIndex: number,
      taskId: string,
      partial: Partial<TaskLog>
    ) => {
      const elapsedMs = partial.elapsedMs ?? 0;
      const payload: Record<string, unknown> = {
        elapsedMs,
        timeTaken: formatDuration(elapsedMs),
        timerState: partial.timerState ?? "idle",
        timerStartedAt: partial.timerStartedAt ?? null,
      };
      if (partial.status !== undefined) {
        payload.status = partial.status;
      }

      const queueItem: QueuedWrite = {
        id: taskId,
        clientId,
        taskIndex,
        payload,
        timestamp: Date.now(),
      };

      // If Firebase is known offline, skip the attempt — queue immediately
      if (!firebaseConnectedRef.current) {
        enqueue(queueItem);
        setSyncStatus({ state: "offline", pendingCount: loadQueue().length });
        return;
      }

      try {
        await doWrite(clientId, taskIndex, payload);
        setSyncStatus((prev) => ({
          state: prev.pendingCount > 0 ? "pending" : "synced",
          pendingCount: prev.pendingCount,
        }));
      } catch {
        // Timed out or network error — save locally, sync on reconnect
        enqueue(queueItem);
        setSyncStatus({ state: "pending", pendingCount: loadQueue().length });
      }
    },
    [doWrite]
  );

  const updateTaskStatus = useCallback(
    async (
      clientId: number | string,
      taskIndex: number,
      taskId: string,
      fields: { status?: string; qcStatus?: string | null }
    ) => {
      const payload: Record<string, unknown> = {};
      if (fields.status !== undefined) payload.status = fields.status;
      if ("qcStatus" in fields) payload.qcStatus = fields.qcStatus ?? null;

      const queueItem: QueuedWrite = {
        id: `status-${taskId}`,
        clientId,
        taskIndex,
        payload,
        timestamp: Date.now(),
      };

      if (!firebaseConnectedRef.current) {
        enqueue(queueItem);
        setSyncStatus({ state: "offline", pendingCount: loadQueue().length });
        return;
      }

      try {
        await doWrite(clientId, taskIndex, payload);
        setSyncStatus((prev) => ({
          state: prev.pendingCount > 0 ? "pending" : "synced",
          pendingCount: prev.pendingCount,
        }));
      } catch {
        enqueue(queueItem);
        setSyncStatus({ state: "pending", pendingCount: loadQueue().length });
      }
    },
    [doWrite]
  );

  const flushQueue = useCallback(async () => {
    await flushQueueInternal();
  }, [flushQueueInternal]);

  return (
    <TasksContext.Provider
      value={{ groupedTasks, loading, syncStatus, updateTaskTimer, updateTaskStatus, flushQueue }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks must be used within TasksProvider");
  return ctx;
}
