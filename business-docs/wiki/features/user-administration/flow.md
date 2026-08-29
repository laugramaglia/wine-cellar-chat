---
feature: user-administration
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - README.md:205
updated: 2026-08-29
---

# User administration — flow

The canonical flow, named in the specification's own definition of done: *"An admin can run `user_create` for 'fabian' with `issue_token: true` and get a working key back"* (`README.md:409`).

## Happy path — onboard a new user

1. An admin's MCP client is connected with an admin bearer token. `tools/list` shows the four `admin:users` tools; a member's client does not see them at all (`README.md:132-134`, `README.md:410`).
2. The admin calls **`user_create`** with `name`, `email`, optionally `role`, and `issue_token: true` plus a `token_label` (`README.md:207-210`).
3. The handler re-checks `admin:users` before doing any work — visibility was an affordance, this is the boundary (`README.md:135-137`, [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md)).
4. The account row is written: `role` defaults to `member` (`README.md:208`), `status` is `active`.
5. Because `issue_token: true`, a token is minted in the same call. Only its SHA-256 hash is stored ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)).
6. The response carries the user row **and the plaintext token, once** (`README.md:211`). It is never retrievable again.
7. `user created` is written to `audit_log` with the acting admin as `actor_user_id` (`README.md:345-347`, [[audit-logging]]).
8. The admin hands the token to the new user, who configures their own MCP client with it (`README.md:388-393`).

## Preconditions

| | |
| --- | --- |
| An active admin exists | Created by `scripts/bootstrap-admin.ts` on an empty database ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md), `README.md:313-317`). |
| The caller's token is live | Not unknown, revoked, or expired, and its user's `status = active` (`README.md:329-331`). |
| The caller holds `admin:users` | Role is `admin`, and the token's `scopes`, if set, include it (`README.md:112-114`). |

## Postconditions

| | |
| --- | --- |
| Persisted | one `users` row; one `api_tokens` row (hash only) if `issue_token`; one `audit_log` row. |
| Returned once | the plaintext token. |
| Discarded | the plaintext token, server-side, immediately. Never logged, plaintext or hashed (`README.md:347`). |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Create without a token | `issue_token` absent or false | Account exists but cannot connect. A key must follow via `token_create` ([[token-administration-index]], `README.md:224`). |
| List accounts | `user_list` | Role, status, token count, last activity for every account (`README.md:213`). |
| Change role or status | `user_update` | Subject to both guards — see [[user-administration-states]]. |
| Suspend | `user_update` with `status: suspended` | Every one of that user's tokens fails at the next request (`README.md:216`, `README.md:413`). |
| Soft delete | `user_delete` | `status = deleted`, tokens revoked (`README.md:220-221`). |
| Hard delete | `user_delete` with `hard: true` | Also drops the user's cellar items and reviews. Their contributed wines stay (`README.md:221-222`). |
| Guard trips | self-demotion, self-suspension, or the last active admin | Rejected; no state changes. See [[user-administration-errors]]. |

## Timing and automatic behaviour

| Behaviour | Timing | Source |
| --- | --- | --- |
| Suspension takes effect | at the suspended user's **next request**, when step 3 of the auth flow loads the user and finds `status != active` | `README.md:216`, `README.md:331` |
| Token revocation on delete | at delete time, on the token rows | `README.md:221` |
| `last_used_at` update | best-effort, via `ctx.waitUntil`, off the response path | `README.md:341` |

**Suspension does not touch the token rows.** It is enforced entirely by the user-status check in the auth flow. In-flight requests already past step 3 are unaffected, and reinstating the user restores every token they had, silently. Nothing says that is intended — see [[user-administration-states]] and [[security]].

## What is deliberately not here

| Absent | Why |
| --- | --- |
| Self-service signup | Accounts exist only because an admin made them (`README.md:317`). |
| Creating the first admin through a tool | There is nobody to authorize it ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)). |
| Any user-facing screen | Headless MCP server; the client is the UI (`README.md:39`). See [[user-administration-screens]]. |
| Password or OAuth login | Static bearer tokens for the MVP ([ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md), `README.md:35`). |
| A user editing their own account | No non-admin tool takes a `user_id` at all (`README.md:154-156`, [[security]]). |
