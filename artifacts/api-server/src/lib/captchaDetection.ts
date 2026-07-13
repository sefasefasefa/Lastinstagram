/**
 * Lightweight captcha / anti-bot challenge detection for the manual "Test Et"
 * request. This is a best-effort heuristic: the target site may return many
 * different challenge pages, so we look at HTTP status, response body text and
 * common response headers.
 */

export interface CaptchaDetectionResult {
  isCaptcha: boolean;
  captchaType: string | null;
}

const BODY_PATTERNS: { type: string; keywords: string[] }[] = [
  { type: "recaptcha", keywords: ["g-recaptcha", "recaptcha", "grecaptcha", "recaptcha.net", "google.com/recaptcha"] },
  { type: "hcaptcha", keywords: ["hcaptcha", "h-captcha", "hcaptcha.com"] },
  { type: "cloudflare-turnstile", keywords: ["cf-turnstile", "turnstile", "challenges.cloudflare.com"] },
  { type: "cloudflare", keywords: ["cloudflare", "cf-ray", "__cf_bm", "attention required", "checking your browser", "just a moment", "verify you are human", "verify you're human"] },
  {
    type: "instagram-checkpoint",
    keywords: [
      "checkpoint", "checkpoint_required", "checkpoint_challenge_required",
      "challenge", "challenge_required", "rechallenge", "consent_required",
      "www.instagram.com/challenge", "/challenge/",
    ],
  },
  {
    type: "instagram-spam-block",
    keywords: [
      "feedback_required", "\"spam\"", "sentry_block", "suspicious_login_reported",
      "action blocked", "we restrict certain activity", "temporarily blocked",
      "we detected unusual activity", "unusual activity", "suspicious activity",
      "automated behavior", "this account has been", "account has been disabled",
    ],
  },
  {
    type: "rate-limit",
    keywords: [
      "rate limit", "rate_limit_error", "too many requests", "throttled",
      "try again later", "please wait a few minutes", "wait a few minutes before",
    ],
  },
  {
    type: "generic-bot",
    keywords: [
      "captcha", "robot", "bot check", "are you human", "i'm not a robot",
      "prove you're not a robot", "prove you are not a robot", "security check",
      "spam", "blocked", "access denied", "forbidden", "unusual traffic",
    ],
  },
];

const HEADER_PATTERNS: { type: string; keywords: string[] }[] = [
  { type: "cloudflare", keywords: ["cf-ray", "cf-cache-status", "cloudflare"] },
  { type: "instagram-checkpoint", keywords: ["checkpoint_url", "x-ig-challenge"] },
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function findMatch(
  text: string,
  patterns: { type: string; keywords: string[] }[],
): { type: string; keyword: string } | null {
  const lower = normalize(text);
  for (const pattern of patterns) {
    for (const keyword of pattern.keywords) {
      if (lower.includes(normalize(keyword))) {
        return { type: pattern.type, keyword };
      }
    }
  }
  return null;
}

function headerString(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function detectCaptcha(
  status: number,
  statusText: string,
  headers: Record<string, string>,
  body: string,
): CaptchaDetectionResult {
  // Common status codes for captcha / bot challenges. 400 is included because
  // Instagram's own checkpoint/challenge responses are frequently HTTP 400.
  const challengeStatuses = new Set([400, 401, 403, 429, 503]);
  const isChallengeStatus = challengeStatuses.has(status);

  const bodyMatch = findMatch(body, BODY_PATTERNS);
  const headerMatch = findMatch(headerString(headers), HEADER_PATTERNS);

  // If any strong keyword appears, report it regardless of status code.
  if (bodyMatch) {
    return { isCaptcha: true, captchaType: bodyMatch.type };
  }
  if (headerMatch) {
    return { isCaptcha: true, captchaType: headerMatch.type };
  }

  // If no keyword matches but the status is a challenge status and the body
  // is short/non-HTML, it is likely a generic block page.
  if (isChallengeStatus && body.length < 800) {
    return { isCaptcha: true, captchaType: "generic" };
  }

  return { isCaptcha: false, captchaType: null };
}
