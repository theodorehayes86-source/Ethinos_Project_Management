import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueue, loadQueue, saveQueue, dequeueByKey, QueuedWrite } from '../offlineQueue';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

const makeItem = (overrides: Partial<QueuedWrite> = {}): QueuedWrite => ({
  clientId: 'client1',
  taskKey: '-Nabc',
  payload: { elapsedMs: 1000 },
  timestamp: 1000,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

// ─── saveQueue / loadQueue ────────────────────────────────────────────────────

describe('saveQueue / loadQueue', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadQueue()).toEqual([]);
  });

  it('round-trips items correctly', () => {
    const item = makeItem();
    saveQueue([item]);
    expect(loadQueue()).toEqual([item]);
  });

  it('saveQueue returns true on success', () => {
    expect(saveQueue([makeItem()])).toBe(true);
  });

  it('saveQueue returns false when localStorage throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError');
    });
    const result = saveQueue([makeItem()]);
    expect(result).toBe(false);
    spy.mockRestore();
  });
});

// ─── enqueue ─────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  it('adds a new item to an empty queue', () => {
    enqueue(makeItem());
    expect(loadQueue()).toHaveLength(1);
  });

  it('returns true on successful save', () => {
    expect(enqueue(makeItem())).toBe(true);
  });

  it('returns false when localStorage refuses the write', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError');
    });
    const result = enqueue(makeItem());
    expect(result).toBe(false);
    spy.mockRestore();
  });

  it('deduplicates by clientId:taskKey — keeps one entry per task', () => {
    enqueue(makeItem({ timestamp: 1000 }));
    enqueue(makeItem({ timestamp: 2000 }));
    expect(loadQueue()).toHaveLength(1);
  });

  it('merges payloads when deduplicating — newer fields win', () => {
    enqueue(makeItem({ payload: { elapsedMs: 1000, timerState: 'running' }, timestamp: 1000 }));
    enqueue(makeItem({ payload: { elapsedMs: 5000, status: 'WIP' }, timestamp: 2000 }));
    const [item] = loadQueue();
    // Both payloads merged; newer elapsedMs wins
    expect(item.payload.elapsedMs).toBe(5000);
    expect(item.payload.timerState).toBe('running'); // kept from earlier entry
    expect(item.payload.status).toBe('WIP'); // added by newer entry
  });

  it('takes the later timestamp when merging', () => {
    enqueue(makeItem({ timestamp: 1000 }));
    enqueue(makeItem({ timestamp: 2000 }));
    const [item] = loadQueue();
    expect(item.timestamp).toBe(2000);
  });

  it('keeps earlier timestamp if incoming is older', () => {
    enqueue(makeItem({ timestamp: 2000 }));
    enqueue(makeItem({ timestamp: 1000 }));
    const [item] = loadQueue();
    expect(item.timestamp).toBe(2000);
  });

  it('different taskKeys get separate queue entries', () => {
    enqueue(makeItem({ taskKey: '-Nabc' }));
    enqueue(makeItem({ taskKey: '-Nxyz' }));
    expect(loadQueue()).toHaveLength(2);
  });

  it('different clientIds get separate queue entries', () => {
    enqueue(makeItem({ clientId: 'clientA' }));
    enqueue(makeItem({ clientId: 'clientB' }));
    expect(loadQueue()).toHaveLength(2);
  });
});

// ─── dequeueByKey ─────────────────────────────────────────────────────────────

describe('dequeueByKey', () => {
  it('removes an item by clientId:taskKey', () => {
    enqueue(makeItem({ taskKey: '-Na', timestamp: 1000 }));
    enqueue(makeItem({ taskKey: '-Nb', timestamp: 1001 }));
    dequeueByKey({ clientId: 'client1', taskKey: '-Na' });
    const queue = loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].taskKey).toBe('-Nb');
  });

  it('is a no-op for unknown keys', () => {
    enqueue(makeItem());
    dequeueByKey({ clientId: 'client1', taskKey: '-Nother' });
    expect(loadQueue()).toHaveLength(1);
  });
});
