# Client task portal — release checklist

## Security and product contract

- Client identities are Firebase email/password accounts with a verified email.
  Memberships live in the server-only `clientPortalUsers/{firebaseUid}` collection,
  not employee `users` or `userRoles`. No access is inferred from an email domain.
- Administrators manage invitations and memberships in Control Center → Client Portal.
  An invitation contains password setup and verification links. If mail fails,
  the saved membership is shown with an explicit delivery warning and can be resent.
- Client access uses `/api/client-portal` with a Firebase bearer token. Every request
  verifies revocation and checks live membership. Responses have `Cache-Control: no-store`.
- Only `visibility: "client"` ordinary tasks are returned. Absent visibility means
  internal. Checklist/group/archive tasks are excluded even if marked shared.
  The projection is exactly ID, title, client description, public status and due date.
  Internal comments are never a fallback for client descriptions.
- Client task creation accepts only title, description and an optional ISO date.
  Assignment, creator, client ID, visibility, status and repeat settings are server-owned.
  Client editing/deletion, checklist/template actions and staff APIs are denied.
- A disabled/reassigned membership takes effect on the next request. Portal screens
  refresh every 30 seconds and on focus and clear private content on access failure.
  As with any sharing system, revocation cannot retract information already viewed or copied.
- Keep disabled membership records: the UID marker also prevents direct staff database
  access if an external account changes its Firebase email to an employee-domain address.

## Required rollout order — do not invite real clients before this is verified

The production custom domain is operated separately from the Replit preview.
Neither publishing a preview nor committing these files installs database rules.
This implementation has **not** deployed rules or invited real customers.

1. Compare the live Realtime Database rules with `database.rules.json`. If production
   has additional staff collections/rules, retain their intended employee access but
   add the same `!root.child('clientPortalUsers').child(auth.uid).exists()` exclusion
   to every grant. Never replace an unknown live rule set blindly.
2. With operator approval, deploy the reviewed rules to the intended Firebase project.
   Root reads/writes remain denied; external users must have **no direct RTDB access**,
   including checklists, templates, chats, clientLogs and employee data.
3. Verify Email/Password auth is enabled and the existing app domain is authorized
   for Firebase password-reset and email-verification continue URLs. Invitation links
   use the existing canonical app URL and `?client=1`.
4. Deploy API and both frontend builds together to the existing hosting environment.
   Preserve existing Microsoft and staff password sign-in. Existing Microsoft Graph
   sender configuration is reused for invitations; no new mail credentials are required.
5. With synthetic test accounts and non-customer test clients, verify:
   - A verified account assigned to A can list A's shared tasks and create a Pending task.
   - The same account cannot request B, internal A tasks, checklist/templates or staff APIs.
   - Direct Firebase reads/writes fail for users, clients, clientLogs, settings,
     task categories, templates, checklist groups and chat paths.
   - No-access and unverified accounts are denied. Disabling/reassigning an account
     removes subsequent API access and clears the portal on its next refresh.
   - Changing a task from Client to Internal removes it on the next refresh.
   - Existing employee roles still work and no employee membership is accidentally created.
   - Password setup, verification, sign-in, resend and reset complete on desktop and phone.
6. Only after those checks, invite real clients.

## Local verification

`pnpm --filter @workspace/api-server run test` includes mocked Firebase/API authorization
tests, projection tests, forged-field checks, invitation/revocation checks and a static
rules-policy regression test. These do not verify the deployed Firebase rules or email
delivery. Desktop portal tests are in the existing desktop test suite. Both app builds
must pass. Production verification above must be performed with an approved operator;
never use customer data or send actual invitations as an automated development test.

## Internal data handling

Existing tasks remain internal without migration. Recurrence deliberately preserves
explicit sharing; copies, imports and template creation start internal. Staff must
review the disclosure confirmation before sharing an existing task. To remove access,
switch it to Internal. The client-facing description is separate from internal notes.
