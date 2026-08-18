/**
 * Shared client-permission scope for owner-scoped roles (Business Head, CSM).
 *
 * Aug 2026 policy: BH/CSM users are client-specific. Their permitted clients
 * are the clients they own (client.ownerIds) plus the clients owned by their
 * ACTIVE direct reports. All reporting surfaces (Team View, Metrics, Reports)
 * must derive scope from this single helper so the definition never diverges.
 *
 * All id comparisons are string-normalized (ids may be numbers or strings).
 */
import { getDirectReports } from './reportingTree';

export const OWNER_SCOPED_ROLES = ['Business Head', 'CSM'];

export function isOwnerScopedRole(role) {
  return OWNER_SCOPED_ROLES.includes(role);
}

const isActiveUser = (u) => !u.archived && u.active !== false;

/**
 * Returns null for non-owner-scoped roles (their existing behavior is
 * unchanged). For BH/CSM returns:
 *   {
 *     clientIds:   Set<string>  permitted client ids
 *     clients:     Client[]     permitted client records (deduped)
 *     clientNames: Set<string>  permitted client names
 *     directIdSet: Set<string>  active direct report ids
 *   }
 */
export function getOwnerScope(currentUser, users = [], clients = []) {
  if (!currentUser || !isOwnerScopedRole(currentUser.role)) return null;
  const directs = getDirectReports(currentUser.id, users).filter(isActiveUser);
  const directIdSet = new Set(directs.map(d => String(d.id)));
  const ownedBy = (uid) => (clients || []).filter(c => (c.ownerIds || []).map(String).includes(String(uid)));
  const relevant = new Map();
  ownedBy(currentUser.id).forEach(c => relevant.set(String(c.id), c));
  directs.forEach(r => ownedBy(r.id).forEach(c => relevant.set(String(c.id), c)));
  return {
    clientIds: new Set(relevant.keys()),
    clients: [...relevant.values()],
    clientNames: new Set([...relevant.values()].map(c => c.name)),
    directIdSet,
  };
}

/**
 * Returns a READ-ONLY copy of clientLogs containing only permitted buckets.
 * NEVER pass the result to setClientLogs — the diff writer treats missing
 * client buckets as deletions; write paths must always use the full clientLogs.
 */
export function scopeClientLogs(clientLogs, clientIds) {
  const out = {};
  Object.entries(clientLogs || {}).forEach(([cid, logs]) => {
    if (clientIds.has(String(cid))) out[cid] = logs;
  });
  return out;
}
