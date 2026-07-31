/**
 * Shared Firebase collection normalisation utilities.
 *
 * Firebase may return task collections as either:
 *   - A legacy JS array  (integer keys 0, 1, 2 …)
 *   - A push-key object  ({ "-Nxyz": task, … })
 *
 * Both shapes must be handled identically throughout the application.
 * Use these helpers everywhere instead of raw .map() / .filter() on
 * uncertain Firebase values.
 */

/**
 * Returns [taskKey, task] pairs from a Firebase collection value.
 * Safe for null, undefined, array, and object inputs.
 *
 * @example
 * // Array shape (legacy)
 * collectionEntries([taskA, taskB])
 *   // → [["0", taskA], ["1", taskB]]
 *
 * // Object shape (push keys)
 * collectionEntries({ "-Nabc": taskA, "-Ndef": taskB })
 *   // → [["-Nabc", taskA], ["-Ndef", taskB]]
 */
export function collectionEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item, index) => (item != null ? [String(index), item] : null))
      .filter(Boolean);
  }
  return Object.entries(value).filter(([, v]) => v != null);
}

/**
 * Returns an array of task objects from a Firebase collection value.
 * Safe for null, undefined, array, and object inputs.
 */
export function collectionValues(value) {
  return collectionEntries(value).map(([, item]) => item);
}

/**
 * Returns an array of task objects, each enriched with its Firebase key as
 * the `taskKey` property.
 *
 * `taskKey` is the authoritative write path segment:
 *   `clientLogs/{clientId}/{taskKey}`
 *
 * For legacy arrays, `taskKey` is the string-encoded array index.
 * For push-key objects, `taskKey` is the push key (e.g. "-Nxyz123").
 *
 * @example
 * tasksWithKeys({ "-Nabc": { id: "-Nabc", name: "Task A" } })
 *   // → [{ id: "-Nabc", name: "Task A", taskKey: "-Nabc" }]
 */
export function tasksWithKeys(value) {
  return collectionEntries(value).map(([taskKey, task]) => ({
    ...task,
    taskKey,
  }));
}
