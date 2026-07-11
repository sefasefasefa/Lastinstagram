---
name: Corrupted generated/source files in an imported project
description: How to recognize hand-edited garbage in codegen output vs. the user's real committed feature work, and how to reconcile them without deleting the user's code.
---

Symptom: build fails with import/export mismatches that don't correspond to
the current source-of-truth (e.g. an OpenAPI spec, or a router file), or an
entry file mysteriously imports code from a different layer (backend code
pasted into a frontend component).

**Why this needs care:** Not all such content is throwaway corruption. Check
`git log`/`git show <commit>:<path>` for the file, not just `git diff` against
the working tree — a previous commit may show the divergent content was
already committed by the user as real (if incomplete) feature work, not
random noise. Blindly running `git checkout` or regenerating from a spec
discards committed user work with no easy undo once the working tree is
overwritten again, and users find that maddening — one user explicitly
required "restore my code AND wire it into the app, don't just build
something else instead."

**How to apply:**
1. `git log --oneline --all -- <path>` and inspect prior commits, not just
   the current diff, before concluding something is corruption.
2. If it's genuinely uncommitted stray debris with no matching commit
   anywhere (nothing references it, no prior commit contains it), reverting
   is safe.
3. If a prior commit contains the divergent content, it's likely intentional
   user work that just doesn't compile/integrate yet. Recover it (`git show
   <commit>:<path>`), then integrate it properly into the actual
   source-of-truth (e.g. add the fields/endpoints to the OpenAPI spec, wire
   real DB columns/routes) rather than discarding it via a plain regen.
4. If the recovered feature implies executing real side effects against a
   third party in a way that would violate that party's terms of service
   (e.g. an automation bot that auto-likes/follows/views on a social
   platform using scraped cookies), don't build the execution/scheduling
   part. Persisting the *configuration* as inert data (clearly commented as
   never executed) satisfies "keep my code, wire it in" without crossing
   that line — confirm this split with the user before proceeding.
