import { createHash, randomBytes } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth, getAdminDatabase } from "./firebase-admin";
import { isStaffEmail, normalizeMembership, safeKey, contactFullName, validContactNames } from "./client-portal";
import { APP_BASE_URL } from "./app-url";
import { isEmailConfigured, sendEmail } from "./microsoft-graph";
import { logger } from "./logger";

const db = () => getAdminDatabase();
const read = async (path: string) => (await db().ref(path).once("value")).val();
export const invitationHash = (token: string) => createHash("sha256").update(token).digest("hex");
export class InvitationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const invalid = () => new InvitationError(400, "Invitation is unavailable, expired or already used. Request a new invitation.");
const ref = (uid: string) => db().ref(`clientPortalUsers/${uid}`);
async function withLoadedRecord<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const record = db().ref(path);
  const retainValue = () => {};
  record.on("value", retainValue, () => {});
  try {
    await record.once("value");
    return await operation();
  } finally { record.off("value", retainValue); }
}
const usable = (m: any, hash: string) => m && !m.disabled && !m.deletionInProgress && !isStaffEmail(m.email) &&
  m.invitation?.tokenHash === hash && m.invitation.status === "pending" && m.invitation.expiresAt > Date.now();

/** Covers both UID role records and staff-directory email collisions, including external staff. */
export async function assertClientIdentity(uid: string, email: string) {
  const user = await getAdminAuth().getUser(uid);
  if (user.disabled || user.email?.toLowerCase() !== email.toLowerCase() || isStaffEmail(user.email) ||
      Object.keys(user.customClaims ?? {}).some(key => ["role", "roles", "admin", "staff", "superAdmin"].includes(key)) ||
      await read(`userRoles/${uid}`) != null) throw new InvitationError(403, "This identity cannot use client invitations.");
  const users = await read("users");
  if (Object.entries(users ?? {}).some(([id, row]) => {
    const staff = row as any;
    return id === uid || staff?.uid === uid || staff?.email?.toLowerCase() === email.toLowerCase();
  })) throw new InvitationError(403, "This identity cannot use client invitations.");
  return user;
}

export async function issueInvitation(uid: string) {
  return withLoadedRecord(`clientPortalUsers/${uid}`, () => issueLoadedInvitation(uid));
}

async function issueLoadedInvitation(uid: string) {
  if (!isEmailConfigured()) throw new InvitationError(503, "Email delivery is not configured.");
  const before = await read(`clientPortalUsers/${uid}`);
  if (!before || before.disabled || before.deletionInProgress) throw invalid();
  await assertClientIdentity(uid, before.email);
  const token = randomBytes(32).toString("base64url"), hash = invitationHash(token);
  const invitation = { tokenHash: hash, status: "pending", expiresAt: Date.now() + 7 * 86400000,
    requiresSignIn: before.invitationIdentityCreated !== true || before.invitation?.status === "accepted" };
  const result = await ref(uid).transaction(current => {
    if (!current || current.disabled || current.deletionInProgress || current.email !== before.email || current.invitation?.status === "processing" ||
        current.invitation?.tokenHash !== before.invitation?.tokenHash ||
        current.invitation?.status !== before.invitation?.status ||
        current.invitation?.expiresAt !== before.invitation?.expiresAt) return;
    return { ...current, invitation: { ...invitation,
      requiresSignIn: current.invitationIdentityCreated !== true || current.invitation?.status === "accepted" } };
  });
  if (!result.committed) throw new InvitationError(409, "Invitation changed. Try again.");
  let stage = "index";
  try {
    // The index contains only a hash and UID. The raw token exists solely in this email.
    await db().ref(`clientPortalInvitationHashes/${hash}`).set(uid);
    // Deletion may have revoked/removed membership while this index write was in flight.
    if (!usable(await read(`clientPortalUsers/${uid}`), hash)) throw invalid();
    stage = "email";
    const name = (contactFullName(before) || "there").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    await sendEmail({ to: before.email, subject: "Your Flow Pro client access", sensitive: true,
      bodyHtml: `<p>Hi ${name},</p><p>You have been invited to your client workspace in Flow Pro.</p><p><a href="${APP_BASE_URL}/?client=1#invite=${token}">Accept your invitation</a></p><p>This link expires in 7 days and can only be used once.</p>` });
  } catch (error) {
    // Log only a bounded status and stage, never recipient, invitation token,
    // Graph response body or credentials.
    const message = error instanceof Error ? error.message : "";
    const match = message.match(/^Failed to (?:send email via Microsoft Graph|get Microsoft Graph token): (\d{3})/);
    const status = match ? Number(match[1]) : undefined;
    logger.warn({ stage, ...(status ? { microsoftStatus: status } : {}) }, "Client invitation delivery failed");
    try {
      await withLoadedRecord(`clientPortalInvitationHashes/${hash}`, async () => {
        await db().ref(`clientPortalInvitationHashes/${hash}`).transaction(current => current === uid ? null : undefined);
      });
      await ref(uid).transaction(current => current?.invitation?.tokenHash === hash && current.invitation.status === "pending"
        ? { ...current, invitation: { ...current.invitation, status: "revoked" } } : undefined);
    } catch {
      throw new InvitationError(503, "Invitation failed and link cleanup could not be confirmed. Revoke the invitation before trying again.");
    }
    if (error instanceof InvitationError) throw error;
    if (stage !== "email") throw new InvitationError(503, "Invitation could not be saved. No email was sent. Try again later.");
    if (message.startsWith("Failed to get Microsoft Graph token"))
      throw new InvitationError(503, "Microsoft email authentication failed on this server. Ask your hosting team to check its Microsoft credentials.");
    if (status === 403)
      throw new InvitationError(503, "Microsoft denied email sending. Check this server's sender mailbox and Microsoft Mail.Send permissions.");
    if (status === 404)
      throw new InvitationError(503, "Microsoft could not find the configured sender mailbox. Check this server's sender email setting.");
    if (status === 429)
      throw new InvitationError(429, "Microsoft has temporarily limited email sending. Wait before trying again.");
    throw new InvitationError(503, "Email delivery could not be confirmed. Check the recipient inbox and server email logs before resending.");
  }
}

