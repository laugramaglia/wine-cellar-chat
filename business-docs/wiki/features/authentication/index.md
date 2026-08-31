---
feature: authentication
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:325
updated: 2026-08-29
---

# Authentication

Turning an inbound HTTP request into a known caller. Every MCP request carries `Authorization: Bearer <token>`; this feature hashes it, looks it up, loads the user, resolves the effective permission set, and hands the result to the MCP agent as `props`. It starts at the Worker edge and ends the moment `props` exists — everything after that is [[authorization-index]].

It also owns the one path that exists outside the request cycle: the bootstrap script that seeds the first admin, because there is nobody to authorize creating them ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)).

> **Unverified.** No code implements any of this. Every claim below is traced to [[mvp-spec]], the project specification, and to nothing else. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | Any MCP request to `POST /mcp` (`business-docs/wiki/shared/mvp-spec.md:39`, `business-docs/wiki/shared/mvp-spec.md:398`); `scripts/bootstrap-admin.ts` (planned, `business-docs/wiki/shared/mvp-spec.md:330`) |
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
| `token-entropy` | A token is 32 bytes from `crypto.getRandomValues`. | `32` bytes | `business-docs/wiki/shared/mvp-spec.md:335` |
| `token-encoding` | Encoded base64url. | base64url | `business-docs/wiki/shared/mvp-spec.md:335` |
| `token-prefix` | Prefixed `wc_` so it is greppable in logs. | `wc_` | `business-docs/wiki/shared/mvp-spec.md:335` |
| `token-storage-hash-only` | Only the SHA-256 hash is stored; plaintext is returned exactly once, at creation. | SHA-256 | `business-docs/wiki/shared/mvp-spec.md:336` |
| `header-scheme` | Credential travels as `Authorization: Bearer <token>`. | `Bearer` | `business-docs/wiki/shared/mvp-spec.md:40`, `business-docs/wiki/shared/mvp-spec.md:399` |
| `reject-missing-header` | Missing or malformed header → `401`. | `401` | `business-docs/wiki/shared/mvp-spec.md:343` |
| `reject-unknown-token` | Hash matches no row → `401`. | `401` | `business-docs/wiki/shared/mvp-spec.md:344` |
| `reject-revoked-token` | `revoked_at` set → `401`. | `401` | `business-docs/wiki/shared/mvp-spec.md:344` |
| `reject-expired-token` | `expires_at` passed → `401`. | `401` | `business-docs/wiki/shared/mvp-spec.md:344` |
| `reject-inactive-user` | `user.status != active` → `401`. | `401` | `business-docs/wiki/shared/mvp-spec.md:345` |
| `rejection-is-opaque` | All five rejections are indistinguishable to the caller: a bare `401`, no tool list, nothing. | one `401` | `business-docs/wiki/shared/mvp-spec.md:158-159` |
| `auth-precedes-permissions` | Edge auth runs **before** any permission check. | ordering | `business-docs/wiki/shared/mvp-spec.md:157` |
| `permission-resolution` | `permissions = role_permissions(user.role) ∩ (token.scopes ?? everything)`. | intersection | `business-docs/wiki/shared/mvp-spec.md:346` |
| `scopes-null-means-inherit` | `scopes = null` means inherit the user's role in full. | `null` ⇒ all | `business-docs/wiki/shared/mvp-spec.md:77`, `business-docs/wiki/shared/mvp-spec.md:346` |
| `token-narrows-only` | A token can only narrow what the role allows, never widen it. | invariant | `business-docs/wiki/shared/mvp-spec.md:126-128` |
| `props-shape` | The resolved identity is `{ userId, role, tokenId, permissions }`, passed as `props` on the `McpAgent`. | 4 fields | `business-docs/wiki/shared/mvp-spec.md:347` |
| `five-step-per-request-flow` | Every request runs five ordered steps: read the `Authorization` header, hash and look up the token, load the user, resolve permissions, then pass `props` to the `McpAgent`. | 5 steps | `business-docs/wiki/shared/mvp-spec.md:343-347` |
| `identity-from-props` | Handlers read the calling user from `props`, never from tool input. | invariant | `business-docs/wiki/shared/mvp-spec.md:350-351` |
| `last-used-best-effort` | `last_used_at` is updated on the way through, best-effort, via `ctx.waitUntil`. | best-effort | `business-docs/wiki/shared/mvp-spec.md:355` |
| `token-per-client` | One token per client (`label`), so revoking one client leaves the others working. | 1:1 | `business-docs/wiki/shared/mvp-spec.md:337-338` |
| `bootstrap-by-script` | The first admin is seeded by `scripts/bootstrap-admin.ts`, which prints its token once. | script | `business-docs/wiki/shared/mvp-spec.md:329-331` |
| `tokens-never-logged` | Tokens are never logged, plaintext or hashed. | never | `business-docs/wiki/shared/mvp-spec.md:361` |
| `token-hash-is-unique-32-bytes` | `api_tokens.token_hash` is a `bytea` of exactly 32 bytes with a unique index, so step 2 of the per-request flow is provably single-row and a truncated or wrongly encoded hash fails at write time. | `UNIQUE`, `octet_length = 32` | [ADR-0018](../../decisions/0018-token-identity-is-constrained-in-the-database.md), [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) |
| `deleted-user-rejected-by-existing-check` | A `deleted` user is rejected by the existing `status != active` step, with no additional branch — much of the argument for putting deletion in the status column. | step 3, unchanged | [ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) |
| `two-credential-types-one-endpoint` | `/mcp` accepts an OAuth 2.1 access token or a static `wc_` bearer token, and resolves both to the same identity. One endpoint, two credential types. | OAuth 2.1 + bearer | [ADR-0022](../../decisions/0022-oauth-alongside-bearer-tokens.md) |
| `oauth-session-not-rechecked` | An OAuth access token carries its props from the grant and is not re-checked against user status until it expires (1 hour), so suspension is **not** immediate for an OAuth session — unlike the bearer path. | up to 1 hour | [ADR-0022](../../decisions/0022-oauth-alongside-bearer-tokens.md) |

## Not real yet

Everything. There is no `src/`, no `scripts/`, no Worker. The only artifact in the repository is the specification.

Named-but-absent, in the order the specification names them:

| Thing | Specified at | State |
| --- | --- | --- |
| `src/index.ts` auth middleware | `business-docs/wiki/shared/mvp-spec.md:369` | planned |
| `src/auth.ts` — bearer token → `props` | `business-docs/wiki/shared/mvp-spec.md:371` | planned |
| `src/db/queries/tokens.ts` | `business-docs/wiki/shared/mvp-spec.md:376` | planned |
| `scripts/bootstrap-admin.ts` | `business-docs/wiki/shared/mvp-spec.md:384` | planned |
| `api_tokens` table | `business-docs/wiki/shared/mvp-spec.md:74-75` | planned; `schema.sql` does not exist |

Do not cite any of these paths as evidence. They are a plan.
