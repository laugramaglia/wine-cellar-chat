---
feature: authentication
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Authentication — decisions

ADRs that constrain this feature. The ADR is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) | Static bearer tokens per client; OAuth 2.1 is the upgrade path, not a non-goal. | Defines the whole mechanism. A token is bearer-equivalent to its account's permissions, narrowed only by `scopes`, because there is no consent flow to narrow it further. It also makes token lifecycle this project's problem rather than a library's. |
| [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) | Only the SHA-256 hash is stored; plaintext is returned exactly once, at creation. | Dictates step 2 of [[authentication-flow]]: the request path can only ever *hash and compare*. A lost token is replaced, never recovered, so every recovery path in [[authentication-errors]] runs through reissue. |
| [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md) | The first admin is seeded by `scripts/bootstrap-admin.ts`, not by a tool. | The reason **no unauthenticated code path exists in the deployed Worker at all**. Every request without a valid token is a `401`, with no bootstrap exception to carve out. |
| [ADR-0018](../../decisions/0018-token-identity-is-constrained-in-the-database.md) | `token_hash` is a unique 32-byte `bytea`; a live `label` is unique per user; `scopes` is null or non-empty | Makes step 2 of the per-request flow (`business-docs/wiki/shared/mvp-spec.md:342`) provably single-row — with no constraint, a duplicate hash from a bug or a restore authenticates as whichever row the planner returned first. The length check turns a truncated or wrongly encoded hash into a write-time failure instead of an auth-path mystery |
| [ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) | Deletion is a status | A deleted user is rejected by the existing `status != active` rule (`business-docs/wiki/shared/mvp-spec.md:344`) with no new branch — which is much of the argument for putting `deleted` in the status column rather than beside it |
| [ADR-0022](../../decisions/0022-oauth-alongside-bearer-tokens.md) | The server is an OAuth 2.1 authorization server **and** accepts static `wc_` bearer tokens on the same `/mcp` endpoint | **Reshapes this feature.** There are now two credential types resolving to one identity: an OAuth access token, or a `wc_` token via the provider's `resolveExternalToken` hook. The five-step flow is unchanged for bearer tokens and is bypassed entirely for OAuth ones, which carry their props from the grant — so a suspended user is *not* rejected immediately on an OAuth session, unlike the bearer path |

Adjacent, and worth knowing while reading this feature:

| ADR | Relevance |
| --- | --- |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | Why [[authentication-api]] documents a transport contract instead of an OpenAPI path. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | What happens *after* `props` exists. Owned by [[authorization-index]]. |
| [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md) | Why the permission set resolved at step 4 is total over the tool catalogue. |

## Cite these in code

When the middleware is written, cite `ADR-0003` in `src/auth.ts`, `ADR-0012` next to the hash comparison, and `ADR-0013` at the top of `scripts/bootstrap-admin.ts`. `check-wiki.sh` verifies that every `ADR-NNNN` cited in code resolves to a real decision file.

## Open questions

Decisions this feature still needs. Each is a real gap in [[mvp-spec]], not a stylistic omission. Recorded here rather than invented as an ADR.

| Question | Blocked on | Detail |
| --- | --- | --- |
| Is restoring a suspended user meant to restore all their tokens? | a product call | Suspension does not revoke; step 3 simply fails. Reinstating silently re-enables every token the account ever had ([[authentication-states]], [[divergences]]). If the answer is no, `user_update` must revoke on suspend — and reinstatement then means reissuing. |
| Should tokens expire by default? | a product call | `expires_at` is optional (`business-docs/wiki/shared/mvp-spec.md:339`), so the default credential is immortal, and no rotation policy exists. [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) accepts hand-rolled tokens on the strength of a small known user set; a default expiry is what keeps that argument true over time. |
| Is `scripts/bootstrap-admin.ts` idempotent, or does it refuse when an admin exists? | an implementation decision, then an ADR amendment | Unstated (`business-docs/wiki/shared/mvp-spec.md:327-332`). [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md) already names this as an open question. |
| Is there any rate limiting? | a product call | None is described anywhere. Also whether a failed authentication is logged at all — without that there is no way to notice a brute-force attempt ([[audit-logging]]). |
| Does revocation reach an established `McpAgent` session? | an implementation decision | `token_revoke` "takes effect immediately" (`business-docs/wiki/shared/mvp-spec.md:247`); `props` is resolved once, on a Durable Object. The definition of done tests connect-time rejection only (`business-docs/wiki/shared/mvp-spec.md:417`). |
| Is the token lookup constant-time? | an implementation decision | Unspecified. Low risk at 32 bytes of entropy — worth doing, not worth alarm ([[security]]). Hash uniqueness is no longer open: [ADR-0018](../../decisions/0018-token-identity-is-constrained-in-the-database.md) makes `token_hash` a unique 32-byte `bytea`. |
