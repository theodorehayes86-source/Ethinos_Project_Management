/**
 * Pure-function core of the smart clientLogs diff writer.
 *
 * Extracted from App.jsx so it can be unit-tested independently of React,
 * Firebase, or component state.
 *
 * Usage in App.jsx:
 *   const { multiPathUpdate, finalLogs, newTaskWrites } =
 *     computeClientLogsDiff(prev, nextLogsInput, (cid) => push(ref(db, `clientLogs/${cid}`)).key);
 *   newTaskWrites.forEach(({ path, task }) => set(ref(db, path), task).catch(...));
 *   if (Object.keys(multiPathUpdate).length > 0) update(ref(db), multiPathUpdate).catch(...);
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
 *   newTaskWrites:   Array<{ path: string, task: object }>,
 * }}
 *
 * - `multiPathUpdate`  — paths → values for a single Firebase `update()` call.
 *                        Deleted tasks / fields have `null` values.
 * - `finalLogs`        — updated clientLogs with stable push keys embedded.
 * - `newTaskWrites`    — sanitized task objects that need individual `set()` calls
 *                        because Firebase `update()` cannot atomically create a
 *                        new keyed child and set its fields in one pass.
 */
export function computeClientLogsDiff(prev, nextLogsInput, generatePushKey) {
  const nextLogs =
    typeof nextLogsInput === 'function' ? nextLogsInput(prev) : nextLogsInput;

  const multiPathUpdate = {};
  const finalLogs = { ...nextLogs };
  /** @type {Array<{ path: string, task: object }>} */
  const newTaskWrites = [];

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
      }
      continue;
    }

    const nextArr = Array.isArray(rawNext) ? [...rawNext] : Object.values(rawNext);
    const finalTasks = [];

    for (const task of nextArr) {
      if (!task) { finalTasks.push(task); continue; }

      if (!task.taskKey) {
        // NEW task — generate a push key synchronously (no network round-trip)
        const pushKey = generatePushKey(cid);
        const taskWithKey = { ...task, id: pushKey, taskKey: pushKey };
        newTaskWrites.push({
          path: `clientLogs/${cid}/${pushKey}`,
          task: sanitizeForFirebase(taskWithKey),
        });
        finalTasks.push(taskWithKey);
        continue;
      }

      finalTasks.push(task);

      const prevTask = prevByKey.get(task.taskKey);
      prevByKey.delete(task.taskKey); // mark seen; remainder = deleted

      if (!prevTask) {
        // Has a key but not in prev — arrived from Firebase listener; don't echo.
        continue;
      }

      // Write only fields that changed
      for (const [field, val] of Object.entries(task)) {
        if (field === 'taskKey') continue; // internal — not stored in Firebase
        if (JSON.stringify(prevTask[field]) !== JSON.stringify(val)) {
          multiPathUpdate[`clientLogs/${cid}/${task.taskKey}/${field}`] =
            sanitizeForFirebase(val) ?? null;
        }
      }
      // Null-out fields that were removed from the task object
      for (const field of Object.keys(prevTask)) {
        if (field === 'taskKey') continue;
        if (!(field in task)) {
          multiPathUpdate[`clientLogs/${cid}/${task.taskKey}/${field}`] = null;
        }
      }
    }

    // Any prevByKey entries still remaining were deleted
    for (const key of prevByKey.keys()) {
      multiPathUpdate[`clientLogs/${cid}/${key}`] = null;
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
        if (t?.taskKey) multiPathUpdate[`clientLogs/${cid}/${t.taskKey}`] = null;
      }
    }
  }

  return { multiPathUpdate, finalLogs, newTaskWrites };
}
