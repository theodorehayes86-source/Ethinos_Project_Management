/**
 * Pure-function core of the smart clientLogs diff writer.
 *
 * Extracted from App.jsx so it can be unit-tested independently of React,
 * Firebase, or component state.
 *
 * Usage in App.jsx:
 *   const { multiPathUpdate, finalLogs } =
 *     computeClientLogsDiff(prev, nextLogsInput, (cid) => push(ref(db, `clientLogs/${cid}`)).key);
 *   if (Object.keys(multiPathUpdate).length > 0) {
 *     await update(ref(db), multiPathUpdate);
 *   }
 */

/**
 * Recursively replaces `undefined` with `null` so Firebase won't reject the value.
 * @param {*} value
 * @returns {*}
 */
export function sanitizeForFirebase(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeForFirebase);
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, sanitizeForFirebase(v)])
  );
}

/**
 * Diffs `nextLogsInput` against `prev` and returns what needs to be written.
 *
 * All task creates, updates, and deletes within one action are collected into
 * a single `multiPathUpdate` object so they can be committed atomically with
 * one `update(ref(db), multiPathUpdate)` call. This prevents partial success
 * where some tasks are created but others fail to update.
 *
 * @param {object} prev               - clientLogsRef.current (previous state)
 * @param {object|Function} nextLogsInput
 *   Either the new clientLogs object, or a functional updater `prev => next`.
 * @param {Function} generatePushKey  - `(cid: string) => string`
 *   Supplies a new Firebase push key for a brand-new task.
 *   Must be synchronous (no network round-trip).
 *   In production: `(cid) => push(ref(db, \`clientLogs/\${cid}\`)).key`
 *   In tests: any counter / UUID function.
 *
 * @returns {{
 *   multiPathUpdate: Record<string, *>,
 *   finalLogs:       object,
 *   createdTasks:    Array<{ clientId: string, taskKey: string }>,
 *   updatedTasks:    Array<{ clientId: string, taskKey: string }>,
 *   deletedTasks:    Array<{ clientId: string, taskKey: string }>,
 * }}
 *
 * - `multiPathUpdate`  — paths → values for a single Firebase `update()` call.
 *                        New tasks, updated fields, and deleted tasks / fields
 *                        are ALL included here — one atomic write covers all.
 * - `finalLogs`        — updated clientLogs with stable push keys embedded.
 * - `createdTasks`     — metadata for logging / error surfacing.
 * - `updatedTasks`     — metadata for logging / error surfacing.
 * - `deletedTasks`     — metadata for logging / error surfacing.
 */
export function computeClientLogsDiff(prev, nextLogsInput, generatePushKey) {
  const nextLogs =
    typeof nextLogsInput === 'function' ? nextLogsInput(prev) : nextLogsInput;

  const multiPathUpdate = {};
  const finalLogs = { ...nextLogs };
  const createdTasks = [];
  const updatedTasks = [];
  const deletedTasks = [];

  // ── Changed / new client buckets ────────────────────────────────────────────
  for (const cid of Object.keys(nextLogs)) {
    if (nextLogs[cid] === prev[cid]) continue; // reference-equal → unchanged

    const prevRaw = prev[cid];
    const prevTasks = Array.isArray(prevRaw)
      ? prevRaw
      : prevRaw
        ? Object.values(prevRaw)
        : [];
    const prevByKey = new Map(
      prevTasks.filter(t => t?.taskKey).map(t => [t.taskKey, t])
    );

    const rawNext = nextLogs[cid];
    if (!rawNext || (Array.isArray(rawNext) && rawNext.length === 0)) {
      // Bucket cleared — delete all tracked tasks from Firebase
      for (const key of prevByKey.keys()) {
        multiPathUpdate[`clientLogs/${cid}/${key}`] = null;
        deletedTasks.push({ clientId: cid, taskKey: key });
      }
      continue;
    }

    const nextArr = Array.isArray(rawNext) ? [...rawNext] : Object.values(rawNext);
    const finalTasks = [];

    for (const task of nextArr) {
      // P6: skip null slots entirely — they generate no Firebase write path
      // and must not appear in finalLogs.
      if (!task) continue;

      if (!task.taskKey) {
        // NEW task — generate a push key synchronously (no network round-trip).
        // Include directly in multiPathUpdate so it is part of the same atomic
        // update() call as all edits and deletes in this action.
        const pushKey = generatePushKey(cid);
        const taskWithKey = { ...task, id: pushKey, taskKey: pushKey };
        // Store taskKey in Firebase alongside other fields so reads are
        // self-contained (tasksWithKeys() will also set it from the key, but
        // having it explicit makes the data portable).
        multiPathUpdate[`clientLogs/${cid}/${pushKey}`] = sanitizeForFirebase(taskWithKey);
        finalTasks.push(taskWithKey);
        createdTasks.push({ clientId: cid, taskKey: pushKey });
        continue;
      }

      finalTasks.push(task);

      const prevTask = prevByKey.get(task.taskKey);
      prevByKey.delete(task.taskKey); // mark seen; remainder = deleted

      if (!prevTask) {
        // Has a key but not in prev — arrived from Firebase listener; don't echo.
        continue;
      }

      // Write only fields that changed (field-level diff)
      let hadChanges = false;
      for (const [field, val] of Object.entries(task)) {
        if (field === 'taskKey') continue; // internal — already stored explicitly above
        if (JSON.stringify(prevTask[field]) !== JSON.stringify(val)) {
          multiPathUpdate[`clientLogs/${cid}/${task.taskKey}/${field}`] =
            sanitizeForFirebase(val) ?? null;
          hadChanges = true;
        }
      }
      // Null-out fields that were removed from the task object
      for (const field of Object.keys(prevTask)) {
        if (field === 'taskKey') continue;
        if (!(field in task)) {
          multiPathUpdate[`clientLogs/${cid}/${task.taskKey}/${field}`] = null;
          hadChanges = true;
        }
      }
      if (hadChanges) updatedTasks.push({ clientId: cid, taskKey: task.taskKey });
    }

    // Any prevByKey entries still remaining were deleted
    for (const key of prevByKey.keys()) {
      multiPathUpdate[`clientLogs/${cid}/${key}`] = null;
      deletedTasks.push({ clientId: cid, taskKey: key });
    }

    finalLogs[cid] = finalTasks;
  }

  // ── Clients removed entirely from nextLogs ──────────────────────────────────
  for (const cid of Object.keys(prev)) {
    if (!(cid in nextLogs)) {
      const prevRaw = prev[cid];
      const prevTasks = Array.isArray(prevRaw)
        ? prevRaw
        : prevRaw
          ? Object.values(prevRaw)
          : [];
      for (const t of prevTasks) {
        if (t?.taskKey) {
          multiPathUpdate[`clientLogs/${cid}/${t.taskKey}`] = null;
          deletedTasks.push({ clientId: cid, taskKey: t.taskKey });
        }
      }
    }
  }

  return { multiPathUpdate, finalLogs, createdTasks, updatedTasks, deletedTasks };
}
