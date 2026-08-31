---
feature: authentication
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:341
updated: 2026-08-29
---

# Authentication — flow

The per-request flow, verbatim in structure from `business-docs/wiki/shared/mvp-spec.md:343-355`. It runs at the Worker edge, on **every** request, before `WineMcp.serve("/mcp")` sees anything (`business-docs/wiki/shared/mvp-spec.md:369`).

> **Unverified.** Specified only. No middleware exists.

## Happy path

Five steps. Each one either rejects with a bare `401` or hands its result to the next. There is no partial success and no step that merely warns.

| # | Step | Rejection condition | Result |
| --- | --- | --- | --- |
| 1 | Read `Authorization: Bearer <token>` from the request headers. | header missing, **or** malformed → `401` (`business-docs/wiki/shared/mvp-spec.md:343`) | the plaintext token |
| 2 | Hash it (SHA-256) and look the hash up in `api_tokens`. | no matching row (**unknown**), `revoked_at` set (**revoked**), or `expires_at` passed (**expired**) → `401` (`business-docs/wiki/shared/mvp-spec.md:344`) | the token row: `id`, `user_id`, `scopes` |
| 3 | Load the user named by `token.user_id`. | `user.status != active` → `401` (`business-docs/wiki/shared/mvp-spec.md:345`) | the user row: `id`, `role`, `status` |
| 4 | Resolve `permissions = role_permissions(user.role) ∩ (token.scopes ?? everything)` (`business-docs/wiki/shared/mvp-spec.md:346`). | none — this step cannot reject | a permission set, possibly empty |
| 5 | Pass `{ userId, role, tokenId, permissions }` as `props` on the `McpAgent` (`business-docs/wiki/shared/mvp-spec.md:347`). | none | the request proceeds with an established identity |

Only the plaintext token is ever hashed for comparison; the plaintext is not stored, logged, or retained past step 2 ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)).

### Step 4 in detail

`role_permissions(user.role)` is the row for that role in the permission table (`business-docs/wiki/shared/mvp-spec.md:130-142`) — owned by [[authorization-index]], not by this feature.

`token.scopes` is nullable (`business-docs/wiki/shared/mvp-spec.md:74`). The `??` is a business rule, not a defensive default:

| `token.scopes` | Effective permissions | Source |
| --- | --- | --- |
| `null` | everything the role grants — inherit in full | `business-docs/wiki/shared/mvp-spec.md:77`, `business-docs/wiki/shared/mvp-spec.md:346` |
| a `text[]` subset | intersection with the role's grants | `business-docs/wiki/shared/mvp-spec.md:78`, `business-docs/wiki/shared/mvp-spec.md:127` |

The intersection is what makes the invariant hold: **a token can only ever narrow what its user's role allows, never widen it** (`business-docs/wiki/shared/mvp-spec.md:128`). A scope naming a permission the role does not have contributes nothing; it is dropped by the intersection rather than rejected. The specification does not say whether `token_create` refuses such a scope at issue time — that question belongs to [[token-administration-index]].

An empty resolved set is legal. Such a token authenticates successfully and then fails every tool's permission check, and sees an empty `tools/list`.

### Step 5 in detail

`props` is the sole channel by which a handler learns who is calling. Handlers read the user **from `props`, never from tool input** (`business-docs/wiki/shared/mvp-spec.md:350-351`) — the structural rule, stated in full in [[security]]. `tools/list` filters on `props.permissions`; every handler re-checks against it (`business-docs/wiki/shared/mvp-spec.md:348`).

`McpAgent` is a Durable Object (`business-docs/wiki/shared/mvp-spec.md:389`), so `props` is per-connection state rather than a per-call argument. The specification does not say what happens to a long-lived connection whose token is revoked after `props` was established — see **Gaps** below.

## Preconditions

- The `users` and `api_tokens` tables exist and are reachable over the Neon HTTP client (`business-docs/wiki/shared/mvp-spec.md:42`).
- A token has been issued — by `token_create` ([[token-administration-index]]) or by the bootstrap script.

## Postconditions

