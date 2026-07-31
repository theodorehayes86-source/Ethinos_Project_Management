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
    taskKey: string,
    taskId: string,
    payload: Partial<TaskLog>
  ) => Promise<void>;
  updateTaskStatus: (
    clientId: number | string,
    taskKey: string,
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
  // rawLogs keys: clientId → (Firebase-key → TaskLog).
  // We store it as a plain object to match what onValue returns.
  const [rawLogs, setRawLogs] = useState<Record<string, Record<string, TaskLog>>>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => ({
    state: loadQueue().length > 0 ? "pending" : "synced",
    pendingCount: loadQueue().length,
  }));

  /**
   * Always-current snapshot of rawLogs used by the flush logic to detect
   * stale queued writes without causing extra re-renders.
   */
  const rawLogsRef = useRef(rawLogs);
  useEffect(() => { rawLogsRef.current = rawLogs; }, [rawLogs]);

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

  // ─── Write helper ────────────────────────────────────────────────────────
  // Always writes to the stable Firebase key (taskKey), never a derived index.

  const doWrite = useCallback(
    async (
      clientId: number | string,
      taskKey: string,
      payload: Record<string, unknown>
    ) => {
      await withTimeout(
        update(ref(db, `clientLogs/${clientId}/${taskKey}`), payload),
        WRITE_TIMEOUT_MS
      );
    },
    []
  );

  // ─── Queue flush ──────────────────────────────────────────────────────────

  const flushQueueInternal = useCallback(async () => {
    const queue = loadQueue();
    if (!queue.length) {
      setSyncStatus({ state: "synced", pendingCount: 0 });
      return;
    }
    setSyncStatus({ state: "pending", pendingCount: queue.length });

    for (const item of queue) {
      // Staleness check: if the server already has a newer updatedAt for this
      // task, this queued write is outdated — drop it rather than overwrite.
      const clientLogs = rawLogsRef.current;
      const serverTask = clientLogs[String(item.clientId)]?.[item.taskKey];
      if (
        serverTask?.updatedAt != null &&
        typeof serverTask.updatedAt === "number" &&
        serverTask.updatedAt > item.timestamp
      ) {
        console.info(
          `[PMT Timer] Dropping stale queued write for task ${item.taskKey} ` +
          `(queued at ${item.timestamp}, server updatedAt ${serverTask.updatedAt})`
        );
        dequeueByKey(item);
        continue;
      }

      try {
        await doWrite(item.clientId, item.taskKey, item.payload);
        // Only remove from queue after Firebase confirms the write
        dequeueByKey(item);
      } catch {
        // Leave in queue — will retry on next reconnect
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

  // ─── Firebase connection sentinel ─────────────────────────────────────────

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

  // ─── Data listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!pmtUser) return;
    const unsubs: (() => void)[] = [];

    const u1 = onValue(ref(db, "clients"), (snap) => {
      const val = snap.val();
      // Always update state, including when the node is deleted (val === null)
      if (!val) {
        setClients([]);
        return;
      }
      const list: Client[] = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
      setClients(list);
    });
    unsubs.push(u1);

    const u2 = onValue(ref(db, "clientLogs"), (snap) => {
      // snap.val() is an object of { clientId: { taskKey: TaskLog } } or null.
      // We keep it as-is so groupedTasks can use Object.entries() for stable keys.
      setRawLogs((snap.val() as Record<string, Record<string, TaskLog>>) || {});
      setLoading(false);
    });
    unsubs.push(u2);

    return () => unsubs.forEach((u) => u());
  }, [pmtUser]);

  // ─── Grouped tasks ────────────────────────────────────────────────────────

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
        const allLogs = rawLogs[String(client.id)];

        // Use Object.entries() to preserve the real Firebase key for every task.
        // This is critical: the taskKey is used for all writes — never derive it
        // from an array position, which would be wrong after any deletion.
        const entries: [string, TaskLog][] = !allLogs
          ? []
          : Array.isArray(allLogs)
          ? (allLogs as TaskLog[]).map((log, idx) => [String(idx), log] as [string, TaskLog])
          : Object.entries(allLogs) as [string, TaskLog][];

        const tasks = entries
          .filter(([, log]) => log != null)
          .map(([taskKey, log]) => ({
            ...log,
            clientId: client.id,
            taskKey, // stable Firebase key — safe to use as write path
          }))
          .filter(
            (log) =>
              String(log.assigneeId) === String(pmtUser.id) &&
              log.qcStatus !== "sent"
          );

        return {
          clientId: client.id,
          clientName: client.name,
          tasks,
        };
      })
      .filter((g) => g.tasks.length > 0);
  }, [clients, rawLogs, pmtUser]);

  // ─── Write helpers ────────────────────────────────────────────────────────

  const updateTaskTimer = useCallback(
    async (
      clientId: number | string,
      taskKey: string,
      taskId: string,
      partial: Partial<TaskLog>
    ) => {
      const elapsedMs = partial.elapsedMs ?? 0;
      // updatedAt is included in every write so the flush logic can detect
      // stale queued entries that should not overwrite newer server state.
      const updatedAt = Date.now();
      const payload: Record<string, unknown> = {
        elapsedMs,
        timeTaken: formatDuration(elapsedMs),
        timerState: partial.timerState ?? "idle",
        timerStartedAt: partial.timerStartedAt ?? null,
        updatedAt,
      };
      if (partial.status !== undefined) {
        payload.status = partial.status;
      }

      const queueItem: QueuedWrite = {
        id: taskId,
        clientId,
        taskKey,
        payload,
        timestamp: updatedAt,
      };

      // If Firebase is known offline, skip the attempt — queue immediately
      if (!firebaseConnectedRef.current) {
        enqueue(queueItem);
        setSyncStatus({ state: "offline", pendingCount: loadQueue().length });
        return;
      }

      try {
        await doWrite(clientId, taskKey, payload);
        setSyncStatus((prev) => ({
          state: prev.pendingCount > 0 ? "pending" : "synced",
          pendingCount: prev.pendingCount,
        }));
      } catch {
        // Timed out or network error — save locally, sync on reconnect.
        // The write may still complete server-side; updatedAt lets the flush
        // logic detect and skip this entry if the server is already newer.
        enqueue(queueItem);
        setSyncStatus({ state: "pending", pendingCount: loadQueue().length });
      }
    },
    [doWrite]
  );

  const updateTaskStatus = useCallback(
    async (
      clientId: number | string,
      taskKey: string,
      taskId: string,
      fields: { status?: string; qcStatus?: string | null }
    ) => {
      const updatedAt = Date.now();
      const payload: Record<string, unknown> = { updatedAt };
      if (fields.status !== undefined) payload.status = fields.status;
      if ("qcStatus" in fields) payload.qcStatus = fields.qcStatus ?? null;

      const queueItem: QueuedWrite = {
        id: `status-${taskId}`,
        clientId,
        taskKey,
        payload,
        timestamp: updatedAt,
      };

      if (!firebaseConnectedRef.current) {
        enqueue(queueItem);
        setSyncStatus({ state: "offline", pendingCount: loadQueue().length });
        return;
      }

      try {
        await doWrite(clientId, taskKey, payload);
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
