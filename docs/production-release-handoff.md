# Flow Pro — production release handoff

## Current release checks (19 October 2026)

- Main production site: `https://project.ethinos.com`, managed by the hosting/development team.
- Its API health response reported build `a37f2fe`.
- 412 frontend and 395 API tests passed; desktop, mobile and API builds passed.
- The workspace Microsoft application authenticated with `Mail.Send`, `TeamsActivity.Send` and directory-read permission. This does not verify the separate host's credentials or real message delivery.
- Client/Studio API requests without authentication returned 401.
- Public sign-in page rendered. Signed-in production workflows were not browser-tested.
- Apache returned `X-Frame-Options: SAMEORIGIN`; this blocks Teams tab embedding, independently of Teams notification delivery.
- Replit's separate published service reported Autoscale. Its in-process schedules need an always-on Reserved VM if that service is intended to run them.

**This document is a handoff, not evidence that production configuration has been changed.**

## 1. Hosting team: correct Teams embedding headers

Back up the active virtual-host configuration. In the virtual host serving this app, enable `mod_headers` and remove both normal and “always” variants of the restrictive header:

```apache
Header unset X-Frame-Options
Header always unset X-Frame-Options
Header unset Content-Security-Policy
Header always set Content-Security-Policy "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.skype.com https://*.cloud.microsoft"
```

If the site already has other Content-Security-Policy directives, **preserve them** and merge the frame-ancestors directive rather than replacing the entire policy with the example above. Check upstream proxies/CDNs for duplicate conflicting policies.

The repository's `artifacts/pmt-app/public/.htaccess` is another option, but it only takes effect when Apache permits the directives through `AllowOverride FileInfo` (or equivalent). Changing the active virtual host is preferable when the existing `.htaccess` is ignored.

On Ubuntu/Apache, validate before reloading:

```sh
sudo apache2ctl configtest
# Proceed only if configuration syntax is valid.
sudo systemctl reload apache2
curl -sSI https://project.ethinos.com/
curl -sSI https://project.ethinos.com/mobile/
```

Expected on both entry points: no `X-Frame-Options`; a single effective CSP permitting the organization's Teams origin. Open the app in Teams desktop and web afterward. Retain the previous configuration for rollback.

## 2. Publish application code consistently

Deploy the API and desktop/mobile frontends from the same reviewed revision using the host's existing deployment process. Preserve host-specific environment configuration.

- Confirm `/api/healthz` returns the intended revision.
- Verify both desktop and mobile assets update; check cache/service-worker refresh behavior.
- Verify the actual production runtime has Firebase Admin, Microsoft sender/application configuration and the live Teams app ID. Do not copy credentials into tickets or logs.
- For the separate Replit deployment, publishing must be initiated by the workspace owner. Use Reserved VM if it is responsible for schedules; avoid accidentally running competing schedulers on multiple hosts.

## 3. Firebase — separate release gate

Do not blindly overwrite live rules. The earlier checked-in rules omitted existing staff collections and introduced role-map restrictions that ordinary password sign-in does not satisfy.

The compatibility update must:

- Deny reads/writes at the root and for unknown collections.
- Explicitly retain required staff collection access.
- Require an exact staff email domain and exclude every UID recorded as a client-portal identity on every browser grant.
- Keep client memberships, invitations, Creative Studio data, client task collaboration, delivery ledgers, role maps and scheduler locks server-only.
- Avoid depending on incomplete staff UID role mappings.

The local compatibility rules now cover the audited desktop, mobile and timer-widget paths. They deliberately preserve the live system's broad staff write permissions within the enumerated staff collections; they are **not** a new per-role authorization system. Keka integration settings, other server configuration and chat metadata stay inaccessible to browser clients. Attendance, leave, holidays and chat messages are browser-read-only.

Static policy tests were added, but Firebase rule-engine/emulator testing has not been completed in this workspace. Do not treat those tests as proof that production permissions work. No live rules have been applied.

Before deploying, compare with the latest live rules and inventory any host-specific collections. Keep a secure rules backup. Run rule-engine tests and synthetic staff/client acceptance tests. The API tests use mocks and do not prove live RTDB enforcement.

Do not copy, replace or clear production task/client data. A rules release is not a data migration.

## 4. Controlled acceptance matrix

Use approved internal test recipients and fictional clients, not real customer invitations.

| Area | Acceptance check |
| --- | --- |
| Staff authentication | Microsoft and password login; Admin, Director/manager and Employee |
| Staff workflows | Task creation/edit/status, timer/widget, profile, templates, checklists, settings |
| Client onboarding | Invitation → account setup → verification → assigned clients only |
| Isolation | Client A cannot access B, internal tasks, staff APIs or direct Firebase data |
| Client tasks | Shared fields, calendar, status, messages/notes/links, subtasks |
| Creative Studio | Enabled-client selection, content list/calendar, item detail, undated content |
| Email | One client update sends one email to its assigned staff recipient |
| Teams | Same update sends one activity notification to an opted-in user with app installed |
| Controls | Email off/Teams on and the reverse; both off; no alerts for staff changes/no-ops/retries |
| Revocation | Disabled/deleted/reassigned client access is denied |
| Scheduling | Reminder timezone/cadence and next-run behavior on the actual always-on runtime |

Record delivery evidence and any failures. Keep real client rollout paused until isolation and notification checks pass.
