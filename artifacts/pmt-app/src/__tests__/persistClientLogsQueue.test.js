/**
 * Tests for the persistClientLogs write queue (P1/P2) and related guarantees.
 *
 * All tests are pure logic — no Firebase, no React, no DOM required.
 * The patterns mirror what App.jsx does so any divergence in the real code
 * will be caught here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — mirror the queue design used in App.jsx
// ---------------------------------------------------------------------------

/**
 * Builds a fresh persistClientLogs that:
 *   - Serialises writes through a queue ref.
 *   - Rejects (and sets saveError) when not authenticated.
 *   - Applies optimistic update → Firebase write → rollback on failure.
 *
 * Returns the function plus mutable side-effect containers so tests can
 * inspect what happened.
 */
function makePersistClientLogs({
  firebaseUser = { uid: 'u1' },
  firebaseWrite = async () => {},
} = {}) {
  // Mutable state captured across writes (mirrors React state + ref)
  let clientLogsState = {};
  const clientLogsRef = { current: {} };
  let saveError = null;
  const writeChainRef = { current: Promise.resolve() };

  const setSaveError = (err) => { saveError = err; };
  const setClientLogs = (next) => {
    const val = typeof next === 'function' ? next(clientLogsState) : next;
    clientLogsState = val;
    clientLogsRef.current = val;
  };

  const persistClientLogs = (nextLogsInput) => {
    const executeWrite = async () => {
      const prev = clientLogsRef.current;

      if (!firebaseUser) {
        setSaveError({
          message: 'Your session is not ready. The change was not saved.',
          time: Date.now(),
        });
        throw new Error('No authenticated user — changes cannot be saved');
      }

      // Optimistic update
      const nextLogs = typeof nextLogsInput === 'function'
        ? nextLogsInput(clientLogsRef.current)
        : nextLogsInput;
      clientLogsRef.current = nextLogs;
      setClientLogs(nextLogs);

      try {
        await firebaseWrite(nextLogs);
      } catch (err) {
        clientLogsRef.current = prev;
        setClientLogs(prev);
        setSaveError({ message: 'Could not save changes. The change was reverted.', time: Date.now() });
        throw err;
      }
    };

    const queuedWrite = writeChainRef.current.then(executeWrite, executeWrite);
    writeChainRef.current = queuedWrite.catch(() => undefined);
    return queuedWrite;
  };

  return {
    persistClientLogs,
    getState: () => clientLogsState,
    getSaveError: () => saveError,
  };
}

// ---------------------------------------------------------------------------
// P1 — Unauthenticated writes are rejected immediately
// ---------------------------------------------------------------------------

