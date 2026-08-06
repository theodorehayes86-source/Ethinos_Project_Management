/**
 * Shared reporting-tree helpers.
 *
 * Canonical reporting fields on a user record:
 *   - managerId  — scalar OR array of manager ids
 *   - managerId2 — optional secondary manager (scalar)
 *
 * All comparisons are string-normalized because ids may be stored as
 * numbers or strings depending on how the user was created/imported.
 *
 * This mirrors the mobile app's helpers in
 * artifacts/pmt-mobile/src/hooks/useFirebaseData.js so both apps apply
 * identical hierarchy semantics.
 */

/** Roles allowed to see users across regions (Region filter in Team View). */
export const TEAM_ADMIN_ROLES = ['Super Admin', 'Director', 'Business Head'];

/** Direct reportees of `userId` (supports array managerId and managerId2). */
export function getDirectReports(userId, users) {
  const uid = String(userId);
  return (users || []).filter(u => {
    if (String(u.id) === uid) return false;
    const mid = u.managerId;
    if (Array.isArray(mid)) { if (mid.some(id => String(id) === uid)) return true; }
    else if (mid !== undefined && mid !== null && String(mid) === uid) return true;
    const mid2 = u.managerId2;
    if (mid2 !== undefined && mid2 !== null && String(mid2) === uid) return true;
    return false;
  });
}

/** Set of string ids: `userId` plus every direct and indirect reportee. */
export function getSubtreeIds(userId, users, visited = new Set()) {
  const uid = String(userId);
  if (visited.has(uid)) return visited;
  visited.add(uid);
  getDirectReports(userId, users).forEach(r => getSubtreeIds(r.id, users, visited));
  return visited;
}

/** All direct + indirect reportee ids for a manager (excludes the manager). */
export function getReporteeIds(managerId, users) {
  const ids = getSubtreeIds(managerId, users);
  ids.delete(String(managerId));
  return ids;
}
