import type { UserRecord } from "firebase-admin/auth";
import { getAdminAuth, getAdminDatabase } from "./firebase-admin";
import { InvitationError } from "./client-invitations";
import { isStaffEmail, normalizeMembership, safeKey } from "./client-portal";

/** Permanently removes login/access only. Client work and historical author IDs are untouched. */
export async function deleteClientAccount(uid: string): Promise<{ deleted: true }> {
  if (!safeKey(uid)) throw new InvitationError(400, "Invalid client account UID.");
  const db = getAdminDatabase(), auth = getAdminAuth();
  const ref = db.ref(`clientPortalUsers/${uid}`);
  const membership = (await ref.once("value")).val();
  let user: UserRecord | undefined;
  try { user = await auth.getUser(uid); }
  catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found")
      throw new InvitationError(503, "Client identity could not be checked. Nothing was deleted. Try again.");
  }
  const emails = [membership?.email, user?.email].filter((email): email is string => typeof email === "string");
  const role = (await db.ref(`userRoles/${uid}`).once("value")).val();
  const directory = (await db.ref("users").once("value")).val();
  if (emails.some(isStaffEmail) || role != null ||
      Object.keys(user?.customClaims ?? {}).some(key => ["role", "roles", "admin", "staff", "superAdmin"].includes(key)) ||
      Object.entries(directory ?? {}).some(([key, value]) => {
        const staff = value as { uid?: string; id?: string; email?: string } | null;
        return key === uid || staff?.uid === uid || staff?.id === uid ||
          (typeof staff?.email === "string" && emails.some(email => email.toLowerCase() === staff.email!.toLowerCase()));
      })) throw new InvitationError(403, "Staff identities cannot be deleted through client access management.");
  // Without a membership we cannot establish that an existing Auth identity belongs to the portal.
  if (!membership && user) throw new InvitationError(404, "Client account not found. No identity was deleted.");
  if (membership && !normalizeMembership(membership))
    throw new InvitationError(409, "Client membership is invalid. No identity was deleted; contact an administrator.");
  if (membership) {
    const revoked = await ref.transaction(current => {
      if (!current || current.email !== membership.email) return;
      return { ...current, disabled: true, deletionInProgress: true,
        ...(current.invitation ? { invitation: { ...current.invitation, status: "revoked", claim: null } } : {}) };
    });
    if (!revoked.committed) throw new InvitationError(409, "Client membership changed. Retry deletion.");
  }
  // Disabling the membership first blocks even already-issued ID tokens and processing invitations.
  try { await auth.deleteUser(uid); }
  catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found")
      throw new InvitationError(503, "Client login deletion failed. Access remains blocked; retry deletion to finish.");
  }
  try {
    // Query by UID, then conditionally remove each hash. Never replace the shared index collection.
    const hashes = (await db.ref("clientPortalInvitationHashes").orderByValue().equalTo(uid).once("value")).val();
    for (const hash of Object.keys(hashes ?? {})) {
      await db.ref(`clientPortalInvitationHashes/${hash}`).transaction(current => current === uid ? null : undefined);
    }
    if (membership) {
      await ref.transaction(current => {
        if (!current) return;
        if (!current.deletionInProgress || current.email !== membership.email)
          throw new Error("Client membership changed during deletion");
        return null;
      });
    }
  } catch {
    throw new InvitationError(503, "Client login was deleted, but access-record cleanup failed. Access remains blocked; retry deletion to finish.");
  }
  return { deleted: true };
}
