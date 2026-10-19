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

Do not automatically retry an ambiguous Creative Studio email transport failure.
Keep email delivery opt-in during rollout, separate from client module enablement.

**Why:** Microsoft Graph email sending does not provide transactional idempotency
with Firebase. A lost response may still mean an email was sent; blind retries can
spam clients. The user has not authorized real rollout emails.

**How to apply:** Show uncertain delivery in the delivery log for investigation.
Check the sender mailbox before any manual resend, and obtain rollout approval
before enabling real transport.