| | |
| --- | --- |
| Established | `props = { userId, role, tokenId, permissions }` for the life of the request |
| Persisted | `api_tokens.last_used_at`, best-effort only (see below) |
| Discarded | the plaintext token. It is not retained, not logged plaintext or hashed (`business-docs/wiki/shared/mvp-spec.md:361`), and not placed in `props` |
| Not written | no audit-log entry. Authentication is not an audited action; only admin actions are (`business-docs/wiki/shared/mvp-spec.md:359`). See [[audit-logging]] |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Reject at the edge | any of the five conditions above | bare `401`. Connection refused, no tool list, nothing (`business-docs/wiki/shared/mvp-spec.md:159`) |
| Authenticate, then deny per tool | identity established, permission absent | MCP error naming the missing permission — [[authorization-index]] |
| Authenticate with an empty permission set | `scopes` intersects the role to nothing | `tools/list` is empty; every call denied |

## Timing and automatic behaviour

**`last_used_at` is updated on the way through, best-effort, via `ctx.waitUntil`** (`business-docs/wiki/shared/mvp-spec.md:355`).

Three consequences, all of them business-relevant:

1. It is written **after** the response is on its way, so it never delays a request and never fails one.
2. `waitUntil` gives no delivery guarantee. A write that loses the race with worker eviction is lost silently, and nothing notices.
3. Therefore **`last_used_at` is not a reliable audit signal.** `user_list` reports "last activity" (`business-docs/wiki/shared/mvp-spec.md:227`) and `token_list` reports "last used" (`business-docs/wiki/shared/mvp-spec.md:244`) from this field. Both are approximations. An unused-looking token is not evidence a token was unused.

No other automatic behaviour: no refresh, no sliding expiry, no re-issue, no retry, no rate limiting.

## What is deliberately not here

| Absent | Why |
| --- | --- |
| OAuth 2.1, consent, refresh tokens | out of scope for the MVP; the upgrade path, not a non-goal — [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) |
| Any unauthenticated route | the first admin is seeded outside the request path — [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md) |
| Distinguishable rejection reasons | telling a caller *which* check failed tells an attacker whether a token exists — [[authentication-errors]] |
| Token recovery | plaintext exists exactly once, at creation — [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) |

## The bootstrap flow

A separate, second flow, and the only one that does not begin with a token.

1. An operator with database credentials runs `scripts/bootstrap-admin.ts` (planned, `business-docs/wiki/shared/mvp-spec.md:330`).
2. It seeds one admin user and prints its token **once** (`business-docs/wiki/shared/mvp-spec.md:330`).
3. Every account after that — Fabian included — is created through `user_create` by an admin (`business-docs/wiki/shared/mvp-spec.md:331`).

It is not reachable from the Worker. No unauthenticated code path exists in the deployed server at all ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)).

## Gaps in the specified flow

Real omissions, not stylistic ones. Each is unspecified, not decided.

| Gap | Why it matters |
| --- | --- |
| **Suspension does not revoke tokens.** `business-docs/wiki/shared/mvp-spec.md:231` says suspending "kills every one of that user's tokens at the next request", but the mechanism is step 3 — the *user* check fails, while the token rows stay untouched. Reinstating a suspended user therefore silently restores every token they ever had. | Nothing says whether that is intended. Recorded in [[divergences]] and in [[security]]. |
| **No rate limiting** is described anywhere in the specification. | An unauthenticated caller can hash-guess or replay against `POST /mcp` at whatever rate Cloudflare permits. |
| **No stated behaviour for a SHA-256 collision**, nor for two rows sharing a `token_hash`. | Academic at 32 bytes of entropy, but the lookup's uniqueness constraint is unstated; `api_tokens` has no declared `UNIQUE (token_hash)` (`business-docs/wiki/shared/mvp-spec.md:74-75`), unlike `wines` which does declare one (`business-docs/wiki/shared/mvp-spec.md:88`). |
| **Token lookup timing is unspecified.** A naive comparison could be timing-observable. | With 32 random bytes this is very likely academic — an attacker cannot walk a search space that size regardless. Stated for completeness, not as an alarm. |
| **Revocation during a live connection.** `token_revoke` "takes effect immediately" (`business-docs/wiki/shared/mvp-spec.md:247`), but `props` is resolved once per connection on a Durable Object. Whether an established MCP session is torn down is not stated. | The definition of done tests a wrong or revoked token at connect time (`business-docs/wiki/shared/mvp-spec.md:417`), not mid-session. |
| **Bootstrap idempotency.** Whether re-running the script is safe, or whether it refuses when an admin already exists, is unstated (`business-docs/wiki/shared/mvp-spec.md:327-332`). | Two admins, or a second printed token, from an accidental second run. |
| **No token rotation policy.** `expires_at` is optional (`business-docs/wiki/shared/mvp-spec.md:339`), so the default token is immortal. | A leaked token stays valid until someone remembers to revoke it. |
