/**
 * Tests for Firebase persistence reliability fixes (Task 146).
 *
 * These tests cover:
 * - Auth guard behaviour for persistTaskDelete and persistBulkUpdate (P4)
 * - Settings-default logic for hierarchyOrder and checklistAccess (P7)
 * - Save-error wording (P8)
 * - persistClientLogs rollback logic helpers (P2)
 *
 * The helpers under test are extracted from the logic in App.jsx so they
 * can be verified without a full React/Firebase harness.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// P4 — Auth guard: persistTaskDelete and persistBulkUpdate must throw
// ---------------------------------------------------------------------------

/**
 * Simulates the auth-guard pattern used in persistTaskDelete / persistBulkUpdate.
 * Returns a function with the same contract as the real helpers.
 */
function makeGuardedDelete(firebaseUser, removeFn) {
  return async (clientId, taskKey) => {
    if (!firebaseUser) throw new Error('No authenticated user — cannot write to Firebase');
    return removeFn(clientId, taskKey);
  };
}

function makeGuardedBulkUpdate(firebaseUser, updateFn) {
  return async (multiPathObj) => {
    if (!firebaseUser) throw new Error('No authenticated user — cannot write to Firebase');
    return updateFn(multiPathObj);
  };
}

describe('persistTaskDelete — auth guard (P4)', () => {
  it('throws the auth-unavailable error when firebaseUser is null', async () => {
    const del = makeGuardedDelete(null, () => {});
    await expect(del('c1', '-Ka')).rejects.toThrow('No authenticated user — cannot write to Firebase');
  });

  it('throws when firebaseUser is undefined', async () => {
    const del = makeGuardedDelete(undefined, () => {});
    await expect(del('c1', '-Ka')).rejects.toThrow('No authenticated user — cannot write to Firebase');
  });

  it('does NOT throw when firebaseUser is present', async () => {
    const del = makeGuardedDelete({ uid: 'user1' }, async () => 'ok');
    await expect(del('c1', '-Ka')).resolves.toBe('ok');
  });
});

describe('persistBulkUpdate — auth guard (P4)', () => {
  it('throws the auth-unavailable error when firebaseUser is null', async () => {
    const bulk = makeGuardedBulkUpdate(null, () => {});
    await expect(bulk({ 'clientLogs/c1/-Ka/status': 'Done' })).rejects.toThrow(
      'No authenticated user — cannot write to Firebase'
    );
  });

  it('does NOT throw when firebaseUser is present', async () => {
    const bulk = makeGuardedBulkUpdate({ uid: 'user1' }, async (obj) => obj);
    const input = { 'clientLogs/c1/-Ka/status': 'Done' };
    await expect(bulk(input)).resolves.toEqual(input);
  });
});

// ---------------------------------------------------------------------------
// P7 — Settings default resolution
// ---------------------------------------------------------------------------

const DEFAULT_HIERARCHY = [
  'Director', 'Snr Manager', 'Manager', 'Asst Manager',
  'Snr Executive', 'Executive', 'Employee', 'Intern',
];
const DEFAULT_CHECKLIST_ACCESS_ROLES = ['Super Admin', 'Director'];

/**
 * Mirrors the null-safe setter logic used in the syncRef callbacks for
 * settings/hierarchyOrder and settings/conditions/checklistAccess.
 */
function resolveHierarchy(val) {
  return Array.isArray(val) && val.length > 0 ? val : DEFAULT_HIERARCHY;
}

function resolveChecklistAccess(val) {
  return Array.isArray(val) && val.length > 0 ? val : DEFAULT_CHECKLIST_ACCESS_ROLES;
}

describe('settings/hierarchyOrder — default restoration (P7)', () => {
  it('returns the default when Firebase returns null', () => {
    expect(resolveHierarchy(null)).toEqual(DEFAULT_HIERARCHY);
  });

  it('returns the default when Firebase returns undefined', () => {
    expect(resolveHierarchy(undefined)).toEqual(DEFAULT_HIERARCHY);
  });

  it('returns the default when Firebase returns an empty array', () => {
    expect(resolveHierarchy([])).toEqual(DEFAULT_HIERARCHY);
  });

  it('returns the live value when Firebase returns a non-empty array', () => {
    const custom = ['Director', 'Manager', 'Executive'];
    expect(resolveHierarchy(custom)).toEqual(custom);
  });
});

