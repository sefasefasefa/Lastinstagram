---
name: Dev preview proxy can cache non-GET API responses by path
description: The Replit dev preview proxy appeared to return a stale cached response for POST requests to the same path, ignoring body/cookies.
---

While testing a login endpoint through the app-preview proxy path (not
hitting the backend port directly), repeated `POST /api/auth/login` calls
with different credentials returned an identical cached-looking response
(same body, same ETag) regardless of the request body or cookies sent —
even though hitting the backend's own port directly behaved correctly every
time.

**Why:** observed during a Clerk-to-username/password auth migration; wasted
significant debugging time assuming the login route itself was buggy.

**How to apply:** if API responses seen through the preview proxy seem
"stuck" (identical output across requests that should differ), don't just
suspect app logic — set `Cache-Control: no-store` on API responses in
development (gated on `NODE_ENV !== "production"`) and retest. Also
double-check you're not accidentally doubling a base path prefix when
constructing test URLs by hand (e.g. proxy prefix + app's own `/api` mount).
