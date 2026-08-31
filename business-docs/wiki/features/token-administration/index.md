---
feature: token-administration
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:238
updated: 2026-08-29
---

# Token administration

Issuing, listing, and revoking the API tokens that let an MCP client act as a user. An admin mints one token per client — `claude-desktop`, `gemini`, `phone` — optionally narrower than the user's role and optionally with an expiry, hands the plaintext to the person once, and can kill any one of them without touching the others. It starts at `token_create` and ends when a row in `api_tokens` is written or stamped `revoked_at`; what happens to that token on a request is [[authentication-index]].

> **Unverified.** No code implements any of this. Every claim below is traced to [[mvp-spec]], the project specification, and to nothing else. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | `token_create`, `token_list`, `token_revoke` (`business-docs/wiki/shared/mvp-spec.md:238-247`); `user_create` with `issue_token: true`, which mints the first key inline (`business-docs/wiki/shared/mvp-spec.md:223-225`) |
| Owns | the three token tools, the `api_tokens` row, the one-token-per-client convention, and the disclosure rules |
| Does not own | the per-request token check ([[authentication-index]]); what a permission means ([[authorization-index]]); account creation, suspension, deletion ([[user-administration-index]]) |
| Status | stub — specified, not built |

## Pages

- [[token-administration-flow]] — issuing, listing, revoking
- [[token-administration-screens]] — none; the MCP client is the UI
- [[token-administration-states]] — the token lifecycle, and what suspension does to it
- [[token-administration-errors]] — what fails and how it is reported
- [[token-administration-copy]] — one unusually sensitive string
- [[token-administration-validations]] — what is checked before a token is minted
- [[token-administration-api]] — the three tool schemas
- [[token-administration-decisions]] — the ADRs that bind it
- [[token-administration-related]] — neighbours and shared concerns

## Rules

Indexed machine-readable form: `business-docs/rules/token-administration.json`.

### Disclosure — the heart of this feature

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `plaintext-returned-once` | `token_create` returns the plaintext token exactly once, at creation. It is never retrievable again, by anyone, including an admin. | once | `business-docs/wiki/shared/mvp-spec.md:240-241`, `business-docs/wiki/shared/mvp-spec.md:336` |
| `hash-only-storage` | Only the SHA-256 hash is stored, as `api_tokens.token_hash`. | SHA-256 | `business-docs/wiki/shared/mvp-spec.md:74`, `business-docs/wiki/shared/mvp-spec.md:336` |
| `list-never-returns-token` | `token_list` never returns the token itself. | never | `business-docs/wiki/shared/mvp-spec.md:244` |
| `list-prefix-limit` | `token_list` never returns a recoverable prefix beyond the **last 4 characters**. | 4 | `business-docs/wiki/shared/mvp-spec.md:244-245` |
| `tokens-never-logged` | Tokens are never logged, in plaintext or hashed — including in `audit_log`. | never | `business-docs/wiki/shared/mvp-spec.md:361` |
| `one-live-token-per-label` | `(user_id, lower(label))` is unique among tokens with `revoked_at IS NULL`, so "revoke Gemini, leave Claude working" is structural rather than a naming convention. A revoked label can be reissued. | unique among unrevoked | [ADR-0018](../../decisions/0018-token-identity-is-constrained-in-the-database.md) |
| `scopes-null-or-non-empty` | `scopes` is either `null`, meaning inherit the user's role in full, or a non-empty array. An empty array — a token that lists nothing — cannot be stored. | `CHECK (scopes IS NULL OR cardinality(scopes) > 0)` | [ADR-0018](../../decisions/0018-token-identity-is-constrained-in-the-database.md) |
| `token-last4-is-stored` | `token_last4` is stored beside the hash, because `token_list` must show it and the plaintext is unrecoverable by then. | 4 characters | [ADR-0018](../../decisions/0018-token-identity-is-constrained-in-the-database.md), [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) |
| `api-token-proves-identity-at-consent` | The consent screen identifies a person by a live `wc_` API token, because the system has no passwords. The token is verified and discarded; the connecting client never receives it. | paste a token | [ADR-0022](../../decisions/0022-oauth-alongside-bearer-tokens.md) |
| `revoking-a-token-leaves-grants-alive` | Revoking a `wc_` token does **not** revoke OAuth grants already authorized with it. Recorded as an open question, not a decision. | known gap | [ADR-0022](../../decisions/0022-oauth-alongside-bearer-tokens.md) |