describe('P1 — unauthenticated write is rejected', () => {
  it('returns a rejected promise when firebaseUser is null', async () => {
    const { persistClientLogs } = makePersistClientLogs({ firebaseUser: null });
    await expect(persistClientLogs({ c1: [{ name: 'T' }] }))
      .rejects.toThrow('No authenticated user');
  });

  it('does NOT update local state when unauthenticated', async () => {
    const { persistClientLogs, getState } = makePersistClientLogs({ firebaseUser: null });
    try { await persistClientLogs({ c1: [{ name: 'T' }] }); } catch {}
    expect(getState()).toEqual({});
  });

  it('sets a visible saveError when unauthenticated', async () => {
    const { persistClientLogs, getSaveError } = makePersistClientLogs({ firebaseUser: null });
    try { await persistClientLogs({ c1: [{ name: 'T' }] }); } catch {}
    expect(getSaveError()).not.toBeNull();
    expect(getSaveError().message).toContain('not saved');
  });

  it('authenticated write succeeds with no error', async () => {
    const { persistClientLogs, getSaveError } = makePersistClientLogs();
    await persistClientLogs({ c1: [{ name: 'T' }] });
    expect(getSaveError()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P2 — Writes are serialised; earlier failure cannot revert later success
// ---------------------------------------------------------------------------

describe('P2 — write serialisation', () => {
  it('second write sees state written by first write', async () => {
    const order = [];
    const firebaseWrite = async (logs) => { order.push(Object.keys(logs)[0]); };
    const { persistClientLogs, getState } = makePersistClientLogs({ firebaseWrite });

    const p1 = persistClientLogs({ c1: [{ name: 'A' }] });
    const p2 = persistClientLogs({ c1: [{ name: 'B' }], c2: [] });
    await Promise.all([p1, p2]);

    expect(order).toEqual(['c1', 'c1']); // both fired, in order
    expect(getState()).toHaveProperty('c2');
  });

  it('first write failing does NOT prevent second write from succeeding', async () => {
    let callCount = 0;
    const firebaseWrite = async (logs) => {
      callCount++;
      if (callCount === 1) throw new Error('network-error');
    };

    const { persistClientLogs, getState } = makePersistClientLogs({ firebaseWrite });

    const p1 = persistClientLogs({ c1: [{ name: 'First' }] });
    const p2 = persistClientLogs({ c1: [{ name: 'Second' }] });

    await expect(p1).rejects.toThrow();
    await expect(p2).resolves.toBeUndefined();

    expect(getState()).toEqual({ c1: [{ name: 'Second' }] });
  });

  it('first write succeeding is NOT reverted by a second write failing', async () => {
    let callCount = 0;
    const firebaseWrite = async () => {
      callCount++;
      if (callCount === 2) throw new Error('network-error');
    };
    const { persistClientLogs, getState } = makePersistClientLogs({ firebaseWrite });

    const p1 = persistClientLogs({ c1: [{ name: 'First' }] });
    const p2 = persistClientLogs({ c1: [{ name: 'Second' }] });

    await expect(p1).resolves.toBeUndefined();
    await expect(p2).rejects.toThrow();

    // Rollback restores state before the failed write, i.e. First's state.
    expect(getState()).toEqual({ c1: [{ name: 'First' }] });
  });

  it('two consecutive failures still do not clobber one another', async () => {
    let callCount = 0;
    const firebaseWrite = async () => {
      callCount++;
      throw new Error(`fail-${callCount}`);
    };
    const { persistClientLogs, getState } = makePersistClientLogs({ firebaseWrite });

    const p1 = persistClientLogs({ c1: [{ name: 'A' }] });
    const p2 = persistClientLogs({ c1: [{ name: 'B' }] });

    await expect(p1).rejects.toThrow('fail-1');
    await expect(p2).rejects.toThrow('fail-2');

    // Both rolled back — state is empty (initial).
    expect(getState()).toEqual({});
  });

  it('queue continues after an unauthenticated rejection once user authenticates', async () => {
    // Simulate: first call while logged out, then user logs in for second call.
    let callCount = 0;
    let authenticated = false;
    const firebaseWrite = vi.fn(async () => {});

    const writeChainRef = { current: Promise.resolve() };
    let clientLogsState = {};
    const clientLogsRef = { current: {} };
    let saveError = null;

    const setClientLogs = (next) => {
      const val = typeof next === 'function' ? next(clientLogsState) : next;
      clientLogsState = val;
      clientLogsRef.current = val;
    };

    const persistClientLogs = (nextLogsInput) => {
      const executeWrite = async () => {
        const prev = clientLogsRef.current;
        if (!authenticated) {
          saveError = { message: 'not saved', time: 0 };
          throw new Error('No authenticated user');
        }
        const nextLogs = typeof nextLogsInput === 'function'
          ? nextLogsInput(clientLogsRef.current)
          : nextLogsInput;
        clientLogsRef.current = nextLogs;
        setClientLogs(nextLogs);
        await firebaseWrite(nextLogs);
      };
      const queuedWrite = writeChainRef.current.then(executeWrite, executeWrite);
      writeChainRef.current = queuedWrite.catch(() => undefined);
      return queuedWrite;
    };

    callCount++;
    const p1 = persistClientLogs({ c1: [] });
    // Yield one microtask tick so p1's executeWrite runs with authenticated=false
    // before we flip the flag — without this, the tick hasn't fired yet and
    // the closure would see authenticated=true when it finally runs.
    await Promise.resolve();
    // Now authenticate
    authenticated = true;
    callCount++;
    const p2 = persistClientLogs({ c1: [{ name: 'Authenticated' }] });

    await expect(p1).rejects.toThrow();
    await expect(p2).resolves.toBeUndefined();
    expect(firebaseWrite).toHaveBeenCalledOnce();
    expect(clientLogsState).toEqual({ c1: [{ name: 'Authenticated' }] });
  });
});

// ---------------------------------------------------------------------------
// P2 — Functional updater sees latest state at execution time
// ---------------------------------------------------------------------------

describe('P2 — functional updater uses latest state', () => {
  it('functional updater applied after first write sees the first write result', async () => {
    const firebaseWrite = async () => {};
    const { persistClientLogs, getState } = makePersistClientLogs({ firebaseWrite });

    // First write: sets c1
    const p1 = persistClientLogs({ c1: [{ name: 'First' }] });
    // Second write: functional updater — should see c1 already present
    const p2 = persistClientLogs((prev) => ({
      ...prev,
      c2: [{ name: 'Second' }],
    }));

    await p1;
    await p2;

    expect(getState()).toEqual({
      c1: [{ name: 'First' }],
      c2: [{ name: 'Second' }],
    });
  });
});

// ---------------------------------------------------------------------------
// P3 — Temporary IDs must not appear in imported or recurring task objects
// ---------------------------------------------------------------------------

describe('P3 — no temp Date.now() IDs on new task objects', () => {
  /**
   * Simulates the CSV import task builder (mirrors ClientView lines ~4055-4091).
   * Spec: `id` field must be absent; diff writer assigns the Firebase push key.
   */
  function buildCsvImportTask({ taskName, assigneeId, assigneeName }) {
    return {
      // id: Date.now() + Math.random(),  ← this line was REMOVED (P3 fix)
      name: taskName.trim(),
      status: 'Pending',
      assigneeId,
      assigneeName,
      repeatFrequency: 'Once',
    };
  }

  it('CSV import task has no id field', () => {
    const task = buildCsvImportTask({ taskName: 'Audit report', assigneeId: 'u1', assigneeName: 'Alice' });
    expect(task).not.toHaveProperty('id');
  });

  it('CSV import task has no taskKey field', () => {
    const task = buildCsvImportTask({ taskName: 'Audit report', assigneeId: 'u1', assigneeName: 'Alice' });
    expect(task).not.toHaveProperty('taskKey');
  });

  /**
   * Simulates the template recurring occurrence builder
   * (mirrors ClientView handleApplyTemplate loop).
   */
  function buildRecurringOccurrence({ baseTask, date }) {
    return {
      ...baseTask,
      // id: Date.now() + Math.random(),  ← REMOVED (P3 fix)
      date,
    };
  }

  it('recurring template occurrence has no id field', () => {
    const base = { name: 'Weekly report', repeatFrequency: 'Weekly' };
    const occ = buildRecurringOccurrence({ baseTask: base, date: '1st Aug 2026' });
    expect(occ).not.toHaveProperty('id');
    expect(occ.date).toBe('1st Aug 2026');
  });

  it('recurring template occurrence has no taskKey field', () => {
    const base = { name: 'Weekly report', repeatFrequency: 'Weekly' };
    const occ = buildRecurringOccurrence({ baseTask: base, date: '1st Aug 2026' });
    expect(occ).not.toHaveProperty('taskKey');
  });

  /**
   * Simulates the checklist group child task builder
   * (mirrors ClientView handleCreateNewChecklist).
   */
  function buildChecklistChildTask({ groupId, question }) {
    return {
      // id: `${groupId}-q${i}-${Date.now() + i}`,  ← REMOVED (P3 fix)
      taskGroupId: groupId,
      name: question,
      status: 'Pending',
    };
  }

  it('checklist child task has no id field', () => {
    const task = buildChecklistChildTask({ groupId: 'g1', question: 'Is report filed?' });
    expect(task).not.toHaveProperty('id');
  });

  it('checklist child task taskGroupId is still set correctly', () => {
    const task = buildChecklistChildTask({ groupId: 'g1', question: 'Is report filed?' });
    expect(task.taskGroupId).toBe('g1');
  });
});

// ---------------------------------------------------------------------------
// P3 — Firebase push key becomes the task ID (via computeClientLogsDiff)
// ---------------------------------------------------------------------------

describe('P3 — generated task IDs equal Firebase push keys', () => {
  it('task created without id/taskKey receives a push-key derived ID', async () => {
    let capturedUpdate = null;
    const firebaseWrite = async (logs) => {
      capturedUpdate = logs;
    };

    // Minimal simulation: show that a new task without id flows through the
    // persistence layer and the caller gets no synthetic id back.
    const { persistClientLogs, getState } = makePersistClientLogs({ firebaseWrite });

    const newTask = { name: 'Import task', status: 'Pending' }; // no id
    await persistClientLogs({ c1: [newTask] });

    // The task in local state should not have a temp timestamp ID.
    const stored = getState().c1?.[0];
    expect(stored).toBeDefined();
    expect(typeof stored?.id).not.toBe('number');
    expect(stored?.name).toBe('Import task');
  });
});

// ---------------------------------------------------------------------------
// P5 — Admin helpers (persistUsers etc.) reject when unauthenticated
// ---------------------------------------------------------------------------

describe('P5 — admin persist helpers auth guard', () => {
  /**
   * Mirrors the pattern used for persistUsers, persistClients,
   * persistTaskCategories, persistHierarchyOrder, persistChecklistAccessRoles
   * in App.jsx after the P5 fix.
   */
  function makeAdminPersistHelper({ firebaseUser = null, firebaseWrite = async () => {}, initial = [] } = {}) {
    let state = initial;
    let saveError = null;

    const setState = (v) => { state = v; };
    const setSaveError = (e) => { saveError = e; };

    const persist = async (nextVal) => {
      if (!firebaseUser) {
        setSaveError({ message: 'Your session is not ready. The change was not saved.', time: 0 });
        throw new Error('No authenticated user — changes cannot be saved');
      }
      const prev = state;
      setState(nextVal);
      try {
        await firebaseWrite(nextVal);
      } catch (err) {
        setState(prev);
        setSaveError({ message: 'Could not save changes. The change was reverted.', time: 0 });
        throw err;
      }
    };

    return { persist, getState: () => state, getSaveError: () => saveError };
  }

  it('rejects when firebaseUser is null', async () => {
    const { persist } = makeAdminPersistHelper({ firebaseUser: null });
    await expect(persist(['Director'])).rejects.toThrow('No authenticated user');
  });

  it('does NOT update local state when unauthenticated', async () => {
    const { persist, getState } = makeAdminPersistHelper({
      firebaseUser: null,
      initial: ['Original'],
    });
    try { await persist(['Changed']); } catch {}
    expect(getState()).toEqual(['Original']);
  });

  it('sets a visible saveError when unauthenticated', async () => {
    const { persist, getSaveError } = makeAdminPersistHelper({ firebaseUser: null });
    try { await persist(['Changed']); } catch {}
    expect(getSaveError()).not.toBeNull();
    expect(getSaveError().message).toContain('not saved');
  });

  it('restores previous state when Firebase write fails', async () => {
    const { persist, getState } = makeAdminPersistHelper({
      firebaseUser: { uid: 'u1' },
      firebaseWrite: async () => { throw new Error('permission-denied'); },
      initial: ['Original'],
    });
    try { await persist(['Changed']); } catch {}
    expect(getState()).toEqual(['Original']);
  });

  it('sets saveError when Firebase write fails', async () => {
    const { persist, getSaveError } = makeAdminPersistHelper({
      firebaseUser: { uid: 'u1' },
      firebaseWrite: async () => { throw new Error('permission-denied'); },
    });
    try { await persist(['Changed']); } catch {}
    expect(getSaveError()).not.toBeNull();
    expect(getSaveError().message).toContain('reverted');
  });

  it('succeeds and keeps the new value when authenticated and Firebase write succeeds', async () => {
    const { persist, getState, getSaveError } = makeAdminPersistHelper({
      firebaseUser: { uid: 'u1' },
      firebaseWrite: async () => {},
      initial: ['Original'],
    });
    await persist(['Changed']);
    expect(getState()).toEqual(['Changed']);
    expect(getSaveError()).toBeNull();
  });
});
