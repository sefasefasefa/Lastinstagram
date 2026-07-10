---
name: Unregistered imported artifacts
description: How to fix a GitHub-imported project whose artifacts/*/.replit-artifact/artifact.toml files exist on disk but aren't registered with the platform (listArtifacts() empty, WorkflowsRestart says workflow doesn't exist).
---

Symptom: `artifacts/<slug>/.replit-artifact/artifact.toml` files exist and look correct, but `listArtifacts()` returns `{"artifacts":[]}` and `WorkflowsRestart` fails with "doesn't exist in config" for every artifact's service.

Fix: call `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })` with the existing TOML content copied verbatim into a sibling temp file (no changes needed) for just one of the artifacts. This triggers the platform to auto-discover and register all artifacts in the workspace at once, creating their managed workflows. After that, `WorkflowsRestart` works normally with the standard `artifacts/<slug>: <service-name>` names.

**Why:** This happens when a project is imported (e.g. from a GitHub repo) with artifact directory structure already present but never went through `createArtifact()` in this platform session, so the artifact registry/workflow config never got created.

**How to apply:** If an imported project has `artifacts/*/.replit-artifact/artifact.toml` but `listArtifacts()` is empty, do this registration trick before trying to configure workflows manually.
