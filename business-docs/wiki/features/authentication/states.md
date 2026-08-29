---
feature: authentication
page: states
status: stub
source_of_truth: wiki
code_refs:
  - README.md:56
updated: 2026-08-29
---

# Authentication — states

Three state machines gate a request, and each is checked at a different step of [[authentication-flow]]: the token's lifecycle (step 2), the user's status (step 3), and the `props` resolved for the request (steps 4–5).

> **Unverified.** Field lists are read from the schema sketch at `README.md:56-64`. No migration exists.

## Token state

There is no `status` column on `api_tokens`. **The token's state is derived from three nullable timestamps** (`README.md:60-61`), which makes the resolution order below the actual rule.

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `id` | id | the handle `token_revoke` takes (`README.md:233`) | — |
| `user_id` | fk → `users` | whose token this is | — |
| `token_hash` | text | SHA-256 of the plaintext. The plaintext is never stored (`README.md:322`) | — |
| `label` | text | the client: `claude-desktop`, `gemini`, `phone` (`README.md:62`) | — |
| `scopes` | `text[]`, nullable | `null` = inherit the user's role in full; otherwise a subset (`README.md:63-64`) | `null` |
| `last_used_at` | timestamp, nullable | best-effort, via `ctx.waitUntil` (`README.md:341`) | `null` |
| `expires_at` | timestamp, nullable | optional (`README.md:325`). `null` = never expires | `null` |
| `revoked_at` | timestamp, nullable | set by `token_revoke`, effective immediately (`README.md:233`) | `null` |

### Lifecycle

| From | Event | To | Guard |
| --- | --- | --- | --- |
| — | `token_create`, or `user_create` with `issue_token: true` | **active** | caller holds `admin:tokens` — [[token-administration-index]] |
| — | `scripts/bootstrap-admin.ts` | **active** | run by an operator against the database ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)) |
| active | `token_revoke` | **revoked** | terminal — nothing un-revokes a token |
| active | wall clock passes `expires_at` | **expired** | only when `expires_at` is non-null |
| active | any authenticated request | active | `last_used_at` updated, best-effort |
| active | `user_delete` (soft) | **revoked** | "tokens revoked" (`README.md:221`) |

**Issued and active are the same state.** The plaintext exists exactly once, in the creation response (`README.md:226`); after that moment the row is indistinguishable from any other active token.

Both terminal states are terminal on the row, not on the secret: a revoked token's plaintext still exists wherever the client stored it. It simply stops authenticating.

### Resolution order — step 2

Read in this order, and the order is the rule:

1. no row matches the hash → **unknown**
2. `revoked_at` is not null → **revoked**
3. `expires_at` is not null **and** has passed → **expired**
4. otherwise → **active**

All three failure states produce the same bare `401` (`README.md:330`), so the order is not observable from outside. It matters for the audit story, and for anyone implementing the query.

`expires_at IS NULL` means the token never expires. **A token issued without `expires_at` is immortal** — see the gaps in [[authentication-flow]].

## User state

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `role` | `admin \| member \| guest` | determines the permission set (`README.md:58`) | `member` on `user_create` (`README.md:207-208`) |
| `status` | `active \| suspended` | gates authentication at step 3 (`README.md:59`) | `active` |

| From | Event | To | Effect on authentication |
| --- | --- | --- | --- |
| `active` | `user_update` with `status: suspended` | `suspended` | every request by that user now fails step 3 with `401` (`README.md:216`) |
| `suspended` | `user_update` with `status: active` | `active` | **every token the user ever had starts working again** — see below |
| `active` | `user_update` with a new `role` | `active` | the permission set changes on the next request; existing tokens keep working |

Guards on these transitions — an admin cannot demote or suspend themselves, and the last active admin cannot be demoted, suspended, or deleted (`README.md:216-218`) — belong to [[user-administration-index]].

### Suspension is not revocation

`README.md:217` says suspending "kills every one of that user's tokens at the next request". The **mechanism** is step 3: the user lookup fails. No `revoked_at` is written to any token row.

| | Suspend | Revoke |
| --- | --- | --- |
| Touches `api_tokens` | no | yes, `revoked_at` |
| Reversible | yes, by reinstating | no |
| Effect of reversing | **every token the user ever had authenticates again** | n/a |

Nothing in the specification says whether that restoration is intended. It is recorded in [[divergences]] and in [[security]]. It matters most in the case suspension is usually reached for — a compromised or departed account — where "suspend, then reinstate" is not obviously meant to hand the old credentials back.

Note also `README.md:221`: `user_delete` soft-delete sets `status = deleted`, a third value absent from the enum at `README.md:59` and `README.md:215`. Step 3 checks `status != active`, so a `deleted` user is rejected either way — but the enum is contradictory. Owned by [[user-administration-index]].

## `props` — the per-request state

Established at step 5 and carried for the life of the request (`README.md:333`).

| Field | Type | Meaning | Derived from |
| --- | --- | --- | --- |
| `userId` | id | the calling user. **The only source of "who am I"** for every non-admin tool (`README.md:336`) | `token.user_id` |
| `role` | `admin \| member \| guest` | the caller's role, quoted in the permission-denied message (`README.md:139-140`) | `users.role` |
| `tokenId` | id | which client is calling | `api_tokens.id` |
| `permissions` | permission set | `role_permissions(role) ∩ (token.scopes ?? everything)` (`README.md:332`) | both rows |

The plaintext token and its hash are **not** in `props`. Nothing downstream needs either, and nothing may log them (`README.md:347`).

### Lifetime

`McpAgent` is a Durable Object (`README.md:375`), so `props` lives with the agent instance rather than with a single call. `tools/list` filters on it and every handler re-checks against it (`README.md:334`).

That gives `props` a lifetime longer than one HTTP request, and the specification does not say how long, nor whether it is re-resolved. Two consequences are unstated and should be decided before implementing:

- a revocation mid-session (`README.md:233`, "takes effect immediately") may not reach an established connection;
- a role change mid-session may not reach it either, in either direction — a promotion the user cannot use, or a demotion that does not bite.

Anything reading `tokenId` outside the auth layer also constrains a later OAuth migration ([ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md)).
