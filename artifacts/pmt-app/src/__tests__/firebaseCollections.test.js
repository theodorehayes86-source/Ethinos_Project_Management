import { describe, it, expect } from 'vitest';
import {
  collectionEntries,
  collectionValues,
  tasksWithKeys,
} from '../lib/firebaseCollections.js';

// ─── collectionEntries ────────────────────────────────────────────────────────

describe('collectionEntries', () => {
  it('returns [] for null', () => {
    expect(collectionEntries(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(collectionEntries(undefined)).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(collectionEntries([])).toEqual([]);
  });

  it('returns [] for empty object', () => {
    expect(collectionEntries({})).toEqual([]);
  });

  it('handles legacy array shape — maps index to string key', () => {
    const result = collectionEntries([{ id: 'a' }, { id: 'b' }]);
    expect(result).toEqual([
      ['0', { id: 'a' }],
      ['1', { id: 'b' }],
    ]);
  });

  it('handles push-key object shape', () => {
    const result = collectionEntries({ '-Nabc': { id: '-Nabc' }, '-Ndef': { id: '-Ndef' } });
    expect(result).toEqual([
      ['-Nabc', { id: '-Nabc' }],
      ['-Ndef', { id: '-Ndef' }],
    ]);
  });

  it('filters null slots from legacy arrays', () => {
    const result = collectionEntries([{ id: 'a' }, null, { id: 'c' }]);
    expect(result).toHaveLength(2);
    expect(result[0][1].id).toBe('a');
    expect(result[1][1].id).toBe('c');
  });

  it('filters null values from object shape', () => {
    const result = collectionEntries({ '-Nabc': { id: '-Nabc' }, '-Ndef': null });
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('-Nabc');
  });
});

// ─── collectionValues ────────────────────────────────────────────────────────

describe('collectionValues', () => {
  it('returns [] for null', () => {
    expect(collectionValues(null)).toEqual([]);
  });

  it('returns task objects from push-key shape', () => {
    const tasks = { '-Na': { id: '-Na', name: 'T1' }, '-Nb': { id: '-Nb', name: 'T2' } };
    const result = collectionValues(tasks);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.name)).toEqual(expect.arrayContaining(['T1', 'T2']));
  });

  it('returns task objects from array shape', () => {
    const tasks = [{ id: 1 }, { id: 2 }];
    const result = collectionValues(tasks);
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

// ─── tasksWithKeys ────────────────────────────────────────────────────────────

describe('tasksWithKeys', () => {
  it('returns [] for null', () => {
    expect(tasksWithKeys(null)).toEqual([]);
  });

  it('attaches push key as taskKey for object shape', () => {
    const result = tasksWithKeys({ '-Nabc': { id: '-Nabc', name: 'Task' } });
    expect(result).toHaveLength(1);
    expect(result[0].taskKey).toBe('-Nabc');
    expect(result[0].name).toBe('Task');
  });

  it('attaches string index as taskKey for legacy array shape', () => {
    const result = tasksWithKeys([{ id: 'legacy1' }, { id: 'legacy2' }]);
    expect(result[0].taskKey).toBe('0');
    expect(result[1].taskKey).toBe('1');
  });

  it('preserves all original task fields', () => {
    const task = { id: '-Na', status: 'WIP', elapsedMs: 3600000, qcStatus: null };
    const [enriched] = tasksWithKeys({ '-Na': task });
    expect(enriched).toMatchObject(task);
    expect(enriched.taskKey).toBe('-Na');
  });

  it('does not mutate the original object', () => {
    const task = { id: '-Na' };
    tasksWithKeys({ '-Na': task });
    expect(task.taskKey).toBeUndefined();
  });
});