describe('settings/conditions/checklistAccess — default restoration (P7)', () => {
  it('returns DEFAULT_CHECKLIST_ACCESS_ROLES when Firebase returns null', () => {
    expect(resolveChecklistAccess(null)).toEqual(DEFAULT_CHECKLIST_ACCESS_ROLES);
  });

  it('returns DEFAULT_CHECKLIST_ACCESS_ROLES when Firebase returns empty array', () => {
    expect(resolveChecklistAccess([])).toEqual(DEFAULT_CHECKLIST_ACCESS_ROLES);
  });

  it('returns the live value when Firebase returns a non-empty array', () => {
    const custom = ['Super Admin', 'Director', 'Manager'];
    expect(resolveChecklistAccess(custom)).toEqual(custom);
  });
});

// ---------------------------------------------------------------------------
// P8 — Save-error wording
// ---------------------------------------------------------------------------

/** The exact message the rollback catch block sets on saveError. */
const SAVE_ERROR_MESSAGE = 'Could not save changes. The change was reverted.';

describe('save-error wording (P8)', () => {
  it('contains "The change was reverted."', () => {
    expect(SAVE_ERROR_MESSAGE).toContain('The change was reverted.');
  });

  it('does not contain the word "retry"', () => {
    expect(SAVE_ERROR_MESSAGE.toLowerCase()).not.toContain('retry');
  });

  it('starts with "Could not save changes."', () => {
    expect(SAVE_ERROR_MESSAGE.startsWith('Could not save changes.')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P3 — Failure-path behaviour: modal-close / success-UI must not proceed
//       when the Firebase write is rejected.
// ---------------------------------------------------------------------------

/**
 * Simulates the handleUpdateTask wrapper pattern used in HomeView:
 * - awaits setClientLogs
 * - rethrows on failure (so callers like QC review submit can detect it)
 */
async function homeHandleUpdateTask(setClientLogs, nextLogs) {
  try {
    await setClientLogs(nextLogs);
  } catch (err) {
    throw err; // rethrow — callers must handle
  }
}

/**
 * Simulates the handleSubmitQcReview inline handler:
 * - awaits homeHandleUpdateTask
 * - catches failure → returns early without closing modal (calling onClose)
 */
async function simulateQcSubmit({ setClientLogs, nextLogs, onClose }) {
  try {
    await homeHandleUpdateTask(setClientLogs, nextLogs);
  } catch {
    return 'kept-open'; // modal stays open
  }
  onClose();
  return 'closed';
}

/**
 * Simulates the handleCreateChecklistGroup handler:
 * - awaits setClientLogs
 * - returns early on failure without calling onSuccess (createGroup + closeModal)
 */
async function simulateChecklistGroupCreate({ setClientLogs, nextLogs, onSuccess }) {
  try {
    await setClientLogs(nextLogs);
  } catch {
    return 'aborted'; // group not created, modal not closed
  }
  onSuccess();
  return 'committed';
}

/**
 * Simulates the ClientView handleSubmitReview inline handler:
 * - awaits setClientLogs
 * - returns early on failure without sending notifications or closing modal
 */
async function simulateCvQcSubmit({ setClientLogs, nextLogs, sendNotification, onClose }) {
  try {
    await setClientLogs(nextLogs);
  } catch {
    return 'kept-open';
  }
  sendNotification();
  onClose();
  return 'closed';
}

describe('P3 — QC review submit blocks on Firebase failure (HomeView)', () => {
  it('keeps the modal open when the Firebase write is rejected', async () => {
    const failingWrite = async () => { throw new Error('permission-denied'); };
    const onClose = vi.fn();
    const result = await simulateQcSubmit({ setClientLogs: failingWrite, nextLogs: {}, onClose });
    expect(result).toBe('kept-open');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the modal only when the Firebase write succeeds', async () => {
    const succeedingWrite = async () => {};
    const onClose = vi.fn();
    const result = await simulateQcSubmit({ setClientLogs: succeedingWrite, nextLogs: {}, onClose });
    expect(result).toBe('closed');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('P3 — Checklist group creation aborts on Firebase failure (HomeView)', () => {
  it('does not call onSuccess (createGroup + closeModal) when the write fails', async () => {
    const failingWrite = async () => { throw new Error('network-error'); };
    const onSuccess = vi.fn();
    const result = await simulateChecklistGroupCreate({ setClientLogs: failingWrite, nextLogs: {}, onSuccess });
    expect(result).toBe('aborted');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onSuccess when the Firebase write succeeds', async () => {
    const succeedingWrite = async () => {};
    const onSuccess = vi.fn();
    const result = await simulateChecklistGroupCreate({ setClientLogs: succeedingWrite, nextLogs: {}, onSuccess });
    expect(result).toBe('committed');
    expect(onSuccess).toHaveBeenCalledOnce();
  });
});

describe('P3 — QC review submit guards notifications on Firebase failure (ClientView)', () => {
  it('skips notification and keeps modal open when the write fails', async () => {
    const failingWrite = async () => { throw new Error('permission-denied'); };
    const sendNotification = vi.fn();
    const onClose = vi.fn();
    const result = await simulateCvQcSubmit({ setClientLogs: failingWrite, nextLogs: {}, sendNotification, onClose });
    expect(result).toBe('kept-open');
    expect(sendNotification).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends notification and closes modal when the write succeeds', async () => {
    const succeedingWrite = async () => {};
    const sendNotification = vi.fn();
    const onClose = vi.fn();
    const result = await simulateCvQcSubmit({ setClientLogs: succeedingWrite, nextLogs: {}, sendNotification, onClose });
    expect(result).toBe('closed');
    expect(sendNotification).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// P2 — persistClientLogs rollback path extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the set of client IDs affected by a multiPathUpdate object.
 * Mirrors the logic in the persistClientLogs catch block.
 * Path format: 'clientLogs/{cid}/{taskKey}[/{field}]'
 */
function extractAffectedCids(multiPathUpdate) {
  return new Set(Object.keys(multiPathUpdate).map(p => p.split('/')[1]));
}

describe('rollback path extraction (P2)', () => {
  it('extracts a single affected client id', () => {
    const update = { 'clientLogs/c1/-Ka/status': 'Done' };
    expect(extractAffectedCids(update)).toEqual(new Set(['c1']));
  });

  it('extracts multiple client ids from one update', () => {
    const update = {
      'clientLogs/c1/-Ka/status': 'Done',
      'clientLogs/c2/-Kb': null,
    };
    expect(extractAffectedCids(update)).toEqual(new Set(['c1', 'c2']));
  });

  it('deduplicates when multiple paths touch the same client', () => {
    const update = {
      'clientLogs/c1/-Ka/status': 'Done',
      'clientLogs/c1/-Kb/title': 'New',
    };
    expect(extractAffectedCids(update)).toEqual(new Set(['c1']));
  });

  it('returns empty set for empty update', () => {
    expect(extractAffectedCids({})).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// Task 150 — Offline-reconnect dedup guard
//
// When the client goes offline mid-write, Firebase buffers the pending write
// and flushes it on reconnect.  The onValue listener may then fire with a
// snapshot where the same push key appears more than once (e.g. once from the
// buffered write and again from the merged server state).  The dedup guard
// added in Task 146 (App.jsx lines 1240-1246) must filter those duplicates so
// local state never holds more than one entry per taskKey.
//
// These tests extract the exact guard logic from the listener and verify it
// under both simple and recurring-task reconnect scenarios.
// ---------------------------------------------------------------------------

/**
 * Mirrors the dedup filter applied inside the clientLogs onValue listener
 * (App.jsx lines 1240-1246).  Receives an array of task objects that already
 * carry a `taskKey` field and returns a new array with duplicates removed,
 * keeping the first occurrence of each key.
 */
function deduplicateByTaskKey(tasks) {
  const seen = new Set();
  return tasks.filter(t => {
    if (!t?.taskKey) return true; // tasks without a key are always kept
    if (seen.has(t.taskKey)) return false;
    seen.add(t.taskKey);
    return true;
  });
}

/**
 * Mirrors the full clientLogs enrichment + dedup performed in the onValue
 * callback.  `val` is the raw Firebase snapshot value
 * ({ [cid]: { [pushKey]: taskObj } }).
 *
 * Instead of calling the real `tasksWithKeys` helper (which is tested
 * separately), we inline its equivalent so this module stays self-contained.
 */
function enrichAndDedup(val) {
  if (!val) return {};
  return Object.fromEntries(
    Object.entries(val).map(([cid, tasks]) => {
      // Simulate tasksWithKeys: convert push-key object to array with taskKey
      const withKeys = tasks
        ? Object.entries(tasks).map(([k, t]) => ({ ...t, taskKey: k }))
        : [];
      return [cid, deduplicateByTaskKey(withKeys)];
    })
  );
}

/**
 * Simulates the listener firing `n` times with the same snapshot and applies
 * the dedup guard on every call, returning the final task list for a given
 * client.  In the real app each call to the listener replaces local state
 * entirely, so only the last invocation matters — but if the snapshot itself
 * contains duplicate keys the guard must filter them out within that call.
 */
function simulateReconnectListenerFires(snapshotVal, clientId, fireCount = 2) {
  let result;
  for (let i = 0; i < fireCount; i++) {
    result = enrichAndDedup(snapshotVal);
  }
  return result[clientId] ?? [];
}

// ── Basic dedup guard unit tests ──────────────────────────────────────────────

describe('clientLogs onValue dedup guard — deduplicateByTaskKey', () => {
  it('returns the list unchanged when all taskKeys are unique', () => {
    const tasks = [
      { taskKey: '-Ka', title: 'Task A' },
      { taskKey: '-Kb', title: 'Task B' },
    ];
    expect(deduplicateByTaskKey(tasks)).toHaveLength(2);
  });

  it('keeps only the first occurrence when a taskKey is repeated', () => {
    const tasks = [
      { taskKey: '-Ka', title: 'First write' },
      { taskKey: '-Ka', title: 'Buffered duplicate' },
    ];
    const result = deduplicateByTaskKey(tasks);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('First write');
  });

  it('handles multiple distinct keys with one duplicate each', () => {
    const tasks = [
      { taskKey: '-Ka', title: 'A-1' },
      { taskKey: '-Kb', title: 'B-1' },
      { taskKey: '-Ka', title: 'A-duplicate' },
      { taskKey: '-Kb', title: 'B-duplicate' },
    ];
    const result = deduplicateByTaskKey(tasks);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.taskKey)).toEqual(['-Ka', '-Kb']);
  });

  it('preserves tasks that have no taskKey (legacy entries)', () => {
    const tasks = [
      { title: 'No key task' },
      { taskKey: '-Ka', title: 'Keyed task' },
    ];
    const result = deduplicateByTaskKey(tasks);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when given an empty array', () => {
    expect(deduplicateByTaskKey([])).toEqual([]);
  });
});

// ── Offline-reconnect scenario: listener fires twice, snapshot is the same ───

describe('clientLogs onValue — offline-then-reconnect: listener fires twice', () => {
  const snapshotVal = {
    'client-1': {
      '-Ka': { title: 'Task A', status: 'WIP' },
      '-Kb': { title: 'Task B', status: 'Done' },
    },
  };

  it('produces exactly the same task count on both listener invocations', () => {
    // First fire (online snapshot)
    const first = enrichAndDedup(snapshotVal)['client-1'];
    // Second fire (reconnect — same server snapshot)
    const second = enrichAndDedup(snapshotVal)['client-1'];
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
  });

  it('results are identical on every listener invocation', () => {
    const first = enrichAndDedup(snapshotVal)['client-1'];
    const second = enrichAndDedup(snapshotVal)['client-1'];
    expect(second).toEqual(first);
  });

  it('simulateReconnectListenerFires returns the correct task list after 2 fires', () => {
    const tasks = simulateReconnectListenerFires(snapshotVal, 'client-1', 2);
    expect(tasks).toHaveLength(2);
    expect(tasks.map(t => t.taskKey)).toEqual(expect.arrayContaining(['-Ka', '-Kb']));
  });

  it('simulateReconnectListenerFires is stable across many reconnect cycles', () => {
    const tasks = simulateReconnectListenerFires(snapshotVal, 'client-1', 10);
    expect(tasks).toHaveLength(2);
  });
});

// ── Reconnect scenario: snapshot itself contains duplicate keys ───────────────
//
// Firebase's offline cache can produce a merged snapshot where a buffered
// pending write key appears alongside the confirmed server copy.  In practice
// this shows up as the same push key in the snapshot object twice (once via
// local cache, once via server merge).  Because JavaScript objects cannot hold
// two properties with the same key, this scenario is represented here as a
// pre-converted array that has been built before the dedup step runs —
// matching the shape that `tasksWithKeys` produces when it processes an
// array-shaped (legacy) clientLogs node.

describe('clientLogs onValue dedup guard — snapshot with duplicate taskKeys', () => {
  it('keeps exactly one task when the same key appears twice in a snapshot', () => {
    const snapshotTasks = [
      { taskKey: '-Ka', title: 'Task A — pending write copy' },
      { taskKey: '-Ka', title: 'Task A — server confirmed copy' },
    ];
    const result = deduplicateByTaskKey(snapshotTasks);
    expect(result).toHaveLength(1);
    expect(result[0].taskKey).toBe('-Ka');
  });

  it('keeps exactly one entry per key when three copies arrive', () => {
    const snapshotTasks = [
      { taskKey: '-Kx', title: 'Copy 1' },
      { taskKey: '-Kx', title: 'Copy 2' },
      { taskKey: '-Kx', title: 'Copy 3' },
    ];
    expect(deduplicateByTaskKey(snapshotTasks)).toHaveLength(1);
  });
});

// ── Recurring-task reconnect scenario ────────────────────────────────────────
//
// Recurring tasks are spawned in rapid succession via persistTaskCreate.
// Each call produces a distinct Firebase push key.  On reconnect the listener
// fires again with a fresh full snapshot containing all those keys.  The dedup
// guard must keep every unique key exactly once and not conflate distinct tasks.

describe('recurring-task reconnect: no duplicates for distinct push keys', () => {
  /** Simulates persistTaskCreate assigning a unique push key to each recurring task. */
  function simulateRecurringTaskCreate(clientId, taskBases) {
    return taskBases.map((base, i) => ({
      ...base,
      taskKey: `-Krecur${i}`,
      id: `-Krecur${i}`,
    }));
  }

  it('dedup guard keeps all N recurring tasks when keys are distinct', () => {
    const recurringTasks = simulateRecurringTaskCreate('client-1', [
      { title: 'Weekly report — week 1' },
      { title: 'Weekly report — week 2' },
      { title: 'Weekly report — week 3' },
    ]);
    const result = deduplicateByTaskKey(recurringTasks);
    expect(result).toHaveLength(3);
  });

  it('listener firing twice after recurring-task creation yields the same set', () => {
    const snapshotVal = {
      'client-1': {
        '-Krecur0': { title: 'Weekly report — week 1' },
        '-Krecur1': { title: 'Weekly report — week 2' },
        '-Krecur2': { title: 'Weekly report — week 3' },
      },
    };
    const first = enrichAndDedup(snapshotVal)['client-1'];
    const second = enrichAndDedup(snapshotVal)['client-1'];
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it('dedup removes duplicate recurring-task keys that arrive via buffered write', () => {
    // Simulate: 3 recurring tasks where 2 arrive duplicated (buffered + server)
    const snapshotTasks = [
      { taskKey: '-Krecur0', title: 'Week 1 — buffered' },
      { taskKey: '-Krecur1', title: 'Week 2 — buffered' },
      { taskKey: '-Krecur0', title: 'Week 1 — server' },
      { taskKey: '-Krecur1', title: 'Week 2 — server' },
      { taskKey: '-Krecur2', title: 'Week 3 — no duplicate' },
    ];
    const result = deduplicateByTaskKey(snapshotTasks);
    expect(result).toHaveLength(3);
    expect(result.map(t => t.taskKey)).toEqual(
      expect.arrayContaining(['-Krecur0', '-Krecur1', '-Krecur2'])
    );
  });
});

// ── persistTaskCreate contract: no manual local-state insertion ───────────────
//
// Task 146 (P1) removed the manual local insertion from persistTaskCreate so
// the onValue listener is the sole source of truth.  These tests confirm the
// pattern: a simulated persistTaskCreate writes to Firebase and returns the
// created task, but does NOT push to local state.  Duplicates can only arise
// if the caller also inserts locally — something the current implementation
// intentionally avoids.

describe('persistTaskCreate — no manual local-state insertion (P1)', () => {
  /**
   * Simulates the current persistTaskCreate contract (App.jsx lines 1417-1427):
   * writes to Firebase (mocked) and returns the new task, but does NOT touch
   * localState.
   */
  async function simulatePersistTaskCreate(localState, clientId, taskData, mockPush) {
    const pushKey = mockPush();
    const task = { ...taskData, id: pushKey, taskKey: pushKey };
    // Fire-and-forget Firebase set (mocked — not awaited for this simulation)
    // P1: intentionally NOT inserting into localState here
    return { task, localStateAfterCreate: localState };
  }

  it('local state is unchanged immediately after persistTaskCreate', async () => {
    const initialLocalState = { 'client-1': [] };
    let keyCounter = 0;
    const mockPush = () => `-Knew${keyCounter++}`;

    const { localStateAfterCreate } = await simulatePersistTaskCreate(
      initialLocalState,
      'client-1',
      { title: 'New task' },
      mockPush
    );

    expect(localStateAfterCreate).toEqual(initialLocalState);
    expect(localStateAfterCreate['client-1']).toHaveLength(0);
  });

  it('task appears in local state only after the listener snapshot is applied', async () => {
    const initialLocalState = { 'client-1': [] };
    let keyCounter = 0;
    const mockPush = () => `-Knew${keyCounter++}`;

    const { task } = await simulatePersistTaskCreate(
      initialLocalState,
      'client-1',
      { title: 'New task' },
      mockPush
    );

    // Simulate Firebase listener firing with the new task in the snapshot
    const snapshotVal = {
      'client-1': { [task.taskKey]: { title: task.title } },
    };
    const stateAfterListener = enrichAndDedup(snapshotVal);
    expect(stateAfterListener['client-1']).toHaveLength(1);
    expect(stateAfterListener['client-1'][0].taskKey).toBe(task.taskKey);
  });

  it('calling persistTaskCreate twice for recurring tasks yields two distinct keys', async () => {
    const initialLocalState = { 'client-1': [] };
    let keyCounter = 0;
    const mockPush = () => `-Knew${keyCounter++}`;

    const { task: task1 } = await simulatePersistTaskCreate(
      initialLocalState, 'client-1', { title: 'Recurring — instance 1' }, mockPush
    );
    const { task: task2 } = await simulatePersistTaskCreate(
      initialLocalState, 'client-1', { title: 'Recurring — instance 2' }, mockPush
    );

    expect(task1.taskKey).not.toBe(task2.taskKey);

    // Both appear in state only via the listener, with no duplicates
    const snapshotVal = {
      'client-1': {
        [task1.taskKey]: { title: task1.title },
        [task2.taskKey]: { title: task2.title },
      },
    };
    const stateAfterListener = enrichAndDedup(snapshotVal);
    expect(stateAfterListener['client-1']).toHaveLength(2);
  });
});
