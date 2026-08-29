---
feature: token-administration
page: index
status: stub
source_of_truth: wiki
code_refs:
  - README.md:224
updated: 2026-08-29
---

# Token administration

Issuing, listing, and revoking the API tokens that let an MCP client act as a user. An admin mints one token per client — `claude-desktop`, `gemini`, `phone` — optionally narrower than the user's role and optionally with an expiry, hands the plaintext to the person once, and can kill any one of them without touching the others. It starts at `token_create` and ends when a row in `api_tokens` is written or stamped `revoked_at`; what happens to that token on a request is [[authentication-index]].

> **Unverified.** No code implements any of this. Every claim below is traced to `README.md`, the project specification, and to nothing else. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | `token_create`, `token_list`, `token_revoke` (`README.md:224-233`); `user_create` with `issue_token: true`, which mints the first key inline (`README.md:209-211`) |
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
| `plaintext-returned-once` | `token_create` returns the plaintext token exactly once, at creation. It is never retrievable again, by anyone, including an admin. | once | `README.md:226-227`, `README.md:322` |
| `hash-only-storage` | Only the SHA-256 hash is stored, as `api_tokens.token_hash`. | SHA-256 | `README.md:60`, `README.md:322` |
| `list-never-returns-token` | `token_list` never returns the token itself. | never | `README.md:230` |
| `list-prefix-limit` | `token_list` never returns a recoverable prefix beyond the **last 4 characters**. | 4 | `README.md:230-231` |
| `tokens-never-logged` | Tokens are never logged, in plaintext or hashed — including in `audit_log`. | never | `README.md:347` |

### Issuance

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `admin-tokens-permission` | All three tools require `admin:tokens`, which only `admin` holds. | `admin:tokens` | `README.md:128` |
| `token-create-inputs` | `token_create` takes `user_id`, `label`, optional `scopes`, optional `expires_at`. | 4 fields | `README.md:224-225` |
| `token-format` | 32 bytes of `crypto.getRandomValues`, base64url, prefixed `wc_` so it is greppable in logs. | `wc_` + 32B | `README.md:321` |
| `one-token-per-client` | One token per client, distinguished by `label` (`claude-desktop`, `gemini`, `phone`), so revoking Gemini leaves Claude working. | 1 per client | `README.md:62`, `README.md:323-324` |
| `scopes-nullable` | `scopes` is nullable. `null` means inherit the user's role in full. | `null` ⇒ all | `README.md:60`, `README.md:63-64` |
| `scopes-narrow-only` | An explicit `scopes` array is a **subset** of the user's permissions. A token can only ever narrow what its user's role allows, never widen it. | invariant | `README.md:111-114`, `README.md:225`, `README.md:325` |
| `expiry-optional` | `expires_at` is optional. A token created without one never expires. | optional | `README.md:61`, `README.md:325` |
| `issuance-audited` | "token issued" is written to `audit_log`. | 1 entry | `README.md:345` |

### Revocation

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `revoke-by-token-id` | `token_revoke` takes a token id — not a user, not a label. | token id | `README.md:233` |
| `revoke-immediate` | Revocation takes effect immediately. | immediate | `README.md:233` |
| `revocation-audited` | "token revoked" is written to `audit_log`. | 1 entry | `README.md:345` |
| `delete-revokes-tokens` | `user_delete` revokes that user's tokens as part of the soft-delete. Owned by [[user-administration-index]]; recorded here because it writes `revoked_at`. | cascade | `README.md:220-221` |
| `suspension-does-not-revoke` | Suspending a user does **not** set `revoked_at`. The auth flow rejects on `user.status` instead, so reinstating the user silently restores every token. | no revoke | `README.md:144-145`, `README.md:216`, `README.md:331` |

## Not real yet

Everything. There is no `src/`, no `api_tokens` table, no Worker.

| Thing | Specified at | State |
| --- | --- | --- |
| `token_create` / `token_list` / `token_revoke` handlers | `README.md:224-233`, `README.md:364` | planned (`src/tools/admin/token_*.ts`) |
| `src/db/queries/tokens.ts` | `README.md:362` | planned |
| `api_tokens` table | `README.md:60-61` | planned; `schema.sql` does not exist |
| `audit_log` table | `README.md:346` | planned; see [[audit-logging]] |

Do not cite any of those paths as evidence. They are a plan.

## Where the specification is silent

These are gaps, not rules. Each is repeated in [[divergences]].

| Gap | Why it matters |
| --- | --- |
| **What happens if `scopes` names a permission the user's role does not grant** — silently ignored, or the whole call rejected? | Unstated, and it has security consequences either way. Silent intersection makes a token quietly weaker than the admin believes; rejection makes `token_create` fail on a role change. `README.md:225` says "subset of that user's permissions" without saying who enforces it or how. |
| No rotation policy, and `expires_at` is optional | Tokens are immortal by default (`README.md:325`). |
| Whether `token_list` across **all** users needs anything beyond `admin:tokens` | `README.md:229` offers "for a user or for everyone" with one permission for both. |
| Whether token creation or revocation is rate-limited | Nothing anywhere says. See [[security]]. |
| Whether revoking an already-revoked token errors or is idempotent | Unstated. |
| No maximum number of tokens per user | Unstated. |
| Whether `last_used_at` is trustworthy | It is not — best-effort via `ctx.waitUntil` (`README.md:341`). See [[token-administration-states]]. |
| Whether issuance is audited beyond the single "token issued" entry | `README.md:345` names the action and nothing about its `metadata`. |
