/**
 * Tests for computeClientLogsDiff — the pure diff core of persistClientLogs.
 *
 * No Firebase, no React, no DOM required. Every test uses a simple counter-based
 * generatePushKey so keys are deterministic and easy to assert.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeClientLogsDiff, sanitizeForFirebase } from '../lib/persistClientLogsDiff.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a fresh push-key generator whose keys are '-Ktest0', '-Ktest1', … */
function makeKeyGen() {
  let counter = 0;
  return () => `-Ktest${counter++}`;
}

/** Shorthand: run the diff with a no-op key generator (tests that don't need new tasks). */
function diff(prev, next) {
  return computeClientLogsDiff(prev, next, makeKeyGen());
}

// ---------------------------------------------------------------------------
// sanitizeForFirebase
// ---------------------------------------------------------------------------

describe('sanitizeForFirebase', () => {
  it('replaces undefined with null', () => {
    expect(sanitizeForFirebase(undefined)).toBe(null);
  });

  it('leaves null unchanged', () => {
    expect(sanitizeForFirebase(null)).toBe(null);
  });

  it('leaves primitives unchanged', () => {
    expect(sanitizeForFirebase(42)).toBe(42);
    expect(sanitizeForFirebase('hello')).toBe('hello');
    expect(sanitizeForFirebase(true)).toBe(true);
  });

  it('replaces undefined values inside an object', () => {
    const result = sanitizeForFirebase({ a: 1, b: undefined });
    expect(result).toEqual({ a: 1, b: null });
  });

  it('handles nested objects recursively', () => {
    const result = sanitizeForFirebase({ outer: { inner: undefined } });
    expect(result).toEqual({ outer: { inner: null } });
  });

  it('handles arrays recursively', () => {
    const result = sanitizeForFirebase([undefined, 1, undefined]);
    expect(result).toEqual([null, 1, null]);
  });
});

// ---------------------------------------------------------------------------
// (a) Unchanged clients produce no Firebase writes
// ---------------------------------------------------------------------------

