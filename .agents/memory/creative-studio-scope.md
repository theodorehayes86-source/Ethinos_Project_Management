---
name: Creative Studio scope
description: User requirements for studio client enrollment and separate creative work tracking
---

Clients must be added through the normal client process. Normal client access is
available for all clients; only selected clients are enabled for Creative Studio in
Control Centre. Do not add a separate client-creation flow inside Creative Studio.

Creative assets/work items need separate tracking from ordinary tasks and must be
called something else.

Social and Design departments should have direct access to Creative Studio.

**Why:** The user explicitly requested direct access for these departments.

**How to apply:** Show the Studio tab without individual editor grants and allow work on assigned, Studio-enabled clients. Department access alone does not grant all-client access or Control Centre management.

**Why:** The user clarified that normal client creation and client access are separate
from optional Creative Studio access, and explicitly requested separate creative tracking.

**How to apply:** Configure studio access per existing client in Control Centre;
preserve explicit user-to-client memberships. Keep studio work tracking distinct
from ordinary tasks. “Deliverables”
is the proposed work-item name; it has not yet been confirmed by the user. Do not confuse
work items with the images, videos and other assets attached to them.

Email automation belongs in a Creative Studio tab within Control Centre, alongside
the client enablement settings, not in the main Creative Studio workspace.

**Why:** The user explicitly requested this location rather than the artifact's
Email automation sub-tab.

**How to apply:** Keep operational creative work in the main studio; put email
automation configuration in Control Centre → Creative Studio.

The reminder log belongs in the main Creative Studio tab, not the Control Centre
email automation section.

**Why:** The user explicitly requested moving the artifact's reminder log into
Creative Studio while keeping automation functionality in Control Centre.

**How to apply:** Separate read-only delivery history from automation configuration;
preserve existing client-scoped permissions for viewing logs.

All Creative Studio colours must match the existing Flow Pro colour scheme and
look, not use a separate visual theme.

**Why:** The user rejected the different colour scheme and appearance, then
repeated that all Creative Studio colours must use the existing colour scheme.

**How to apply:** Reuse the existing app's typography, colours, surfaces and controls
for both Studio operations and Control Centre settings on desktop and mobile.

Explicitly shared Creative Studio items must appear for assigned clients even before an approval request. Sharing and approval stage are separate.

**Why:** The user expects a shared line item to appear in the client's calendar; retaining draft-stage exclusion made Share misleading.

**How to apply:** Gate visibility on sharing, archive state and client authorization, not approval stage. Keep internal briefs and unpublished asset replacements out of the client projection. Calendar placement uses planned date/time; undated shared items remain accessible separately.

Do not automatically retry an ambiguous Creative Studio email transport failure.
Keep email delivery opt-in during rollout, separate from client module enablement.

**Why:** Microsoft Graph email sending does not provide transactional idempotency
with Firebase. A lost response may still mean an email was sent; blind retries can
spam clients. The user has not authorized real rollout emails.

**How to apply:** Show uncertain delivery in the delivery log for investigation.
Check the sender mailbox before any manual resend, and obtain rollout approval
before enabling real transport.

## Email template variables

The user defines the email variables as: {{client}} = client name, {{post}} = post
name, {{date}} = date, {{type}} = Story, Reel or Post, and {{deadline}} = deadline
time and date. Send time, timezone and cadence apply to both reminders.

**Why:** The user explicitly clarified that these are variables populated in the
email template, not literal text in the delivered email.

**How to apply:** Keep variable meanings consistent in previews and sent emails,
and apply the shared schedule to reference and final approval reminders.

Email greetings must address the client contact's first and last name, not the
client company. Keep {{client}} as the company reference; use {{recipientName}}
for the contact's full name, with individual first/last-name variables available.

**Why:** The user subsequently requested first and last names in Client Portal
and personal names in emails instead of the company-based greeting.

**How to apply:** Collect names during invitations and setup, allow agency edits,
and personalize separately for the actual recipient at send time. Preserve
company-name references outside greetings. Never infer missing name parts by
splitting an existing display name.

## Summary cards and calendar dates

Creative Studio summary cards should be clickable filters. Calendar dates should
use green for deadlines far away, orange in between, red close to deadline and
deep red past deadline.

**Why:** The user requested these interactions and deadline colours while keeping
the existing Creative Studio interface.

**How to apply:** Keep the normal Flow Pro theme; these are semantic deadline
colours rather than a separate Studio colour scheme. Preserve client scoping
and use the same calendar component in the client portal and its preview.
