---
name: External client scope
description: Product boundaries for invited client users and sharing approval
---

Clients see only the clients they have been explicitly added to. They may view shared
ordinary tasks and add tasks, but cannot create checklists or templates or enter staff
screens. Each client has an Internal and a Client view; staff explicitly choose task
visibility when creating or editing.

**Why:** The user requested a restricted client workspace rather than employee access.
The screenshot is a layout reference, not permission to expose Reports, Edit or timers.

**How to apply:** Keep new portal functionality within that scope unless the user
explicitly expands it. Do not automatically share old internal notes when sharing a task.
Do not treat completing the implementation as permission to deploy Firebase rules or invite
real clients; verify live isolation before customer onboarding.

Client onboarding should start with an email invitation. Its link should open
account creation with the account fixed as a client account. After onboarding,
clients see only assigned client accounts and the client-facing Creative Studio
view where it is enabled.

**Why:** The user explicitly described this invitation and account-creation flow.

**How to apply:** Keep client signup separate from staff registration, derive client
membership from the invitation rather than user-selected roles or accounts, and
condition Studio visibility on enablement for assigned accounts.

Client Portal must offer permanent deletion of an email/login account and its access,
separately from Disable.

**Why:** The user explicitly rejected disablement as a substitute for permanent deletion.

**How to apply:** Confirm the destructive action, remove the login identity and portal
access/invitations, and retain client companies and work records.

Client Test Mode uses fictional in-memory accounts and work, not a seeded live
client or authentication bypass.

**Why:** The user requested a dummy-email client view in Test Mode; creating a real
account or granting access to real clients is unnecessary for previewing that flow.

**How to apply:** Reuse client-facing screens with isolated demo data, make the demo
development-only, and keep its actions away from Firebase, email and live APIs.
