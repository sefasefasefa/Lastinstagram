---
name: Instagram login error classification
description: How this project distinguishes checkpoint/captcha/rate-limit/spam-block failures from a genuinely wrong username/password during Instagram login.
---

Instagram's `/accounts/login/` (mobile) and web AJAX login endpoints don't signal
challenges consistently:
- Sometimes `data.error_type` is set (`checkpoint_required`, `rate_limit_error`,
  `feedback_required`, etc.)
- Sometimes only `data.checkpoint_url` / `data.challenge` is present, no error_type
- Sometimes there's no structured field at all — only a human-readable `data.message`
  string ("Please wait a few minutes before you try again.", "We suspect automated
  behavior...")
- HTTP status alone doesn't disambiguate — checkpoint/challenge responses are often
  HTTP 400, same as a bad password.

**Why:** treating any of these as "wrong username or password" is misleading and
previously caused the login page to show a generic credentials error when the real
cause was a captcha/checkpoint/rate-limit — the user has no way to act on that.

**How to apply:** classification is centralized in
`lib/instagram-client/src/direct-login.ts` (`classifyInstagramLoginError`), which checks
error_type, checkpoint_url/challenge fields, and message keywords, in that priority
order, and returns one of `checkpoint | captcha | rate_limit | spam_or_abuse | null`.
Both login paths (mobile + web) call it before falling through to
bad_password/unknown. `InstagramClient` (`lib/instagram-client/src/index.ts`) wraps
these into `InstagramCaptchaChallengeError` (carries `captchaType`), which
`artifacts/api-server/src/routes/auth.ts` catches specifically to return
`{ error, isCaptcha: true, captchaType }` instead of the generic credentials message.
The frontend (`artifacts/takipci-paneli/src/pages/login.tsx`) checks `isCaptcha` to
render a distinct amber "security verification" alert instead of the plain red
credentials error box. A separate, simpler heuristic (`artifacts/api-server/src/lib/captchaDetection.ts`,
keyword/status-code based) exists for the unrelated manual "Test Et" outbound-request
feature in Settings — that one inspects an arbitrary HTTP response body/headers, not
Instagram's login JSON, so it isn't unified with `classifyInstagramLoginError`; keep
both in sync in spirit (same captcha/rate-limit/spam vocabulary) if extending either.
