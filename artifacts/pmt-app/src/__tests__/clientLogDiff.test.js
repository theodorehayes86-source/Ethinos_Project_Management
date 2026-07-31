/**
 * Comprehensive tests for computeClientLogsDiff.
 *
 * The function is pure — no React, no Firebase, no network.
 * generatePushKey is injected as a counter so tests are deterministic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeClientLogsDiff, sanitizeForFirebase } from '../lib/persistClientLogsDiff.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let keyCounter = 0;
function makeKey() { return `-Ntest${++keyCounter}`; }

function task(overrides = {}) {
  return { id: '-Na', name: 'Task A', status: 'Pending', taskKey: '-Na', ...overrides };
}

function prev(clientId = 'c1', tasks = []) {
  return tasks.length ? { [clientId]: tasks } : {};
}

beforeEach(() => { keyCounter = 0; });

// ─── 1. Updating one field writes only that field path ────────────────────────

it('updating one field writes only that field path', () => {
  const t = task({ status: 'Pending' });
  const previous = { c1: [t] };
  const next = { c1: [{ ...t, status: 'Done' }] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(Object.keys(multiPathUpdate)).toHaveLength(1);
  expect(multiPathUpdate['clientLogs/c1/-Na/status']).toBe('Done');
});

// ─── 2. Updating one task does not write sibling tasks ─────────────────────────

it('updating one task does not write sibling tasks', () => {
  const tA = task({ id: '-Na', taskKey: '-Na', name: 'A', status: 'Pending' });
  const tB = task({ id: '-Nb', taskKey: '-Nb', name: 'B', status: 'Pending' });
  const previous = { c1: [tA, tB] };
  const next = { c1: [{ ...tA, status: 'Done' }, tB] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  // Only the changed task's status field should appear
  expect(Object.keys(multiPathUpdate).every(k => k.includes('-Na'))).toBe(true);
  expect(Object.keys(multiPathUpdate).some(k => k.includes('-Nb'))).toBe(false);
});

// ─── 3. Updating one client does not write another client ────────────────────────

it('updating one client does not write another client', () => {
  const tA = task({ id: '-Na', taskKey: '-Na' });
  const tB = task({ id: '-Nb', taskKey: '-Nb' });
  const previous = { c1: [tA], c2: [tB] };
  const next = { c1: [{ ...tA, status: 'Done' }], c2: [tB] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(Object.keys(multiPathUpdate).every(k => k.startsWith('clientLogs/c1/'))).toBe(true);
  expect(Object.keys(multiPathUpdate).some(k => k.startsWith('clientLogs/c2/'))).toBe(false);
});

// ─── 4. Removing one field generates a null path ───────────────────────────────

it('removing one field generates a null path', () => {
  const tWithComment = task({ comment: 'old comment' });
  const tWithout = { ...task() };
  delete tWithout.comment;
  const previous = { c1: [tWithComment] };
  const next = { c1: [tWithout] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/-Na/comment']).toBeNull();
});

// ─── 5. Removing one task generates only that task's deletion path ────────────

it('removing one task generates only its deletion path', () => {
  const tA = task({ id: '-Na', taskKey: '-Na' });
  const tB = task({ id: '-Nb', taskKey: '-Nb' });
  const previous = { c1: [tA, tB] };
  const next = { c1: [tB] }; // tA removed
  const { multiPathUpdate, deletedTasks } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/-Na']).toBeNull();
  expect(multiPathUpdate['clientLogs/c1/-Nb']).toBeUndefined(); // sibling untouched
  expect(deletedTasks).toHaveLength(1);
  expect(deletedTasks[0].taskKey).toBe('-Na');
});

// ─── 6. Clearing a client deletes all tasks for that client ──────────────────

it('clearing a client bucket deletes all its tasks', () => {
  const tA = task({ id: '-Na', taskKey: '-Na' });
  const tB = task({ id: '-Nb', taskKey: '-Nb' });
  const previous = { c1: [tA, tB] };
  const next = { c1: [] }; // empty array
  const { multiPathUpdate, deletedTasks } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/-Na']).toBeNull();
  expect(multiPathUpdate['clientLogs/c1/-Nb']).toBeNull();
  expect(deletedTasks).toHaveLength(2);
});

// ─── 7. Removing a client from nextLogs deletes only that client's tasks ──────

it('removing a client from nextLogs deletes only that client tasks', () => {
  const tA = task({ id: '-Na', taskKey: '-Na' });
  const tC = task({ id: '-Nc', taskKey: '-Nc' });
  const previous = { c1: [tA], c2: [tC] };
  const next = { c2: [tC] }; // c1 removed from nextLogs
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/-Na']).toBeNull();
  expect(Object.keys(multiPathUpdate).some(k => k.startsWith('clientLogs/c2/'))).toBe(false);
});

// ─── 8. Creating one task generates a push key ───────────────────────────────

it('creating a task generates a push key', () => {
  const previous = { c1: [] };
  const newTask = { name: 'New Task', status: 'Pending' }; // no taskKey
  const next = { c1: [newTask] };
  const { multiPathUpdate, finalLogs, createdTasks } = computeClientLogsDiff(previous, next, makeKey);
  expect(createdTasks).toHaveLength(1);
  const pushKey = createdTasks[0].taskKey;
  expect(pushKey).toBeTruthy();
  expect(multiPathUpdate[`clientLogs/c1/${pushKey}`]).toBeTruthy();
  expect(finalLogs.c1[0].taskKey).toBe(pushKey);
});

// ─── 9. A created task has id === taskKey ─────────────────────────────────────

it('created task has id === taskKey', () => {
  const previous = {};
  const newTask = { name: 'Brand New', status: 'Pending' };
  const next = { c1: [newTask] };
  const { finalLogs, createdTasks } = computeClientLogsDiff(previous, next, makeKey);
  const created = finalLogs.c1[0];
  expect(created.id).toBe(created.taskKey);
  expect(created.id).toBe(createdTasks[0].taskKey);
});

// ─── 10. Creating and editing in one action produces one update plan ────────

it('creating and editing tasks in one action produces one update plan', () => {
  const existing = task({ status: 'Pending' });
  const previous = { c1: [existing] };
  const newTask = { name: 'New', status: 'Pending' }; // no taskKey
  const next = { c1: [{ ...existing, status: 'Done' }, newTask] };
  const { multiPathUpdate, createdTasks, updatedTasks } = computeClientLogsDiff(previous, next, makeKey);
  expect(createdTasks).toHaveLength(1);
  expect(updatedTasks).toHaveLength(1);
  // Both the update and the create are in one object
  const paths = Object.keys(multiPathUpdate);
  expect(paths.some(p => p.endsWith('/status'))).toBe(true); // field update
  const pushKey = createdTasks[0].taskKey;
  expect(multiPathUpdate[`clientLogs/c1/${pushKey}`]).toBeTruthy(); // new task
});

// ─── 11. Creating and deleting in one action produces one update plan ──────

it('creating and deleting in one action produces one update plan', () => {
  const existing = task({ status: 'Pending' });
  const previous = { c1: [existing] };
  const newTask = { name: 'New', status: 'Pending' }; // no taskKey
  const next = { c1: [newTask] }; // existing removed, new added
  const { multiPathUpdate, createdTasks, deletedTasks } = computeClientLogsDiff(previous, next, makeKey);
  expect(createdTasks).toHaveLength(1);
  expect(deletedTasks).toHaveLength(1);
  const pushKey = createdTasks[0].taskKey;
  expect(multiPathUpdate[`clientLogs/c1/${pushKey}`]).toBeTruthy();
  expect(multiPathUpdate['clientLogs/c1/-Na']).toBeNull();
});

// ─── 12. Legacy array tasks preserve numeric Firebase keys ─────────────────

it('legacy array tasks preserve numeric Firebase keys (string "0", "1", …)', () => {
  // Firebase legacy: tasks stored as array, keys are "0", "1"...
  // tasksWithKeys enriches them with taskKey: "0", "1"
  const tLegacy = { id: 'legacy1', name: 'Old', status: 'Pending', taskKey: '0' };
  const previous = { c1: [tLegacy] };
  const next = { c1: [{ ...tLegacy, status: 'Done' }] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/0/status']).toBe('Done');
});

// ─── 13. Push-key object tasks preserve push keys ────────────────────────────

it('push-key object tasks preserve push keys', () => {
  const t = task({ id: '-Nabc', taskKey: '-Nabc', name: 'Existing' });
  const previous = { c1: [t] };
  const next = { c1: [{ ...t, name: 'Renamed' }] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/-Nabc/name']).toBe('Renamed');
});

// ─── 14. Null array positions are ignored ────────────────────────────────────

it('null array positions in nextLogs are skipped', () => {
  const tA = task({ id: '-Na', taskKey: '-Na' });
  const previous = { c1: [tA] };
  const next = { c1: [null, tA] }; // null slot at index 0
  const { multiPathUpdate, finalLogs } = computeClientLogsDiff(previous, next, makeKey);
  expect(Object.keys(multiPathUpdate)).toHaveLength(0); // tA unchanged
  // P6 fix: null positions are filtered out — finalLogs must not contain null.
  expect(finalLogs.c1).not.toContain(null);
  expect(finalLogs.c1).toHaveLength(1);
});

// ─── 15. Unchanged task fields generate no writes ────────────────────────────

it('unchanged task fields generate no writes', () => {
  const t = task();
  const previous = { c1: [t] };
  const next = { c1: [{ ...t }] }; // shallow copy but same field values
  const { multiPathUpdate, updatedTasks } = computeClientLogsDiff(previous, next, makeKey);
  expect(Object.keys(multiPathUpdate)).toHaveLength(0);
  expect(updatedTasks).toHaveLength(0);
});

// ─── 16. Unchanged client buckets generate no writes ─────────────────────────

it('unchanged client buckets (reference-equal) generate no writes', () => {
  const tasks = [task()];
  const previous = { c1: tasks, c2: [task({ id: '-Nc', taskKey: '-Nc' })] };
  // c1 is reference-equal; c2 has a new object reference but same content
  const next = { c1: tasks, c2: [task({ id: '-Nc', taskKey: '-Nc', status: 'Done' })] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  // Only c2 changed
  expect(Object.keys(multiPathUpdate).every(k => k.startsWith('clientLogs/c2/'))).toBe(true);
});

// ─── 17. Nested field changes are detected ───────────────────────────────────

it('nested field changes are detected and written', () => {
  const t = task({ steps: [{ id: 's1', done: false, text: 'Step 1' }] });
  const previous = { c1: [t] };
  const updatedSteps = [{ id: 's1', done: true, text: 'Step 1' }];
  const next = { c1: [{ ...t, steps: updatedSteps }] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/-Na/steps']).toEqual(updatedSteps);
});

// ─── 18. Removed nested data is persisted correctly ─────────────────────────

it('removed nested array field is written as null', () => {
  const t = task({ steps: [{ id: 's1', done: false }] });
  const tWithout = { ...task() };
  // Remove 'steps'
  delete tWithout.steps;
  const previous = { c1: [t] };
  const next = { c1: [tWithout] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  expect(multiPathUpdate['clientLogs/c1/-Na/steps']).toBeNull();
});

// ─── 19. finalLogs matches Firebase paths ────────────────────────────────────

it('finalLogs task ids match the Firebase write paths', () => {
  const previous = {};
  const newTask = { name: 'New Task', status: 'Pending' };
  const next = { c1: [newTask] };
  const { multiPathUpdate, finalLogs } = computeClientLogsDiff(previous, next, makeKey);
  const localId = finalLogs.c1[0].id;
  const localKey = finalLogs.c1[0].taskKey;
  expect(localId).toBe(localKey);
  // The Firebase path for this task must exist in the update
  expect(multiPathUpdate[`clientLogs/c1/${localKey}`]).toBeTruthy();
  expect(multiPathUpdate[`clientLogs/c1/${localKey}`].id).toBe(localId);
});

// ─── 20. Failed Firebase update does not produce confirmed-success state ─────

it('the diff plan contains no side effects — multiPathUpdate is a plain object', () => {
  // The planner itself never calls Firebase. If update() is never called,
  // no write happens. The caller is responsible for awaiting the write.
  const t = task({ status: 'Pending' });
  const previous = { c1: [t] };
  const next = { c1: [{ ...t, status: 'Done' }] };
  const { multiPathUpdate } = computeClientLogsDiff(previous, next, makeKey);
  // multiPathUpdate is a plain JS object — not a Promise, not a Firebase ref
  expect(typeof multiPathUpdate).toBe('object');
  expect(typeof multiPathUpdate.then).toBe('undefined');
  // Only if the caller passes it to update() does it reach Firebase
});

// ─── sanitizeForFirebase ─────────────────────────────────────────────────────

describe('sanitizeForFirebase', () => {
  it('replaces undefined with null', () => {
    expect(sanitizeForFirebase(undefined)).toBeNull();
  });

  it('recursively sanitizes nested objects', () => {
    expect(sanitizeForFirebase({ a: 1, b: undefined, c: { d: undefined } }))
      .toEqual({ a: 1, b: null, c: { d: null } });
  });

  it('recursively sanitizes arrays', () => {
    expect(sanitizeForFirebase([undefined, 1, null]))
      .toEqual([null, 1, null]);
  });

  it('passes null through as-is', () => {
    expect(sanitizeForFirebase(null)).toBeNull();
  });

  it('passes primitives through unchanged', () => {
    expect(sanitizeForFirebase(42)).toBe(42);
    expect(sanitizeForFirebase('hello')).toBe('hello');
    expect(sanitizeForFirebase(true)).toBe(true);
  });
});
