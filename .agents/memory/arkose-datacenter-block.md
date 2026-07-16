---
name: Arkose datacenter IP block
description: Arkose and Instagram both block login attempts from Replit data center IPs; workaround is session cookie login.
---

## Rule
Replit's server IP is a data center IP. Both Instagram and Arkose Labs detect this:
- Instagram: returns HTTP 400 with `bad_password` + zero cookies → code correctly reclassifies as `captcha`
- Arkose: returns `DENIED ACCESS` (status 400) on `POST /fc/gt2/public_key/` → funcaptcha solver cannot get a token

**Why:** Cloud/datacenter IP ranges are blocklisted by Arkose's bot-detection layer before any challenge is issued.

**How to apply:**
- Do not expect funcaptcha auto-solve to work from Replit without residential proxies.
- The correct fallback is session cookie login: `POST /api/auth/login-with-cookie` (added to auth.ts), which bypasses the password flow entirely.
- Proxies go in `lib/funcaptcha-solver/data/proxies.txt` (one per line: `ip:port` or `user:pass@ip:port`).
- Instagram sitekey correct API URL: `https://client-api.arkoselabs.com` — `instagram-api.arkoselabs.com` does NOT exist (DNS NXDOMAIN).
