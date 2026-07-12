---
name: pnpm install blocked by firewall on a transitive package
description: Replit's package firewall can 403 a vulnerable transitive dependency (e.g. an old form-data pulled in by the deprecated `request` package) even when no direct dependency asks for it.
---

`pnpm install` can fail with `ERR_PNPM_FETCH_403 ... Forbidden` on a package
you never listed directly. This happens when an old, unmaintained direct
dependency (e.g. `instagram-private-api` -> `request` -> `request-promise`)
pulls in a vulnerable transitive version that the Replit package firewall
blocks.

**Why:** The firewall blocks known-vulnerable package *versions*, not names —
bumping the direct dependency to its latest release does not always help if
the vulnerable transitive pin is baked into an abandoned sub-dependency
(`request` hasn't been updated in years).

**How to apply:** Check `pnpm-lock.yaml` for which direct dependency resolves
to the blocked version. If bumping that direct dependency doesn't drop it,
add a root-level `pnpm.overrides` entry pinning the blocked package to a
newer, already-safe version that's also resolved elsewhere in the lockfile
(e.g. `"form-data@2.3.3": "^2.5.6"`), then re-run `pnpm install`.
