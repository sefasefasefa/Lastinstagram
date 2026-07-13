---
name: api-client-react ApiError shape
description: Where the parsed error body lives on errors thrown by @workspace/api-client-react's generated hooks (custom-fetch based, not axios).
---

`@workspace/api-client-react`'s generated mutation/query hooks are built on a custom
`customFetch` wrapper (`lib/api-client-react/src/custom-fetch.ts`), not axios. On a
non-2xx response it throws `ApiError`, which has:
- `err.data` — the parsed JSON/text body (what you want)
- `err.response` — the raw Fetch `Response` object (no `.data` on it)
- `err.status`, `err.statusText`, `err.headers`, `err.method`, `err.url`

**Why:** it's easy to write `onError` handlers assuming the axios convention
(`err.response.data.someField`) since that pattern is common elsewhere. That path is
`undefined` on this client, so any field read that way (e.g. a custom `isCaptcha` flag
added to an error response) silently never triggers — no type error, no runtime error,
just a feature that appears broken while the network call is actually correct.

**How to apply:** in `onError` callbacks for hooks from `@workspace/api-client-react`,
read custom fields via `(err as { data?: {...} })?.data`, never `.response?.data`.
Grep for `.response?.data` / `.response.data` in frontend code as a smell when
debugging "the server sent it back but the UI doesn't show it."
