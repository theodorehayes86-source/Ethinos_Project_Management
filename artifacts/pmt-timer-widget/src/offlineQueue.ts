export interface QueuedWrite {
  /** Logical task ID (used for deduplication). */
  id: string;
  clientId: number | string;
  /** The actual Firebase key within clientLogs/${clientId} — stable across deletions. */
  taskKey: string;
  payload: Record<string, unknown>;
  /** Wall-clock ms when this write was enqueued. Used for staleness checks on flush. */
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

/** Stable deduplication key for a queued write. */
function itemKey(item: Pick<QueuedWrite, "id" | "clientId" | "taskKey">): string {
  return item.id ? item.id : `${item.clientId}:${item.taskKey}`;
}

/**
 * Add or replace a queued write.
 * If an entry with the same logical key already exists, the newer one wins
 * (prevents a stale retry from outlasting a more recent write for the same task).
 */
export function enqueue(item: QueuedWrite): void {
  const key = itemKey(item);
  const queue = loadQueue();
  const existing = queue.findIndex((q) => itemKey(q) === key);
  if (existing >= 0) {
    // Only replace if the incoming write is newer
    if (item.timestamp >= queue[existing].timestamp) {
      queue[existing] = item;
    }
  } else {
    queue.push(item);
  }
  if (!saveQueue(queue)) {
    // Storage failed — warn the user so they know the write may not survive a reload
    console.warn(
      "[PMT Timer] Could not persist offline queue. If you go offline, this timer update may be lost."
    );
  }
}

export function dequeueByKey(item: Pick<QueuedWrite, "id" | "clientId" | "taskKey">): void {
  const key = itemKey(item);
  const queue = loadQueue().filter((q) => itemKey(q) !== key);
  saveQueue(queue);
}

export function dequeue(id: string): void {
  const queue = loadQueue().filter((q) => q.id !== id);
  saveQueue(queue);
}
