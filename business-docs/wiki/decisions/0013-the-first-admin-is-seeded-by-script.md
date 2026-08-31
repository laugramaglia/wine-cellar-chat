---
adr: 0013
title: The first admin is seeded by a script, not created through a tool
status: accepted
date: 2026-08-29
affects:
  - authentication
  - user-administration
supersedes:
superseded_by:
source: business-docs/wiki/shared/mvp-spec.md:327
---

# ADR-0013 — The first admin is seeded by a script, not created through a tool

**Decision.** `scripts/bootstrap-admin.ts` seeds the first admin and prints its token once. Every account after that is created through `user_create` by an existing admin.

## Context

`user_create` requires `admin:users`. On an empty database nobody holds it, so the first admin cannot be created through the tool surface — there is nobody to authorize it.

The usual escape hatches are worse than the problem: a tool that works only when the users table is empty is a race and a permanent unauthenticated code path; an environment-variable admin token is a static secret that never rotates.

## Decision

Keep it outside the request path entirely. A script with direct database access, run deliberately by an operator, once.

## Consequences

- No unauthenticated code path exists in the deployed Worker at all.
- Bootstrapping requires database credentials and an operator, which is correct for an operation that mints an admin.
- The script is a privileged artifact: anyone who can run it against production can mint an admin. It must not be reachable from the Worker.
- The specification does not say whether re-running it is safe. It should be idempotent or refuse when an admin exists — an open question for [[user-administration-index]].

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A `bootstrap` tool that works only on an empty users table | A permanent unauthenticated path guarded by a race. |
| Admin token in an environment variable | A static credential that outlives every rotation policy. |
| First caller becomes admin | Whoever finds the URL first owns the server. |

## Where this is enforced

`scripts/bootstrap-admin.ts` (planned). Cite as `ADR-0013`.
