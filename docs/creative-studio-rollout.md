# Creative Studio rollout checklist

Creative Studio is an optional module for existing clients. Do not import the
reference artifact's sample clients or content into the live database.

## Before release

- Obtain separate approval to publish the application and deploy Firebase rules.
  No GitHub push is part of this work.
- Confirm the API server and both web applications are released together.
- Verify the deployed database rules deny direct browser access to creative
  records, internal threads, delivery records and configuration. An API-only UI
  is not a substitute for database rules.
- Use test identities in an isolated environment to verify a client cannot read
  another client's data, internal messages or drafts. Verify revoked and
  unverified accounts fail closed. Never disable authentication for previews.
- Verify BH/CSM client owners can access their own studio settings without gaining
  unrelated Control Centre privileges.
- Keep email automation disabled until the sender, recipients and previews have
  been approved. Obtain permission before sending even a test email.
- The existing custom-domain host has separate runtime configuration. Validate
  that host rather than assuming development credentials or services carry over.
- Background automation requires continuously running hosting. Check the actual
  production process and its logs; development tests do not prove live delivery.

## Controlled activation

1. Create/manage clients through the normal client directory.
2. Enable one approved existing client in Control Centre → Creative Studio.
3. Create an internal draft deliverable and confirm ordinary tasks, metrics,
   billing and reminders remain unchanged.
4. Add reference assets using HTTPS links. Check underlying SharePoint/file
   permissions separately; Flow Pro does not grant access to those files.
5. Share a revision with a designated verified client approver. Verify reference
   approval, final approval, revision invalidation and manual scheduling tracking.
6. Check desktop and mobile, including a second session and refresh.
7. After explicit approval, enable email delivery for the pilot client and check
   delivery history, timezone, cooldown and recipient scope.
8. Enable further clients individually once the pilot is confirmed.

## Stop or reverse activation

Disable a client's Creative Studio configuration to stop its studio access and
future reminders without deleting deliverables, normal tasks or portal membership.
Disable email automation independently when investigating delivery. Do not delete
history or retry an uncertain email blindly: the provider may already have accepted
it even if the response was lost.

Mark scheduled records that a person scheduled a post elsewhere. It never publishes
to a social network. External asset links are not copied or backed up by Flow Pro.
