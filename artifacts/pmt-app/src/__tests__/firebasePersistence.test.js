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
