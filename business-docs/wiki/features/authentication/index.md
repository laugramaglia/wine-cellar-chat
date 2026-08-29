---
feature: authentication
page: index
status: stub
source_of_truth: wiki
code_refs:
  - README.md:311
updated: 2026-08-29
---

# Authentication

Turning an inbound HTTP request into a known caller. Every MCP request carries `Authorization: Bearer <token>`; this feature hashes it, looks it up, loads the user, resolves the effective permission set, and hands the result to the MCP agent as `props`. It starts at the Worker edge and ends the moment `props` exists — everything after that is [[authorization-index]].

It also owns the one path that exists outside the request cycle: the bootstrap script that seeds the first admin, because there is nobody to authorize creating them ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)).

> **Unverified.** No code implements any of this. Every claim below is traced to `README.md`, the project specification, and to nothing else. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | Any MCP request to `POST /mcp` (`README.md:25`, `README.md:384`); `scripts/bootstrap-admin.ts` (planned, `README.md:316`) |
| Owns | token format and hashing, the five-step per-request flow, the `props` shape, `last_used_at`, the first-admin bootstrap |
| Does not own | the permission model itself ([[authorization-index]]); issuing and revoking tokens ([[token-administration-index]]); account lifecycle and `status` transitions ([[user-administration-index]]) |
| Status | stub — specified, not built |

## Pages

- [[authentication-flow]] — the five-step per-request flow
- [[authentication-screens]] — none; client configuration instead
- [[authentication-states]] — token lifecycle, user status, `props`
- [[authentication-errors]] — five conditions, one `401`
- [[authentication-copy]] — user-visible strings
- [[authentication-validations]] — what is checked about the header and the token
- [[authentication-api]] — the transport contract; this feature exposes no tools
- [[authentication-decisions]] — the ADRs that bind it
- [[authentication-related]] — neighbours and shared concerns

## Rules

Indexed machine-readable form: `business-docs/rules/authentication.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `token-entropy` | A token is 32 bytes from `crypto.getRandomValues`. | `32` bytes | `README.md:321` |
| `token-encoding` | Encoded base64url. | base64url | `README.md:321` |
| `token-prefix` | Prefixed `wc_` so it is greppable in logs. | `wc_` | `README.md:321` |
| `token-storage-hash-only` | Only the SHA-256 hash is stored; plaintext is returned exactly once, at creation. | SHA-256 | `README.md:322` |
| `header-scheme` | Credential travels as `Authorization: Bearer <token>`. | `Bearer` | `README.md:26`, `README.md:385` |
| `reject-missing-header` | Missing or malformed header → `401`. | `401` | `README.md:329` |
| `reject-unknown-token` | Hash matches no row → `401`. | `401` | `README.md:330` |
| `reject-revoked-token` | `revoked_at` set → `401`. | `401` | `README.md:330` |
| `reject-expired-token` | `expires_at` passed → `401`. | `401` | `README.md:330` |
| `reject-inactive-user` | `user.status != active` → `401`. | `401` | `README.md:331` |
| `rejection-is-opaque` | All five rejections are indistinguishable to the caller: a bare `401`, no tool list, nothing. | one `401` | `README.md:144-145` |
| `auth-precedes-permissions` | Edge auth runs **before** any permission check. | ordering | `README.md:143` |
| `permission-resolution` | `permissions = role_permissions(user.role) ∩ (token.scopes ?? everything)`. | intersection | `README.md:332` |
| `scopes-null-means-inherit` | `scopes = null` means inherit the user's role in full. | `null` ⇒ all | `README.md:63`, `README.md:332` |
| `token-narrows-only` | A token can only narrow what the role allows, never widen it. | invariant | `README.md:112-114` |
| `props-shape` | The resolved identity is `{ userId, role, tokenId, permissions }`, passed as `props` on the `McpAgent`. | 4 fields | `README.md:333` |
| `five-step-per-request-flow` | Every request runs five ordered steps: read the `Authorization` header, hash and look up the token, load the user, resolve permissions, then pass `props` to the `McpAgent`. | 5 steps | `README.md:329-333` |
| `identity-from-props` | Handlers read the calling user from `props`, never from tool input. | invariant | `README.md:336-337` |
| `last-used-best-effort` | `last_used_at` is updated on the way through, best-effort, via `ctx.waitUntil`. | best-effort | `README.md:341` |
| `token-per-client` | One token per client (`label`), so revoking one client leaves the others working. | 1:1 | `README.md:323-324` |
| `bootstrap-by-script` | The first admin is seeded by `scripts/bootstrap-admin.ts`, which prints its token once. | script | `README.md:315-317` |
| `tokens-never-logged` | Tokens are never logged, plaintext or hashed. | never | `README.md:347` |

## Not real yet

Everything. There is no `src/`, no `scripts/`, no Worker. The only artifact in the repository is the specification.

Named-but-absent, in the order the specification names them:

| Thing | Specified at | State |
| --- | --- | --- |
| `src/index.ts` auth middleware | `README.md:355` | planned |
| `src/auth.ts` — bearer token → `props` | `README.md:357` | planned |
| `src/db/queries/tokens.ts` | `README.md:362` | planned |
| `scripts/bootstrap-admin.ts` | `README.md:370` | planned |
| `api_tokens` table | `README.md:60-61` | planned; `schema.sql` does not exist |

Do not cite any of these paths as evidence. They are a plan.
