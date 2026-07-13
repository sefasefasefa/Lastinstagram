---
name: Windows-compatible pnpm monorepo scripts
description: What breaks a Replit-optimized pnpm workspace when contributors run it locally on Windows, and how to fix it.
---

Replit repls default to linux-x64, so some Replit-authored monorepos add `pnpm-workspace.yaml` `overrides` that set every non-linux-x64 platform binary (esbuild, lightningcss, @tailwindcss/oxide, rollup, @expo/ngrok-bin, etc.) to `"-"` to shrink install size. If the project is meant to also run on a contributor's own Windows/macOS machine, this silently breaks it: pnpm's lockfile then has no win32/darwin binary for those tools, so `vite`/`esbuild`/tailwind builds fail there with cryptic "no binary for platform" errors.

**Why:** those overrides look like a global platform exclusion but are actually a Replit-only optimization; removing win32/darwin entries (keep the exotic-arch exclusions) fixes it without giving up the size savings for Replit's own linux-x64 dev environment.

**How to apply:** when asked to make a Replit-built pnpm project "work on Windows"/"no esbuild errors locally", first check `pnpm-workspace.yaml` `overrides` for platform-binary exclusions before assuming it's a code bug. Remove the win32-*/darwin-* lines (leave other exotic platforms excluded), then `pnpm install` to refresh the lockfile with those platform entries.

Separately, also grep every `package.json` `scripts` block for bash-only syntax (`export FOO=bar && cmd`, `FOO=bar cmd`) — these fail on Windows cmd/PowerShell. Fix with `cross-env FOO=bar cmd` (add `cross-env` as a root devDependency; pnpm exposes root `node_modules/.bin` up the directory tree to child package scripts, so one root install covers every workspace package).
