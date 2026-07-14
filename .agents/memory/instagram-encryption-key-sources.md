---
name: Instagram encryption key sources
description: |
  Which Instagram endpoints return a usable password-encryption public key, and why
  `/data/shared_data/` can return a hex key that breaks OpenSSL public-key parsing.
---

Instagram exposes the password-encryption public key through multiple endpoints, but the
formats differ:

- `/api/v1/qe/sync/` returns a valid **base64-encoded PEM public key** in response
  headers `ig-set-password-encryption-key-id` and `ig-set-password-encryption-pub-key`.
  Importantly, it returns these headers even when the request body is rejected and the
  HTTP status is 400. This makes it the most reliable key source.

- `/api/v1/accounts/contact_point_prefill/` sometimes returns the key in headers or in the
  response body, but in practice it often returns only `{"status":"ok"}` without the key.

- `/data/shared_data/` returns an `encryption` object with `key_id`, `public_key`, and
  `version`. In newer versions the `public_key` is a **64-character hex string** (32 bytes).
  This is **not** a valid RSA/EC SPKI DER public key, so `crypto.createPublicKey` and the
  existing `#PWD_INSTAGRAM:4` encryption code throw an OpenSSL error:
  `error:1E08010C:DECODER routines::unsupported`.

**Decision:** Use `/api/v1/qe/sync/` as the primary key source. The request is sent through
`loginFetch` (Stealth-Requests bridge) with a minimal signed body. The bridge must treat
non-2xx HTTP status codes as a successful bridge invocation (returning `ok: true` and the
real status in `status`) so the caller can read the headers and proceed. `shared_data` is kept
only as a last fallback, and its key is rejected unless it looks like a valid base64 public
key.

**Why:** The encryption code is written for RSA PKCS#1 or ECIES over P-256, both of which
expect a PEM/SPKI public key. A 32-byte hex key would require a different algorithm (likely
X25519 or a pre-shared AES key) whose wire format is not documented in the current code.
Using the `qe/sync` PEM key avoids needing to implement that unknown format.