describe('unchanged clients — no writes', () => {
  it('produces empty multiPathUpdate when nothing changed', () => {
    const tasks = [{ taskKey: '-Ka', id: '-Ka', title: 'Task A' }];
    const prev = { client1: tasks };
    // Pass the SAME reference so reference-equality check short-circuits
    const { multiPathUpdate, finalLogs } = diff(prev, { client1: tasks });
    expect(multiPathUpdate).toEqual({});
    expect(finalLogs.client1).toBe(tasks); // reference preserved
  });

  it('skips unchanged client even when other clients changed', () => {
    const unchangedTasks = [{ taskKey: '-Ku', id: '-Ku', title: 'Unchanged' }];
    const prev = {
      clientUnchanged: unchangedTasks,
      clientChanged: [{ taskKey: '-Kc', id: '-Kc', title: 'Old' }],
    };
    const next = {
      clientUnchanged: unchangedTasks, // same reference
      clientChanged: [{ taskKey: '-Kc', id: '-Kc', title: 'New' }], // changed
    };
    const { multiPathUpdate } = diff(prev, next);
    // Only the changed client should appear in the update
    const affectedPaths = Object.keys(multiPathUpdate);
    expect(affectedPaths.every(p => p.startsWith('clientLogs/clientChanged/'))).toBe(true);
    expect(affectedPaths.some(p => p.startsWith('clientLogs/clientUnchanged/'))).toBe(false);
  });

  it('produces empty multiPathUpdate for fully identical clientLogs', () => {
    const prev = {
      c1: [{ taskKey: '-Ka', id: '-Ka', status: 'WIP' }],
      c2: [{ taskKey: '-Kb', id: '-Kb', status: 'Done' }],
    };
    const { multiPathUpdate } = diff(prev, prev); // identical references
    expect(multiPathUpdate).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// (b) Only modified fields are written
// ---------------------------------------------------------------------------

describe('field-level diff — only changed fields written', () => {
  it('writes only the field that changed', () => {
    const prev = {
      c1: [{ taskKey: '-Ka', id: '-Ka', title: 'Task', status: 'WIP', priority: 'High' }],
    };
    const next = {
      c1: [{ taskKey: '-Ka', id: '-Ka', title: 'Task', status: 'Done', priority: 'High' }],
    };
    const { multiPathUpdate } = diff(prev, next);
    expect(Object.keys(multiPathUpdate)).toHaveLength(1);
    expect(multiPathUpdate['clientLogs/c1/-Ka/status']).toBe('Done');
  });

  it('does not write the taskKey field to Firebase', () => {
    const prev = { c1: [{ taskKey: '-Ka', id: '-Ka', title: 'Old' }] };
    const next = { c1: [{ taskKey: '-Ka', id: '-Ka', title: 'New' }] };
    const { multiPathUpdate } = diff(prev, next);
    const paths = Object.keys(multiPathUpdate);
    expect(paths.some(p => p.endsWith('/taskKey'))).toBe(false);
    expect(paths).toContain('clientLogs/c1/-Ka/title');
  });

  it('writes multiple changed fields in one update', () => {
    const prev = {
      c1: [{ taskKey: '-Ka', id: '-Ka', status: 'WIP', assignee: 'Alice', dueDate: '2026-07-01' }],
    };
    const next = {
      c1: [{ taskKey: '-Ka', id: '-Ka', status: 'Done', assignee: 'Bob', dueDate: '2026-07-01' }],
    };
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/c1/-Ka/status']).toBe('Done');
    expect(multiPathUpdate['clientLogs/c1/-Ka/assignee']).toBe('Bob');
    expect('clientLogs/c1/-Ka/dueDate' in multiPathUpdate).toBe(false);
  });

  it('handles deep-equality checks for object-valued fields', () => {
    const meta = { tag: 'urgent' };
    const prev = { c1: [{ taskKey: '-Ka', id: '-Ka', meta }] };
    // nextLogs uses a structurally identical but reference-different object
    const next = { c1: [{ taskKey: '-Ka', id: '-Ka', meta: { tag: 'urgent' } }] };
    const { multiPathUpdate } = diff(prev, next);
    expect('clientLogs/c1/-Ka/meta' in multiPathUpdate).toBe(false);
  });

  it('writes the new value when an object field changed', () => {
    const prev = { c1: [{ taskKey: '-Ka', id: '-Ka', meta: { tag: 'low' } }] };
    const next = { c1: [{ taskKey: '-Ka', id: '-Ka', meta: { tag: 'urgent' } }] };
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/c1/-Ka/meta']).toEqual({ tag: 'urgent' });
  });

  it('sanitizes undefined field values as null', () => {
    const prev = { c1: [{ taskKey: '-Ka', id: '-Ka', note: 'hi' }] };
    const next = { c1: [{ taskKey: '-Ka', id: '-Ka', note: undefined }] };
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/c1/-Ka/note']).toBe(null);
  });

  it('does not touch tasks in the same bucket that were not changed', () => {
    const taskA = { taskKey: '-Ka', id: '-Ka', title: 'A' };
    const prev = {
      c1: [
        taskA,
        { taskKey: '-Kb', id: '-Kb', title: 'B old' },
      ],
    };
    const next = {
      c1: [
        taskA, // same reference
        { taskKey: '-Kb', id: '-Kb', title: 'B new' },
      ],
    };
    const { multiPathUpdate } = diff(prev, next);
    const paths = Object.keys(multiPathUpdate);
    expect(paths.some(p => p.includes('/-Ka/'))).toBe(false);
    expect(paths).toContain('clientLogs/c1/-Kb/title');
  });
});

// ---------------------------------------------------------------------------
// (c) Deleted tasks produce null writes
// ---------------------------------------------------------------------------

describe('deleted tasks — null writes', () => {
  it('writes null at the task path when a task is removed from a bucket', () => {
    const prev = {
      c1: [
        { taskKey: '-Ka', id: '-Ka', title: 'Keep' },
        { taskKey: '-Kb', id: '-Kb', title: 'Delete me' },
      ],
    };
    const next = {
      c1: [{ taskKey: '-Ka', id: '-Ka', title: 'Keep' }],
    };
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/c1/-Kb']).toBe(null);
  });

  it('writes null for every task in a cleared bucket', () => {
    const prev = {
      c1: [
        { taskKey: '-Ka', id: '-Ka', title: 'A' },
        { taskKey: '-Kb', id: '-Kb', title: 'B' },
      ],
    };
    const next = { c1: [] };
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/c1/-Ka']).toBe(null);
    expect(multiPathUpdate['clientLogs/c1/-Kb']).toBe(null);
  });

  it('writes null for every task when an entire client is removed', () => {
    const prev = {
      clientGone: [
        { taskKey: '-Kx', id: '-Kx', title: 'X' },
        { taskKey: '-Ky', id: '-Ky', title: 'Y' },
      ],
    };
    const next = {}; // clientGone removed entirely
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/clientGone/-Kx']).toBe(null);
    expect(multiPathUpdate['clientLogs/clientGone/-Ky']).toBe(null);
  });

  it('null-writes fields that were removed from an existing task', () => {
    const prev = {
      c1: [{ taskKey: '-Ka', id: '-Ka', title: 'Task', elapsedMs: 3600000 }],
    };
    const next = {
      c1: [{ taskKey: '-Ka', id: '-Ka', title: 'Task' }], // elapsedMs removed
    };
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/c1/-Ka/elapsedMs']).toBe(null);
  });

  it('does not write non-null values for unchanged sibling tasks when one is deleted', () => {
    const taskA = { taskKey: '-Ka', id: '-Ka', title: 'A', status: 'WIP' };
    const prev = {
      c1: [taskA, { taskKey: '-Kb', id: '-Kb', title: 'B' }],
    };
    const next = {
      c1: [taskA], // B deleted, A unchanged (same reference)
    };
    const { multiPathUpdate } = diff(prev, next);
    expect(multiPathUpdate['clientLogs/c1/-Kb']).toBe(null);
    // A is reference-equal so it must not appear at all
    const pathsForA = Object.keys(multiPathUpdate).filter(p => p.includes('/-Ka'));
    expect(pathsForA).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (d) New tasks get a push key assigned synchronously
// ---------------------------------------------------------------------------

describe('new tasks — push key assigned synchronously', () => {
  it('assigns a push key to a task that has no taskKey', () => {
    const prev = {};
    const next = {
      c1: [{ title: 'Brand new task', status: 'Pending' }], // no taskKey
    };
    const keyGen = makeKeyGen();
    const { finalLogs, newTaskWrites } = computeClientLogsDiff(prev, next, keyGen);

    expect(finalLogs.c1).toHaveLength(1);
    expect(finalLogs.c1[0].taskKey).toBe('-Ktest0');
    expect(finalLogs.c1[0].id).toBe('-Ktest0');
  });

  it('records createdTasks metadata for each new task', () => {
    const prev = {};
    const next = {
      c1: [
        { title: 'Task 1' }, // no taskKey
        { title: 'Task 2' }, // no taskKey
      ],
    };
    const { createdTasks, multiPathUpdate } = computeClientLogsDiff(prev, next, makeKeyGen());
    // Both new tasks tracked in createdTasks
    expect(createdTasks).toHaveLength(2);
    expect(createdTasks[0].taskKey).toBe('-Ktest0');
    expect(createdTasks[1].taskKey).toBe('-Ktest1');
    // Both new tasks go directly into multiPathUpdate for one atomic write
    expect(multiPathUpdate['clientLogs/c1/-Ktest0']).toBeTruthy();
    expect(multiPathUpdate['clientLogs/c1/-Ktest1']).toBeTruthy();
  });

  it('new task in multiPathUpdate has id and taskKey set to push key', () => {
    const prev = {};
    const next = { c1: [{ title: 'T', status: 'WIP' }] };
    const { multiPathUpdate } = computeClientLogsDiff(prev, next, makeKeyGen());
    const stored = multiPathUpdate['clientLogs/c1/-Ktest0'];
    expect(stored.id).toBe('-Ktest0');
    expect(stored.taskKey).toBe('-Ktest0');
  });

  it('new task APPEARS in multiPathUpdate (atomic write — no separate set() needed)', () => {
    const prev = {};
    const next = { c1: [{ title: 'New' }] };
    const { multiPathUpdate } = computeClientLogsDiff(prev, next, makeKeyGen());
    const paths = Object.keys(multiPathUpdate);
    // The new task IS in multiPathUpdate so creates and updates go in one update()
    expect(paths.some(p => p.startsWith('clientLogs/c1/-Ktest0'))).toBe(true);
  });

  it('correctly handles mix of new and existing tasks in the same bucket', () => {
    const existing = { taskKey: '-Kexist', id: '-Kexist', title: 'Existing', status: 'WIP' };
    const prev = { c1: [existing] };
    const next = {
      c1: [
        { ...existing, status: 'Done' }, // changed existing task
        { title: 'Brand new' },            // new task
      ],
    };
    const { multiPathUpdate, createdTasks, finalLogs } = computeClientLogsDiff(
      prev, next, makeKeyGen()
    );

    // existing task: only status changed — one field path
    expect(multiPathUpdate['clientLogs/c1/-Kexist/status']).toBe('Done');
    expect(Object.keys(multiPathUpdate).filter(p => p.includes('-Kexist'))).toHaveLength(1);

    // new task: in multiPathUpdate for atomic write
    expect(createdTasks).toHaveLength(1);
    expect(multiPathUpdate['clientLogs/c1/-Ktest0']).toBeTruthy();

    // finalLogs has both tasks
    expect(finalLogs.c1).toHaveLength(2);
    expect(finalLogs.c1[1].taskKey).toBe('-Ktest0');
  });

  it('generatePushKey receives the client id as argument', () => {
    const capturedCids = [];
    const keyGen = (cid) => { capturedCids.push(cid); return `-K${cid}0`; };
    const prev = {};
    const next = {
      alpha: [{ title: 'T1' }],
      beta:  [{ title: 'T2' }],
    };
    computeClientLogsDiff(prev, next, keyGen);
    expect(capturedCids).toContain('alpha');
    expect(capturedCids).toContain('beta');
  });
});

// ---------------------------------------------------------------------------
// (e) Functional updater pattern  (prev => ...)
// ---------------------------------------------------------------------------

describe('functional updater pattern', () => {
  it('resolves a functional updater against prev before diffing', () => {
    const task = { taskKey: '-Ka', id: '-Ka', title: 'Old' };
    const prev = { c1: [task] };

    const updater = (p) => ({
      ...p,
      c1: [{ ...task, title: 'New via updater' }],
    });

    const { multiPathUpdate } = computeClientLogsDiff(prev, updater, makeKeyGen());
    expect(multiPathUpdate['clientLogs/c1/-Ka/title']).toBe('New via updater');
  });

  it('functional updater adding a new client bucket', () => {
    const prev = {};
    const updater = (p) => ({ ...p, newClient: [{ title: 'Fresh task' }] });
    const { createdTasks, multiPathUpdate } = computeClientLogsDiff(prev, updater, makeKeyGen());
    expect(createdTasks).toHaveLength(1);
    expect(createdTasks[0].clientId).toBe('newClient');
    // New task path is in multiPathUpdate
    const newPath = Object.keys(multiPathUpdate).find(p => p.startsWith('clientLogs/newClient/'));
    expect(newPath).toBeTruthy();
  });

  it('functional updater removing a client bucket', () => {
    const prev = { gone: [{ taskKey: '-Kg', id: '-Kg', title: 'G' }] };
    const updater = ({ gone: _removed, ...rest }) => rest; // eslint-disable-line no-unused-vars
    const { multiPathUpdate } = computeClientLogsDiff(prev, updater, makeKeyGen());
    expect(multiPathUpdate['clientLogs/gone/-Kg']).toBe(null);
  });

  it('functional updater with no changes produces empty multiPathUpdate', () => {
    const prev = { c1: [{ taskKey: '-Ka', id: '-Ka', title: 'Same' }] };
    const updater = (p) => p; // identity — returns same reference
    const { multiPathUpdate, createdTasks } = computeClientLogsDiff(prev, updater, makeKeyGen());
    expect(multiPathUpdate).toEqual({});
    expect(createdTasks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge / regression cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('tasks that arrived from Firebase listener (have key but not in prev) are not echoed', () => {
    const prev = { c1: [] };
    const next = { c1: [{ taskKey: '-KlistenerArrival', id: '-KlistenerArrival', title: 'Echo?' }] };
    const { multiPathUpdate, createdTasks } = diff(prev, next);
    expect(Object.keys(multiPathUpdate)).toHaveLength(0);
    expect(createdTasks).toHaveLength(0);
  });

  it('completely empty prev and empty next produce no writes', () => {
    const { multiPathUpdate, createdTasks } = diff({}, {});
    expect(multiPathUpdate).toEqual({});
    expect(createdTasks).toHaveLength(0);
  });

  it('finalLogs for unchanged client retains original array reference', () => {
    const original = [{ taskKey: '-Ka', id: '-Ka', title: 'T' }];
    const prev = { c1: original };
    const { finalLogs } = diff(prev, { c1: original });
    expect(finalLogs.c1).toBe(original);
  });

  it('handles bucket with null/undefined tasks gracefully', () => {
    const prev = { c1: [{ taskKey: '-Ka', id: '-Ka', title: 'A' }] };
    // Defensive: some code paths may include null slots
    const next = { c1: [{ taskKey: '-Ka', id: '-Ka', title: 'A' }, null] };
    expect(() => diff(prev, next)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// P9 — null position filtering (P6 fix)
// ---------------------------------------------------------------------------

describe('null position filtering (P6)', () => {
  it('null array position generates no Firebase write path', () => {
    const tA = { taskKey: '-Ka', id: '-Ka', title: 'A' };
    const prev = { c1: [tA] };
    // null in next bucket alongside an unchanged task
    const next = { c1: [null, tA] };
    const { multiPathUpdate } = diff(prev, next);
    // tA is unchanged — no writes; null generates no path
    expect(Object.keys(multiPathUpdate)).toHaveLength(0);
    // Guard: no path that encodes 'null' as a segment
    expect(Object.keys(multiPathUpdate).some(p => p.includes('/null'))).toBe(false);
  });

  it('null position is absent from finalLogs', () => {
    const tA = { taskKey: '-Ka', id: '-Ka', title: 'A' };
    const prev = { c1: [tA] };
    const next = { c1: [null, tA] };
    const { finalLogs } = diff(prev, next);
    expect(finalLogs.c1).not.toContain(null);
    expect(finalLogs.c1).toHaveLength(1);
    expect(finalLogs.c1[0].taskKey).toBe('-Ka');
  });

  it('deleting a real keyed task alongside null positions still generates deletion path', () => {
    const tA = { taskKey: '-Ka', id: '-Ka', title: 'A' };
    const tB = { taskKey: '-Kb', id: '-Kb', title: 'B' };
    const prev = { c1: [tA, tB] };
    // null + keep tA, remove tB
    const next = { c1: [null, tA] };
    const { multiPathUpdate, finalLogs } = diff(prev, next);
    // tB was deleted — must generate a null write path
    expect(multiPathUpdate['clientLogs/c1/-Kb']).toBe(null);
    // finalLogs must not contain the null slot
    expect(finalLogs.c1).not.toContain(null);
    expect(finalLogs.c1).toHaveLength(1);
    expect(finalLogs.c1[0].taskKey).toBe('-Ka');
  });

  it('filtering nulls does not alter valid task keys or their write paths', () => {
    const tA = { taskKey: '-Ka', id: '-Ka', title: 'Old' };
    const prev = { c1: [tA] };
    // null before a changed tA
    const next = { c1: [null, { taskKey: '-Ka', id: '-Ka', title: 'New' }] };
    const { multiPathUpdate } = diff(prev, next);
    // The title field changed — exactly one write path
    expect(multiPathUpdate['clientLogs/c1/-Ka/title']).toBe('New');
    // No path that encodes null
    expect(Object.keys(multiPathUpdate).every(p => !p.includes('/null'))).toBe(true);
  });

  it('multiple null positions in a bucket produce no writes and empty finalLogs bucket', () => {
    const prev = {};
    const next = { c1: [null, null, null] };
    const { multiPathUpdate, finalLogs } = diff(prev, next);
    // No task writes — no new tasks were created
    expect(Object.keys(multiPathUpdate)).toHaveLength(0);
    expect(finalLogs.c1).toHaveLength(0);
  });
});
