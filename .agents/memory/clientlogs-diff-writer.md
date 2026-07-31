---
name: clientLogs diff writer — atomic writes & test API
description: How the persistClientLogsDiff.js diff planner works after Reliability Pass 3; what changed from the Task #142 baseline
---

## The rule
`computeClientLogsDiff()` returns `{ multiPathUpdate, finalLogs, createdTasks, updatedTasks, deletedTasks }`.

New tasks are placed directly inside `multiPathUpdate` under `clientLogs/{cid}/{pushKey}` — the old `newTaskWrites` array was removed. One `update(ref(db), multiPathUpdate)` call now covers all creates, updates, and deletes atomically.

**Why:** Separate `set()` calls for new tasks created a TOCTOU window where creates could succeed but updates fail, leaving partial state. A single `update()` is atomic.

**How to apply:** Any code that previously destructured `newTaskWrites` from the return value must be updated. Old tests that assert `newTaskWrites.toHaveLength(N)` should be rewritten to check `createdTasks` (metadata) and the presence of paths in `multiPathUpdate` instead.

## Where errors are surfaced
`persistClientLogs()` in App.jsx catches the `update()` failure and calls `setSaveError(...)`, which renders a fixed-position dismissible toast (`role="alert"`, bottom-right, z-9999). No per-view error state needed for non-awaited writes.

## Awaited writes
For operations where the caller needs to know whether Firebase succeeded:
- **Task creation**: `persistTaskCreate(clientId, taskData)` — async, throws on error; HomeView and TeamView now `await` this.
- **Task deletion**: `persistTaskDelete(clientId, taskKey)` — async, throws on error; ClientView individual-delete now awaits this. Task stays visible until Firebase confirms; on error a toast appears via `toast({ variant: 'destructive' })`.
- **Bulk delete**: still uses `setClientLogs` (diff writer); optimistic, covered by the save-error toast.

## Test files
- `src/__tests__/firebaseCollections.test.js` — 16 tests (collection helpers)
- `src/__tests__/persistClientLogsDiff.test.js` — 40 tests (diff planner, Task #142 suite updated for new API)
- `src/__tests__/clientLogDiff.test.js` — 20 scenario tests + sanitizeForFirebase suite (written in Pass 3)
- `artifacts/pmt-timer-widget/src/__tests__/offlineQueue.test.ts` — 24 tests (includes timestamp validation + elapsedMs guard)
- `pnpm test` from root runs all packages (100 tests total, all green)
