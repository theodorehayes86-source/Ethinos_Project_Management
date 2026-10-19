---
name: Preview origin checks
description: Screenshot requests can use a different origin from the user's proxied preview
---

The screenshot browser uses a loopback origin; this API's CORS policy can reject
its POSTs even when the same request works in the user's development preview.

**Why:** An invitation-screen capture returned a CORS 500 for the loopback origin.
The same invalid invitation submitted through the development domain returned the
intended 400 response.

**How to apply:** Check the request through the real development origin before
diagnosing an API failure from a screenshot. Do not loosen production CORS or
authentication to make screenshots pass. Disclose when this prevents visual
verification of a flow.
