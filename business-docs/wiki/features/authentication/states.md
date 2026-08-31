---
feature: authentication
page: states
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:70
updated: 2026-08-29
---

# Authentication — states

Three state machines gate a request, and each is checked at a different step of [[authentication-flow]]: the token's lifecycle (step 2), the user's status (step 3), and the `props` resolved for the request (steps 4–5).

> **Unverified.** Field lists are read from the schema sketch at `business-docs/wiki/shared/mvp-spec.md:70-78`. No migration exists.

## Token state

There is no `status` column on `api_tokens`. **The token's state is derived from three nullable timestamps** (`business-docs/wiki/shared/mvp-spec.md:74-75`), which makes the resolution order below the actual rule.

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `id` | id | the handle `token_revoke` takes (`business-docs/wiki/shared/mvp-spec.md:247`) | — |
| `user_id` | fk → `users` | whose token this is | — |
| `token_hash` | text | SHA-256 of the plaintext. The plaintext is never stored (`business-docs/wiki/shared/mvp-spec.md:336`) | — |
| `label` | text | the client: `claude-desktop`, `gemini`, `phone` (`business-docs/wiki/shared/mvp-spec.md:76`) | — |
| `scopes` | `text[]`, nullable | `null` = inherit the user's role in full; otherwise a subset (`business-docs/wiki/shared/mvp-spec.md:77-78`) | `null` |
| `last_used_at` | timestamp, nullable | best-effort, via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`) | `null` |
| `expires_at` | timestamp, nullable | optional (`business-docs/wiki/shared/mvp-spec.md:339`). `null` = never expires | `null` |
| `revoked_at` | timestamp, nullable | set by `token_revoke`, effective immediately (`business-docs/wiki/shared/mvp-spec.md:247`) | `null` |

### Lifecycle

| From | Event | To | Guard |
| --- | --- | --- | --- |
| — | `token_create`, or `user_create` with `issue_token: true` | **active** | caller holds `admin:tokens` — [[token-administration-index]] |
| — | `scripts/bootstrap-admin.ts` | **active** | run by an operator against the database ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)) |
| active | `token_revoke` | **revoked** | terminal — nothing un-revokes a token |
| active | wall clock passes `expires_at` | **expired** | only when `expires_at` is non-null |
| active | any authenticated request | active | `last_used_at` updated, best-effort |
| active | `user_delete` (soft) | **revoked** | "tokens revoked" (`business-docs/wiki/shared/mvp-spec.md:235`) |

**Issued and active are the same state.** The plaintext exists exactly once, in the creation response (`business-docs/wiki/shared/mvp-spec.md:240`); after that moment the row is indistinguishable from any other active token.

Both terminal states are terminal on the row, not on the secret: a revoked token's plaintext still exists wherever the client stored it. It simply stops authenticating.

### Resolution order — step 2

Read in this order, and the order is the rule:

1. no row matches the hash → **unknown**
2. `revoked_at` is not null → **revoked**
3. `expires_at` is not null **and** has passed → **expired**
4. otherwise → **active**

All three failure states produce the same bare `401` (`business-docs/wiki/shared/mvp-spec.md:344`), so the order is not observable from outside. It matters for the audit story, and for anyone implementing the query.

`expires_at IS NULL` means the token never expires. **A token issued without `expires_at` is immortal** — see the gaps in [[authentication-flow]].

## User state

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `role` | `admin \| member \| guest` | determines the permission set (`business-docs/wiki/shared/mvp-spec.md:72`) | `member` on `user_create` (`business-docs/wiki/shared/mvp-spec.md:221-222`) |
| `status` | `active \| suspended` | gates authentication at step 3 (`business-docs/wiki/shared/mvp-spec.md:73`) | `active` |

| From | Event | To | Effect on authentication |
| --- | --- | --- | --- |
| `active` | `user_update` with `status: suspended` | `suspended` | every request by that user now fails step 3 with `401` (`business-docs/wiki/shared/mvp-spec.md:230`) |
| `suspended` | `user_update` with `status: active` | `active` | **every token the user ever had starts working again** — see below |
| `active` | `user_update` with a new `role` | `active` | the permission set changes on the next request; existing tokens keep working |

Guards on these transitions — an admin cannot demote or suspend themselves, and the last active admin cannot be demoted, suspended, or deleted (`business-docs/wiki/shared/mvp-spec.md:230-232`) — belong to [[user-administration-index]].

### Suspension is not revocation

`business-docs/wiki/shared/mvp-spec.md:231` says suspending "kills every one of that user's tokens at the next request". The **mechanism** is step 3: the user lookup fails. No `revoked_at` is written to any token row.

| | Suspend | Revoke |
| --- | --- | --- |
| Touches `api_tokens` | no | yes, `revoked_at` |
| Reversible | yes, by reinstating | no |
| Effect of reversing | **every token the user ever had authenticates again** | n/a |

Nothing in the specification says whether that restoration is intended. It is recorded in [[divergences]] and in [[security]]. It matters most in the case suspension is usually reached for — a compromised or departed account — where "suspend, then reinstate" is not obviously meant to hand the old credentials back.

Note also `business-docs/wiki/shared/mvp-spec.md:235`: `user_delete` soft-delete sets `status = deleted`, a third value absent from the enum at `business-docs/wiki/shared/mvp-spec.md:73` and `business-docs/wiki/shared/mvp-spec.md:229`. Step 3 checks `status != active`, so a `deleted` user is rejected either way — but the enum is contradictory. Owned by [[user-administration-index]].

## `props` — the per-request state

Established at step 5 and carried for the life of the request (`business-docs/wiki/shared/mvp-spec.md:347`).

| Field | Type | Meaning | Derived from |
| --- | --- | --- | --- |
| `userId` | id | the calling user. **The only source of "who am I"** for every non-admin tool (`business-docs/wiki/shared/mvp-spec.md:350`) | `token.user_id` |
| `role` | `admin \| member \| guest` | the caller's role, quoted in the permission-denied message (`business-docs/wiki/shared/mvp-spec.md:153-154`) | `users.role` |
| `tokenId` | id | which client is calling | `api_tokens.id` |
| `permissions` | permission set | `role_permissions(role) ∩ (token.scopes ?? everything)` (`business-docs/wiki/shared/mvp-spec.md:346`) | both rows |

The plaintext token and its hash are **not** in `props`. Nothing downstream needs either, and nothing may log them (`business-docs/wiki/shared/mvp-spec.md:361`).

### Lifetime

`McpAgent` is a Durable Object (`business-docs/wiki/shared/mvp-spec.md:389`), so `props` lives with the agent instance rather than with a single call. `tools/list` filters on it and every handler re-checks against it (`business-docs/wiki/shared/mvp-spec.md:348`).

That gives `props` a lifetime longer than one HTTP request, and the specification does not say how long, nor whether it is re-resolved. Two consequences are unstated and should be decided before implementing:

- a revocation mid-session (`business-docs/wiki/shared/mvp-spec.md:247`, "takes effect immediately") may not reach an established connection;
- a role change mid-session may not reach it either, in either direction — a promotion the user cannot use, or a demotion that does not bite.

Anything reading `tokenId` outside the auth layer also constrains a later OAuth migration ([ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md)).
