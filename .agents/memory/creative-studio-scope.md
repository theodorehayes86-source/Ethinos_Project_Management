---
name: Creative Studio scope
description: User requirements for studio client enrollment and separate creative work tracking
---

Clients must be added through the normal client process. Normal client access is
available for all clients; only selected clients are enabled for Creative Studio in
Control Centre. Do not add a separate client-creation flow inside Creative Studio.

Creative assets/work items need separate tracking from ordinary tasks and must be
called something else.

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