async function lookup(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const hash = invitationHash(token);
  const uid = await read(`clientPortalInvitationHashes/${hash}`);
  if (!safeKey(uid)) throw invalid();
  const membership = await read(`clientPortalUsers/${uid}`);
  if (!usable(membership, hash)) throw invalid();
  await assertClientIdentity(uid, membership.email);
  return { uid, hash, membership };
}

export async function inspectInvitation(token: unknown) {
  const { uid, hash, membership } = await lookup(token);
  const clients = await read("clients");
  const ids = normalizeMembership(membership)!.clientIds;
  const clientNames = Object.entries(clients ?? {}).flatMap(([id, row]) => {
    const c = row as any;
    return ids.includes(String(c.id ?? id)) && !c.deleted && !c.archived && typeof c.name === "string" ? [c.name] : [];
  });
  if (!usable(await read(`clientPortalUsers/${uid}`), hash)) throw invalid();
   return { email: membership.email, firstName: membership.firstName || "", lastName: membership.lastName || "", requiresSignIn: membership.invitation.requiresSignIn,
    expiresAt: membership.invitation.expiresAt, clientNames };
}

export async function acceptInvitation(body: { token: unknown; displayName?: unknown; firstName?: unknown; lastName?: unknown; password?: unknown }, identity?: DecodedIdToken) {
  const { uid, hash, membership } = await lookup(body.token);
  return withLoadedRecord(`clientPortalUsers/${uid}`, () => acceptLoadedInvitation(body, identity, uid, hash, membership));
}

async function acceptLoadedInvitation(body: { token: unknown; displayName?: unknown; firstName?: unknown; lastName?: unknown; password?: unknown }, identity: DecodedIdToken | undefined, uid: string, hash: string, membership: any) {
  const existing = membership.invitation.requiresSignIn !== false;
  if (identity && (identity.uid !== uid || identity.email?.toLowerCase() !== membership.email.toLowerCase()))
    throw new InvitationError(403, "Sign in with the invited account.");
  if (existing) {
    if (!identity) throw new InvitationError(401, "Sign in to your existing account to accept this invitation.");
    if (body.password !== undefined || body.displayName !== undefined || body.firstName !== undefined || body.lastName !== undefined)
      throw new InvitationError(400, "Existing accounts must accept with the invitation token only.");
  } else if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128 ||
      (body.displayName !== undefined && (typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.length > 120))) {
    throw new InvitationError(400, "Provide a password of 12–128 characters and an optional name of 1–120 characters.");
  }
  if (!validContactNames(body)) throw new InvitationError(400, "Provide both first and last names, each up to 50 characters.");
  const names = !existing && body.firstName !== undefined
    ? { firstName: (body.firstName as string).trim(), lastName: (body.lastName as string).trim() } : {};
  const displayName = contactFullName(names) || contactFullName(membership) || (typeof body.displayName === "string" ? body.displayName.trim() : "");
  const claim = randomBytes(16).toString("hex");
  const reserved = await ref(uid).transaction(current => usable(current, hash) && current.email === membership.email
    ? { ...current, invitation: { ...current.invitation, status: "processing", claim } } : undefined);
  if (!reserved.committed) throw invalid();
  try {
    // Never restore a reservation after an Auth failure: retrying a partially applied password update is unsafe.
    await assertClientIdentity(uid, membership.email);
    await getAdminAuth().updateUser(uid, { emailVerified: true,
      ...(!existing ? { password: body.password as string, ...(displayName ? { displayName } : {}) } : {}) });
    await assertClientIdentity(uid, membership.email);
    const accepted = await ref(uid).transaction(current =>
      current && !current.disabled && !current.deletionInProgress && current.email === membership.email && current.invitation?.tokenHash === hash &&
      current.invitation.status === "processing" && current.invitation.claim === claim && current.invitation.expiresAt > Date.now()
        ? { ...current, ...names, onboardingRequired: false, invitationIdentityCreated: false, invitation: { ...current.invitation, status: "accepted", acceptedAt: Date.now(), claim: null } }
        : undefined);
    if (!accepted.committed) throw invalid();
    return { accepted: true as const, email: membership.email };
  } catch (error) {
    await ref(uid).transaction(current => current?.invitation?.claim === claim
      ? { ...current, invitation: { ...current.invitation, status: "revoked", claim: null } } : undefined);
    throw error;
  }
}

export async function revokeInvitation(uid: string) {
  return withLoadedRecord(`clientPortalUsers/${uid}`, () => revokeLoadedInvitation(uid));
}

async function revokeLoadedInvitation(uid: string) {
  const result = await ref(uid).transaction(current => current?.invitation &&
    ["pending", "processing"].includes(current.invitation.status)
    ? { ...current, invitation: { ...current.invitation, status: "revoked", claim: null } } : undefined);
  if (!result.committed) throw new InvitationError(409, "There is no pending invitation to revoke.");
}
