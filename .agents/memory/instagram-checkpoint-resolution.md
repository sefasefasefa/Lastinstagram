---
name: Instagram checkpoint resolution flow
description: How this project's interactive checkpoint (security-verification) flow is structured, and that it is unverified against a real challenge.
---

Instagram checkpoints and 2FA are **different protocols** — don't conflate them:
- 2FA (TOTP/SMS/backup code) uses the Bloks CAA flow: `two_factor_info` →
  `two_step_verification_context` → `verify_code.async`. Already implemented and
  working (`completeTwoFactorLogin` in `direct-login.ts`).
- Checkpoint (security/anti-bot challenge) uses a separate `checkpoint_url` +
  "challenge/resolve" flow: GET the URL for `step_name`/`step_data`, POST a
  `choice` to trigger sending a code to a contact method (email/SMS), then POST
  `security_code` to verify.

**Why this matters:** the checkpoint flow is Instagram's undocumented private
API — there's no official spec for `step_data`'s shape or which `choice` value
maps to which contact method. This project's implementation (`fetchChallengeContext`,
`selectChallengeMethod`, `submitChallengeCode` in `lib/instagram-client/src/direct-login.ts`)
follows patterns observed in community Instagram API clients (choice "0" = SMS,
"1" = email, inferred from presence of `step_data.phone_number`/`email`), but
**has not been verified end-to-end against a real triggered checkpoint**.

**How to apply:** if a real checkpoint doesn't resolve correctly, don't guess —
check the `[verifySession]`/challenge logs for the raw `step_name`/`step_data`
Instagram actually returned (logged without secrets) and adjust the
choice-extraction logic accordingly. The resolution flow is wired end-to-end:
`InstagramClient.pendingCheckpoint` → `/auth/checkpoint/options` →
`/auth/checkpoint/select-method` → `/auth/checkpoint/verify` →
`artifacts/takipci-paneli/src/pages/login.tsx` (method-select step, then code-entry step).

**Confirmed real-world case (2026-07-15):** login itself can succeed (cookies
applied) but the immediate post-login `verifySession()` current_user check
gets a 400 with a genuinely empty body (no JSON keys at all, no
`checkpoint_url`) — this is Instagram flatly rejecting the session (bot/automation
detection on this device fingerprint/IP), not a resolvable "enter a code"
checkpoint. There is no challenge to solve via the API in that state, so the
interactive flow correctly can't trigger. This case is now classified as a
distinct `captchaType: "blocked"` (separate from `"checkpoint"`) with an
honest message, instead of falsely implying a checkpoint code exists.
`verifySession()` also now logs the raw response text (not just parsed JSON
keys) when the body doesn't parse, to aid diagnosing future unclassified 400s.
