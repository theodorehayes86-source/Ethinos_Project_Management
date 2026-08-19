---
name: Autoscale kills in-process cron
description: Why scheduled jobs (Keka attendance sync etc.) silently stop on the production deployment, and the mitigations in place.
---

The api-server runs all schedulers as in-process node-cron jobs. The production deployment was **autoscale**, which only runs while HTTP requests arrive — so schedulers silently paused whenever nobody used the site (attendance synced evenings only, stopped overnight/daytime lulls).

**Why:** Aug 2026 incident — attendance sync "temperamental", last pull stuck at previous evening; prod instance was asleep (7s cold start on healthz).

**How to apply:**
- `.replit` deploymentTarget is now `vm`; the user must RE-PUBLISH for it to take effect. Never switch back to autoscale while in-process cron exists.
- Defense in depth added: `evaluateTickGate()` runs BEFORE lock acquisition; a stale-catch-up override syncs immediately when lastAttendanceSync is >45 min old or from a previous day (06:00–22:00); a 15s startup catch-up heals wake-ups.
- Manual `/admin/attendance/sync-now` shares the same distributed lock (`schedulerLocks/attendance-10min-v2`) and returns 409 if a sync is running.
- UI rule: sync buttons must not hard-disable on a FAILED settings fetch — only when settings were read and credentials are truly missing (`kekaSettingsKnown`).
