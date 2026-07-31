export interface QueuedWrite {
  /** Optional logical task ID — kept for debugging; deduplication uses clientId:taskKey. */
  id?: string;
  clientId: number | string;
  /** The stable Firebase key within clientLogs/${clientId}. */
  taskKey: string;
  payload: Record<string, unknown>;
  /** Wall-clock ms when this write was last enqueued or merged. */
  timestamp: number;
}

const QUEUE_KEY = "pmt_timer_queue";

export function loadQueue(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedWrite[];
  } catch {
    return [];
  }
}

/**
 * Persist the queue to localStorage.
 * Returns true on success, false on failure (e.g. storage quota exceeded).
 * Always logs errors — never silently discards them.
 */
export function saveQueue(queue: QueuedWrite[]): boolean {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch (err) {
    console.error("[PMT Timer] Failed to save offline queue to localStorage:", err);
    return false;
  }
}

/** Stable deduplication key for a queued write. Always clientId:taskKey. */
function itemKey(item: Pick<QueuedWrite, "clientId" | "taskKey">): string {
  return `${item.clientId}:${item.taskKey}`;
}

/**
 * Add or merge a queued write.
 *
 * If an entry for the same task (same clientId + taskKey) already exists,
 * the payloads are MERGED so no field update is lost:
 *   merged.payload = { ...existing.payload, ...incoming.payload }
 *   merged.timestamp = Math.max(existing.timestamp, incoming.timestamp)
 *
 * This means a status-change and a timer-update for the same task collapse
 * into a single queued entry that carries both changes.
 *
 * Returns true if the queue was saved successfully, false on storage failure.
 */
export function enqueue(item: QueuedWrite): boolean {
  const key = itemKey(item);
  const queue = loadQueue();
  const existingIdx = queue.findIndex((q) => itemKey(q) === key);
  if (existingIdx >= 0) {
    // Merge: newer fields win; take the later timestamp
    queue[existingIdx] = {
      ...queue[existingIdx],
      payload: {
        ...queue[existingIdx].payload,
        ...item.payload,
      },
      timestamp: Math.max(queue[existingIdx].timestamp, item.timestamp),
    };
  } else {
    queue.push(item);
  }
  return saveQueue(queue);
}

export function dequeueByKey(item: Pick<QueuedWrite, "clientId" | "taskKey">): void {
  const key = itemKey(item);
  const queue = loadQueue().filter((q) => itemKey(q) !== key);
  saveQueue(queue);
}
