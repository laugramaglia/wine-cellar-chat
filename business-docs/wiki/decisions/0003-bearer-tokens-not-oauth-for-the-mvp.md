---
adr: 0003
title: Static bearer tokens for the MVP, OAuth 2.1 as the upgrade path
status: accepted
date: 2026-08-29
affects:
  - authentication
  - token-administration
supersedes:
superseded_by:
source: business-docs/wiki/shared/mvp-spec.md:38
---

# ADR-0003 — Static bearer tokens for the MVP, OAuth 2.1 as the upgrade path

**Decision.** Authentication is a static bearer token per client, hand-rolled. OAuth 2.1 and `workers-oauth-provider` are explicitly out of scope for the MVP.

## Context

Remote MCP servers on Cloudflare have first-class OAuth support via `workers-oauth-provider`. Using it would mean a consent screen, an authorization server, refresh handling, and client registration — before a single bottle can be stored.

The server's users are a handful of known people whose accounts an admin creates by hand (`business-docs/wiki/shared/mvp-spec.md:221`).

## Decision

Issue static bearer tokens, one per client, and check them at the Worker edge. OAuth 2.1 is named as the upgrade path (`business-docs/wiki/shared/mvp-spec.md:43`), not as a non-goal.

## Consequences

- A client is connected by pasting a URL and a header. Nothing else.
- Token lifecycle becomes this project's problem: generation, hashing, expiry, revocation, scoping — all specified in [[security]] and owned by [[token-administration-index]].
- No consent flow, so a token is bearer-equivalent to the account's permissions, narrowed only by its `scopes`.
- Migrating to OAuth later means the `props` shape on `McpAgent` must not assume a static token. Anything that reads `tokenId` outside the auth layer will need revisiting.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| `workers-oauth-provider` now | Substantial build for a handful of known users; delays every other feature. |
| No auth, one shared cellar | Defeats the point — per-user cellars, prefs, and review history are the product. |

## Where this is enforced

`src/auth.ts` (planned). Cite as `ADR-0003`.
