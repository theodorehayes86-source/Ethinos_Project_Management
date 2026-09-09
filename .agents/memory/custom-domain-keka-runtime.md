---
name: Custom-domain Keka runtime
description: Deployment boundary between project.ethinos.com and the Replit-published service.
---

`project.ethinos.com` resolves to a separate Apache-hosted runtime rather than the Replit-published service. Keka configuration on one runtime does not imply that the other runtime has the same credentials.

**Why:** Browser requests reached the custom-domain API successfully, but its Keka settings reported the Base URL only; API key, client ID, and client secret were absent even though they existed in the Replit workspace. Re-saving them through the protected settings endpoint restored both connection testing and full sync.

**How to apply:** When Keka works in development but fails on the custom domain, query the custom domain's safe credential-status fields and test its public API route directly. Treat runtime credentials and CORS configuration as host-specific.