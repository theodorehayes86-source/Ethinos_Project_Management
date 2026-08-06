---
name: Job-lock starvation across instances
description: Shared-Firebase scheduler locks must be acquired only after all skip-gates (full credential set, config) pass
---

# Job-lock starvation

**Rule:** Any cron job using a shared Firebase lock must verify the *complete* set of credentials/config it needs BEFORE acquiring the lock. An instance that takes the lock and then skips or fails wins the race every tick and starves every capable instance — dev and prod share the same Firebase, so their locks compete.

**Why:** A deployment published before its API secret existed grabbed the attendance lock every tick, skipped at debug level, and dev never ran. No errors anywhere; the only symptoms were "Lock held by another instance" on both sides and a null health node.

**How to apply:**
- Gate order: full credentials → lock → work. Log "not configured" skips at warn, never debug.
- A partial credential set (e.g. API key present but OAuth client secret missing) must also fail the pre-lock gate.
- If an old deployed build still takes the lock pre-gate, rename the lock key so new builds ignore it — and remember prod must be republished for fixes/secrets to take effect.
