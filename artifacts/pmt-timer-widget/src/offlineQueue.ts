export interface QueuedWrite {
  id: string;
  clientId: number | string;
  taskIndex: number;
  payload: Record<string, unknown>;
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

export function saveQueue(queue: QueuedWrite[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
  }
}

function itemKey(item: Pick<QueuedWrite, "id" | "clientId" | "taskIndex">): string {
  return item.id ? item.id : `${item.clientId}:${item.taskIndex}`;
}

export function enqueue(item: QueuedWrite): void {
  const key = itemKey(item);
  const queue = loadQueue();
  const existing = queue.findIndex((q) => itemKey(q) === key);
  if (existing >= 0) {
    queue[existing] = item;
  } else {
    queue.push(item);
  }
  saveQueue(queue);
}

export function dequeueByKey(item: Pick<QueuedWrite, "id" | "clientId" | "taskIndex">): void {
  const key = itemKey(item);
  const queue = loadQueue().filter((q) => itemKey(q) !== key);
  saveQueue(queue);
}

export function dequeue(id: string): void {
  const queue = loadQueue().filter((q) => q.id !== id);
  saveQueue(queue);
}
