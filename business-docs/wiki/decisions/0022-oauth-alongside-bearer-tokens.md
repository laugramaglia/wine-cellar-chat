---
adr: 0022
title: OAuth 2.1 runs alongside bearer tokens, not instead of them
status: accepted
date: 2026-08-29
affects:
  - authentication
  - authorization
  - token-administration
supersedes:
superseded_by:
source: human decision — a connected client (Gemini) refused the server, 2026-08-29
---

# ADR-0022 — OAuth 2.1 runs alongside bearer tokens, not instead of them

**Decision.** The server is an OAuth 2.1 authorization server **and** accepts static `wc_` bearer tokens on the same `/mcp` endpoint. A client presents either; the server resolves both to the same identity.

This takes the upgrade path [ADR-0003](0003-bearer-tokens-not-oauth-for-the-mvp.md) named, earlier than planned, and **adds** to it rather than replacing it. ADR-0003 is not superseded: its reasoning about why bearer tokens were right to start with still holds, and bearer tokens still work.

## Context

[ADR-0003](0003-bearer-tokens-not-oauth-for-the-mvp.md) chose static bearer tokens for the MVP and put OAuth 2.1 explicitly out of scope, listing it as the upgrade path. That decision rested on a premise stated in the opening paragraph of [[mvp-spec]]:

> *"Any MCP client — Claude (Desktop / Code / web), **Gemini**, Cursor, your own agent — connects to the same URL with its own bearer token."*

**That premise is false, and a user proved it by trying.** Gemini's connected-app dialog refuses a server that does not advertise OAuth, before it ever sends a request:

> *"Este servidor de MCP usa un método de autenticación que Gemini no admite. Gemini requiere OAuth estándar para las conexiones de servidor."*

There is no header field to fill in and no workaround inside that dialog. For an OAuth-only client, a bearer-token server is not merely inconvenient — it is unreachable. The cross-client promise that motivates this whole project ("every client sees the same cellar, because identity lives in the database") was therefore only true for the subset of clients that can set a raw header.

## Decision

`/mcp` sits behind an OAuth 2.1 authorization server (`@cloudflare/workers-oauth-provider`) with:

- **Discovery** at `/.well-known/oauth-authorization-server`
- **Dynamic Client Registration** at `/register`, so a client that cannot be pre-registered enrolls itself
- **Authorization** at `/authorize`, **token exchange** at `/token`
- **PKCE with S256 required**; the plain method is disabled
- Grants and registered clients in a KV namespace, `OAUTH_KV`

Static bearer tokens keep working on the *same* endpoint through the provider's `resolveExternalToken` hook: a credential the provider does not recognise as its own is handed to the existing `authenticate()` path. One endpoint, two credential types, one resolved identity.

### How a person proves who they are

The system has no passwords, so the consent screen asks for **an API token**. Pasting a live `wc_` token proves the same thing a password would, using a credential the user already holds, and it maps the grant onto the exact user row every other path resolves to. The token is verified and discarded; the connecting client never receives it.

### A grant can never exceed the token that authorized it

Permissions are narrowed three times, in order:

```
role_permissions(user.role)
  ∩ (identifying token's scopes ?? everything)
  ∩ (scopes the client requested)
```

So an admin authorizing a client that asks for `catalog:read` produces a session that can see two tools, not eighteen. This is the same intersection [ADR-0010](0010-two-layer-permission-enforcement.md) and the authorization model already describe, with one more term.

## Consequences

- **Gemini, Claude web, and every other OAuth-only client can now connect.** The premise of [[mvp-spec]] becomes true rather than aspirational.
- **Nothing that worked before broke.** Claude Code and Cursor keep their `Authorization: Bearer wc_…` header, against the same URL.
- A third credential lifetime now exists — OAuth access tokens (1 hour) and refresh tokens (30 days) — beside API tokens, which are still immortal by default. There is now *more* to reason about at revocation time, not less: revoking a `wc_` token does **not** revoke OAuth grants already authorized with it. That is a real gap and it is recorded below.
- Replaying an authorization code revokes the whole grant, including tokens already issued from it. This is required by OAuth 2.1 and it is worth knowing before debugging a mysterious 401 — it cost an hour during implementation.
- The server now stores state outside the database: `OAUTH_KV` holds grants and clients. The mocked-storage decision does not reach it.
- Dynamic Client Registration means **any party who can reach `/register` can enrol a client**. They still cannot obtain a grant without a user pasting a valid token at the consent screen, so this is not an access hole — but it is an unbounded write surface, and it is not rate limited.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep bearer tokens only | Leaves Gemini and every OAuth-only client permanently unable to connect, and leaves the specification's opening claim false. |
| Replace bearer tokens with OAuth | Breaks Claude Code, Cursor, scripts, and the smoke suite on the day it ships. There is no reason to lose a working path to gain another. |
| A second endpoint for OAuth (`/mcp-oauth`) | Two URLs to document, two to keep in step, and clients would eventually be pointed at the wrong one. `resolveExternalToken` makes one endpoint serve both. |
| A bridge process (`mcp-remote`) that injects the header | Works for desktop clients that spawn a local process. Gemini's connector is server-to-server; there is no local process to put in the middle. |
| Hand-roll the OAuth server | An authorization server is a security component with a long tail of details — PKCE, code replay, refresh rotation, client auth. Cloudflare's provider implements the RFCs and is maintained. |

## Still open

| Question | Why it matters |
| --- | --- |
| **Revoking a `wc_` token does not revoke grants authorized with it.** A user who revokes the token they used at the consent screen would reasonably expect the connected app to lose access. It does not. | Security. This is the most surprising behaviour in the design, and the most likely to be discovered the hard way. |
| Should `user_update status: suspended` revoke live OAuth grants? Suspension is checked at authentication for bearer tokens; an OAuth access token carries its props and is not re-checked until it expires. | Suspension is currently *not* immediate for OAuth sessions, unlike the bearer path the definition of done tests. |
| Is `/register` rate limited, and should DCR be restricted to known clients? | Unbounded client registration by anyone who can reach the endpoint. |
| Should the consent screen show which token identified the user, and let them pick a narrower one? | Right now any live token authorizes; the user cannot see what they are about to delegate. |
| No OAuth action is audited — not authorization, not token issuance, not revocation. | `audit_log` covers admin actions only; a whole new credential path leaves no trail. |

## Where this is enforced

`src/index.ts` (the `OAuthProvider` construction and `resolveExternalToken`), `src/oauth.ts` (the consent screen and the three-way permission intersection). Cite as `ADR-0022`. Tested end to end by `scripts/oauth-smoke.ts`. See [[authentication-index]] and [[security]].
