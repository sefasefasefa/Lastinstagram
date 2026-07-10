---
name: connect-pg-simple createTableIfMissing breaks under esbuild bundling
description: express-session + connect-pg-simple's auto table creation throws ENOENT when the API server is bundled with esbuild.
---

`connect-pg-simple`'s `createTableIfMissing: true` option reads a `table.sql`
file from its own package directory at runtime. esbuild bundles don't carry
non-JS package assets along, so in a bundled server this throws
`ENOENT: no such file or directory, open '.../dist/table.sql'` on first use.

**Why:** discovered while wiring express-session + connect-pg-simple as a
Postgres-backed session store for a plain username/password login (replacing
Clerk) in an esbuild-bundled Express API.

**How to apply:** when using connect-pg-simple (or any package that lazily
reads bundled asset files) behind an esbuild/webpack/etc. bundle, don't rely
on its "create table if missing" convenience option. Instead declare the
session table explicitly in your own schema (e.g. a Drizzle table matching
connect-pg-simple's expected `session(sid, sess, expire)` shape) and keep it
in sync via your normal migration/push flow. Pass `createTableIfMissing: false`.
