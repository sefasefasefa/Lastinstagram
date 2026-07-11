---
name: Corrupted generated/source files in an imported project
description: How to recognize and fix hand-edited garbage left inside codegen output or entry files by whatever produced/edited the imported repo before it reached Replit.
---

Symptom: build fails with import/export mismatches that don't correspond to
the current source-of-truth (e.g. an OpenAPI spec, or a router file), or a
frontend entry file mysteriously imports backend-only packages
(`express-session`, `connect-pg-simple`) it has no reason to use.

**Why:** The file's content doesn't match what its stated generator/purpose
would produce — it contains extra fields, Turkish comments, or code for a
completely different layer (backend code pasted into a frontend component).
This happens when a prior tool/edit corrupted the file without leaving any
task-tracker trace, so there's no changelog to consult — only the file
content itself is evidence.

**How to apply:**
1. Run `git diff <path>` against HEAD. If the working copy diverges from a
   committed version that looks correct/consistent, that's the smoking gun.
2. For generated files (codegen output): `git checkout -- <path>` to revert,
   then re-run the actual codegen command (e.g. `orval` via the package's
   `codegen` script) from the real source of truth — don't hand-patch
   generated output.
3. For hand-written source files: if a committed version exists and matches
   the rest of the codebase's imports/usage, `git checkout -- <path>` is
   sufficient.
4. Check for stray leftover files the corruption may have introduced (e.g.
   an unused module referenced only by the corrupted file) and delete them
   if nothing legitimate imports them.
