# Creative Studio API contract

Base: `/api/creative-studio`. Every request uses `Authorization: Bearer <Firebase ID token>`. JSON errors: `{error: string}`; 400 validation, 401 session, 403 scope, 404 missing, 409 stale revision. No direct Firebase access. Emails are suppressed unless explicitly enabled on the server.

## Bootstrap and settings
- `GET /bootstrap` → `{clients, configs, capabilities, owners, approvers, defaults}`. Clients are existing `{id,name}` records authorized for this identity; operational consumers must filter `configs[id]?.enabled === true`. Settings managers additionally see disabled authorized clients. `capabilities`: `{isClient, canManageSettings, canManageDefaults, canEdit, manageableClientIds, editableClientIds}`. `owners`: `{id,name,clientIds}[]`. `approvers`: `{uid,name,clientIds}[]` (verified active external memberships only; empty for external users). `configs` is a map by client ID.
- `PUT /clients/:clientId/config` body `{enabled, ownerIds: string[], editorIds: string[], timezone, automation: {enabled, sendTime, timezone, cadenceDays}}` → `{config}`. Owners/editors use existing staff IDs; editors still need ordinary `assignedProjects` membership for the master client's name.
- `PUT /defaults` body `{enabled,sendTime,timezone,cadenceDays}` → `{defaults}` (admin only).
- `GET /clients/:clientId/deliveries` → `{deliveries: []}` (settings managers only).
- `POST /clients/:clientId/preview` → `{subject,body,deliveryEnabled:false|true}`; no email sent.

## Deliverables
- `GET /clients/:clientId/deliverables` → `{deliverables: []}` (including archived staff records; external users see only shared, nonarchived records).
- `POST /clients/:clientId/deliverables` body editable fields below → `{deliverable}`.
- `GET /clients/:clientId/deliverables/:id` → `{deliverable}`.
- `PATCH /clients/:clientId/deliverables/:id` body `{revision,...editableFields}` → `{deliverable}`.
- `POST /clients/:clientId/deliverables/:id/actions` body `{revision,action,...}` → `{deliverable}`.

Editable fields: `title` (required), `type` (`Post|Reel|Story`), `ownerId`, `brief`, `caption`, `platforms` (Instagram/Facebook/LinkedIn/YouTube Shorts), `productionDueDate` (`YYYY-MM-DD` or null), `plannedAt` (ISO UTC instant or null), `timezone` (IANA, default Asia/Kolkata). Creation requires title/type/ownerId/brief; other fields default empty/null.

Deliverable includes `id,clientId`, editable fields, `revision` (optimistic concurrency integer), `stage` (`internal_draft|awaiting_reference|reference_changes|in_production|awaiting_final|final_changes|final_approved`), `shared`, `archived`, `scheduled` (null or `{at,actor,link}`), `assets` array, `approvals` map (`reference`/`final`), `createdAt,updatedAt`. External projection excludes brief, ownerId, productionDueDate and internal history. Client UI must not assume those exist.

Actions:
- `share` / `unshare`
- `archive` / `restore`
- `duplicate` (returns new internal draft)
- `request_approval` with `phase:reference|final`, `approverUid`
- `decide` with `phase`, `decision:approved|changes_requested`, `feedback` (required for changes). Assigned verified external approver only.
- `schedule` with optional HTTPS `link`; `unschedule`.
- `remind` (staff only; suppressed delivery still logged).

## Assets, messages and history
- `POST /clients/:clientId/deliverables/:id/assets` body `{revision, assetId?:string, phase:reference|final,kind:thumbnail|main|video|copy|file,label,url}` → `{deliverable}`. Omit assetId to create; supply stable ID to add a revision. HTTPS only. Assets have `id,phase,kind,label,url,revision,updatedAt,updatedBy,history[]`. Underlying SharePoint access is unchanged.
- `GET /clients/:clientId/deliverables/:id/messages/:thread` (`client|internal`) → `{messages:[]}`.
- `POST` same path body `{idempotencyKey,text}` → `{message}`. UUID-style key, stable on retry; server stamps identity/time. Internal thread denies all external identities.
- `GET /clients/:clientId/deliverables/:id/activity` → `{activity:[]}` staff only.

All write payloads reject unknown fields. Material edits invalidate approvals and schedule; obsolete revisions return 409. Request approval snapshots caption/assets; later revisions cannot silently inherit decisions. No endpoint publishes to social platforms or alters ordinary tasks.

Bootstrap additionally returns `staffCandidates: {id,name,clientIds}[]` for authorized settings managers to select existing project members before granting creative owner/editor roles. `owners` remains the currently authorized deliverable-owner selector. Configuration `ownerIds` grants creative editing only with existing project access; it does not confer Control Centre management authority.

Action responses may include `emailError` when the creative mutation was saved but its outbox enqueue failed. Display this warning without retrying the already-saved mutation.

Email policy: the effective Control Centre automation `enabled` switch covers every studio email kind, including approval requests, manual reminders, decisions, and escalations. Disabled-at-enqueue entries are logged as suppressed; disabling after queueing cancels delivery during the live pre-transport recheck. No suppressed/cancelled backlog is replayed. Missing Graph credentials prevents the worker from acquiring its shared job lock.

Deep links use `?deliverable=<itemId>`. External request/reminder links additionally use `client=1` for client sign-in. Staff decision/escalation links omit `client=1`; the staff app must select its Studio tab when a `deliverable` query parameter is present. Both workspaces resolve the item only through authorized API data after sign-in.
