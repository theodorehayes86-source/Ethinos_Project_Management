---
name: Teams activity notification quirks
description: Known Graph API pitfalls for sendActivityNotification — teamsAppId disambiguation, 403 app-install requirement, activityType case sensitivity
---

## activityType must match manifest EXACTLY (case-sensitive)

**Rule:** The `activityType` string in the Graph API call must match the Teams app manifest definition exactly, including case.

**Why:** Graph silently drops the notification (returns 202 OK but nothing appears in Teams) when the activityType casing doesn't match. Our manifest defines `"taskmention"` (all lowercase). Using `"taskMention"` (camelCase) caused silent failures.

**How to apply:** In `microsoft-graph.ts → sendTeamsActivityNotification()`, `activityType` is set to `"taskmention"`. Never change the casing without also updating the manifest. When adding new activity types, copy the string directly from the manifest.

---

## teamsAppId must be in the request body

**Rule:** Always include `teamsAppId` at the top level of the `sendActivityNotification` request body.

**Why:** When multiple Teams apps share the same Azure AD app ID (e.g. a TEST package and a LIVE package both registered under the same AAD app), Graph returns `409 Conflict: Found multiple applications with the same AAD App ID — a Teams Application ID is required`.

**How to apply:** In `microsoft-graph.ts → sendTeamsActivityNotification()`, the body already includes `teamsAppId`. Never remove it.

---

## 403 "app not installed in target scope"

**Rule:** Activity notifications silently fail with 403 if the recipient hasn't installed the Teams app in their client.

**Why:** Microsoft requires the recipient to have the app installed for `sendActivityNotification` to work. This is user-side — no code fix possible.

**How to apply:** The 403 is expected for users who haven't installed the app. The DM still goes through independently. Tell users to install the app via Teams → Apps → search "Flow Pro".

---

## Two-channel design

Activity notifications (banner/bell) and 1:1 DMs are independent. A 403 on activity notification does NOT prevent the DM from sending. Both are attempted in sequence; the DM path does not depend on the activity notification succeeding.