### Issuance

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `admin-tokens-permission` | All three tools require `admin:tokens`, which only `admin` holds. | `admin:tokens` | `business-docs/wiki/shared/mvp-spec.md:142` |
| `token-create-inputs` | `token_create` takes `user_id`, `label`, optional `scopes`, optional `expires_at`. | 4 fields | `business-docs/wiki/shared/mvp-spec.md:238-239` |
| `token-format` | 32 bytes of `crypto.getRandomValues`, base64url, prefixed `wc_` so it is greppable in logs. | `wc_` + 32B | `business-docs/wiki/shared/mvp-spec.md:335` |
| `one-token-per-client` | One token per client, distinguished by `label` (`claude-desktop`, `gemini`, `phone`), so revoking Gemini leaves Claude working. | 1 per client | `business-docs/wiki/shared/mvp-spec.md:76`, `business-docs/wiki/shared/mvp-spec.md:337-338` |
| `scopes-nullable` | `scopes` is nullable. `null` means inherit the user's role in full. | `null` ⇒ all | `business-docs/wiki/shared/mvp-spec.md:74`, `business-docs/wiki/shared/mvp-spec.md:77-78` |
| `scopes-narrow-only` | An explicit `scopes` array is a **subset** of the user's permissions. A token can only ever narrow what its user's role allows, never widen it. | invariant | `business-docs/wiki/shared/mvp-spec.md:125-128`, `business-docs/wiki/shared/mvp-spec.md:239`, `business-docs/wiki/shared/mvp-spec.md:339` |
| `expiry-optional` | `expires_at` is optional. A token created without one never expires. | optional | `business-docs/wiki/shared/mvp-spec.md:75`, `business-docs/wiki/shared/mvp-spec.md:339` |
| `issuance-audited` | "token issued" is written to `audit_log`. | 1 entry | `business-docs/wiki/shared/mvp-spec.md:359` |

### Revocation

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `revoke-by-token-id` | `token_revoke` takes a token id — not a user, not a label. | token id | `business-docs/wiki/shared/mvp-spec.md:247` |
| `revoke-immediate` | Revocation takes effect immediately. | immediate | `business-docs/wiki/shared/mvp-spec.md:247` |
| `revocation-audited` | "token revoked" is written to `audit_log`. | 1 entry | `business-docs/wiki/shared/mvp-spec.md:359` |
| `delete-revokes-tokens` | `user_delete` revokes that user's tokens as part of the soft-delete. Owned by [[user-administration-index]]; recorded here because it writes `revoked_at`. | cascade | `business-docs/wiki/shared/mvp-spec.md:234-235` |
| `suspension-does-not-revoke` | Suspending a user does **not** set `revoked_at`. The auth flow rejects on `user.status` instead, so reinstating the user silently restores every token. | no revoke | `business-docs/wiki/shared/mvp-spec.md:158-159`, `business-docs/wiki/shared/mvp-spec.md:230`, `business-docs/wiki/shared/mvp-spec.md:345` |

## Not real yet

Everything. There is no `src/`, no `api_tokens` table, no Worker.

| Thing | Specified at | State |
| --- | --- | --- |
| `token_create` / `token_list` / `token_revoke` handlers | `business-docs/wiki/shared/mvp-spec.md:238-247`, `business-docs/wiki/shared/mvp-spec.md:378` | planned (`src/tools/admin/token_*.ts`) |
| `src/db/queries/tokens.ts` | `business-docs/wiki/shared/mvp-spec.md:376` | planned |
| `api_tokens` table | `business-docs/wiki/shared/mvp-spec.md:74-75` | planned; `schema.sql` does not exist |
| `audit_log` table | `business-docs/wiki/shared/mvp-spec.md:360` | planned; see [[audit-logging]] |

Do not cite any of those paths as evidence. They are a plan.

## Where the specification is silent

These are gaps, not rules. Each is repeated in [[divergences]].

| Gap | Why it matters |
| --- | --- |
| **What happens if `scopes` names a permission the user's role does not grant** — silently ignored, or the whole call rejected? | Unstated, and it has security consequences either way. Silent intersection makes a token quietly weaker than the admin believes; rejection makes `token_create` fail on a role change. `business-docs/wiki/shared/mvp-spec.md:239` says "subset of that user's permissions" without saying who enforces it or how. |
| No rotation policy, and `expires_at` is optional | Tokens are immortal by default (`business-docs/wiki/shared/mvp-spec.md:339`). |
| Whether `token_list` across **all** users needs anything beyond `admin:tokens` | `business-docs/wiki/shared/mvp-spec.md:243` offers "for a user or for everyone" with one permission for both. |
| Whether token creation or revocation is rate-limited | Nothing anywhere says. See [[security]]. |
| Whether revoking an already-revoked token errors or is idempotent | Unstated. |
| No maximum number of tokens per user | Unstated. |
| Whether `last_used_at` is trustworthy | It is not — best-effort via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`). See [[token-administration-states]]. |
| Whether issuance is audited beyond the single "token issued" entry | `business-docs/wiki/shared/mvp-spec.md:359` names the action and nothing about its `metadata`. |
