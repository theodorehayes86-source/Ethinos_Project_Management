---
name: Firebase write safety rules
description: How task reads and writes must be done to prevent data loss from concurrent edits
---

## Rules

### Timer widget — always use `taskKey`, never `taskIndex`
Tasks are keyed in Firebase by their push key. `TasksContext.tsx` uses `Object.entries()` on `rawLogs[clientId]` to populate `task.taskKey` (the actual Firebase key). All writes go to `clientLogs/${clientId}/${taskKey}`. Before this fix the field was `taskIndex` (derived array position) which pointed to the wrong task after any deletion.

**Why:** Firebase stores tasks as push-key objects; array indices are unstable after deletions or concurrent appends.

**How to apply:** Any new write in the timer widget must use `task.taskKey`, not a derived index.

### Mobile app — use `runTransaction` for task updates, `push()` for task creation
`updateTaskInFirebase(clientId, taskId, updates)` uses `runTransaction` to atomically find-and-update a task by its `id` field, handling both legacy array-shaped and new push-key-shaped data. `createTaskInFirebase(clientId, taskData)` uses `push()` to generate a stable key and sets `task.id = newRef.key`.

**Why:** Old pattern did a full client-level `set(array)` which wiped concurrent changes from other sessions.

**How to apply:** Never pass `clientLogs` to these functions (param dropped). Recurring tasks in AddTaskSheet use individual `push()` + `set()` calls per task.

### Web app — use `update()` not `set()` for clientLogs
`persistClientLogs` changed from `set(ref(db, 'clientLogs'), all)` to `update(ref(db, 'clientLogs'), all)`. Firebase `update()` does a shallow-merge of top-level keys, so editing Client A will not overwrite Client B's tasks written by another session.

**Why:** The old `set()` replaced the entire `clientLogs` tree on every task change, so two users editing different clients would race and one's write would be silently lost.

**How to apply:** For single-task operations use `persistTaskUpdate(clientId, taskKey, updates)` (task-level `update()`). Reserve `persistClientLogs` for bulk/import operations.

### Offline queue staleness
`QueuedWrite` includes `timestamp` (when enqueued). Every write payload includes `updatedAt: Date.now()`. On queue flush, if `server.updatedAt > item.timestamp` the queued write is dropped — the server is already newer. `saveQueue` now logs errors and returns a boolean instead of silently swallowing them.

### syncRef null handling (web app)
`syncRef(path, setter, emptyVal)` now always calls `setter` — including when the Firebase node is null. Pass the appropriate `emptyVal` (e.g. `{}` for clientLogs, `[]` for arrays) so deleted nodes clear local state immediately rather than leaving stale values.
