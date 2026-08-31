---
feature: token-administration
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:238
updated: 2026-08-29
---

# Token administration — flow

> **Unverified.** Specified only; no code exists. See [[divergences]].

## Happy path — issuing a key

1. An admin asks their agent for a key: *"create a Gemini key for Fabian."* The agent calls `token_create` with `user_id`, `label: "gemini"` (`business-docs/wiki/shared/mvp-spec.md:238`).
2. The server generates 32 bytes from `crypto.getRandomValues`, base64url-encodes them, and prefixes `wc_` (`business-docs/wiki/shared/mvp-spec.md:335`).
3. It stores the **SHA-256 hash** in `api_tokens.token_hash`, with `label`, `scopes` (null unless given), `expires_at` (null unless given), and no `revoked_at` (`business-docs/wiki/shared/mvp-spec.md:74-75`, `business-docs/wiki/shared/mvp-spec.md:336`).
4. It writes a "token issued" entry to `audit_log` — actor, target user, and metadata that must not include the token (`business-docs/wiki/shared/mvp-spec.md:359-361`, [[audit-logging]]).
5. It returns the plaintext token **once**. That response is the only moment the secret exists in transit; nothing can recover it afterwards (`business-docs/wiki/shared/mvp-spec.md:240-241`).
6. The human pastes it into that one client's configuration (`business-docs/wiki/shared/mvp-spec.md:397-409`, [[token-administration-screens]]).

## Happy path — revoking one client

1. The admin's agent calls `token_list` for the user and reads back label, scopes, created, last used, revoked — and no token material (`business-docs/wiki/shared/mvp-spec.md:243-245`).
2. The admin picks the row by `label` and the agent calls `token_revoke` with its token id (`business-docs/wiki/shared/mvp-spec.md:247`).
3. `revoked_at` is stamped. The next request bearing that token fails the revocation check and gets `401` at the Worker edge (`business-docs/wiki/shared/mvp-spec.md:344`, [[authentication-index]]).
4. "token revoked" is written to `audit_log` (`business-docs/wiki/shared/mvp-spec.md:359`).
5. **Every other token for that user keeps working.** That is the entire point of `label` (`business-docs/wiki/shared/mvp-spec.md:337-338`).

## Preconditions

| Precondition | Source |
| --- | --- |
| The caller holds `admin:tokens` — i.e. is an `admin`. | `business-docs/wiki/shared/mvp-spec.md:142` |
| The caller's own token passed edge auth first: known, not revoked, not expired, user `active`. | `business-docs/wiki/shared/mvp-spec.md:157-159` |
| For `token_create`, the target `user_id` exists. | implied by `business-docs/wiki/shared/mvp-spec.md:238`; not stated |

## Postconditions

| After | State |
| --- | --- |
| `token_create` | One new `api_tokens` row; one `audit_log` entry; the plaintext exists only in the response and in whatever the client did with it. |
| `token_revoke` | `revoked_at` set on one row; one `audit_log` entry; that token is dead everywhere, immediately. |
| `token_list` | Nothing persisted. `last_used_at` is only ever written by the request path, best-effort (`business-docs/wiki/shared/mvp-spec.md:355`). |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Scoped token | `token_create` given `scopes` | Effective permissions become `role_permissions(user.role) ∩ scopes` at every request (`business-docs/wiki/shared/mvp-spec.md:346`). Narrower than the user; never wider (`business-docs/wiki/shared/mvp-spec.md:128`). |
| Unscoped token | `scopes` omitted or null | Inherits the user's role in full (`business-docs/wiki/shared/mvp-spec.md:77`). |
| Expiring token | `expires_at` given | Dies on its own at that instant; no revocation call and no `audit_log` entry (`business-docs/wiki/shared/mvp-spec.md:339`, `business-docs/wiki/shared/mvp-spec.md:344`). |
| Immortal token | `expires_at` omitted | Lives until explicitly revoked. This is the default. |
| Inline first key | `user_create` with `issue_token: true` and a `token_label` | Account and first key in one call, plaintext returned once (`business-docs/wiki/shared/mvp-spec.md:223-225`). Owned by [[user-administration-index]]; the disclosure rules here still apply. |
| Owner suspended | `user_update` sets `status: suspended` | Tokens are **not** revoked. They fail at step 3 of the request flow instead (`business-docs/wiki/shared/mvp-spec.md:230`, `business-docs/wiki/shared/mvp-spec.md:345`). See [[token-administration-states]]. |
| Owner deleted | `user_delete` | Tokens **are** revoked as part of the soft-delete (`business-docs/wiki/shared/mvp-spec.md:234-235`). |

## Timing and automatic behaviour

| What | When | Source |
| --- | --- | --- |
| `last_used_at` update | On every authenticated request, best-effort, deferred via `ctx.waitUntil`. Off the critical path, and not guaranteed to land. | `business-docs/wiki/shared/mvp-spec.md:355` |
| Expiry | Evaluated at request time against `expires_at`; nothing sweeps the table. | `business-docs/wiki/shared/mvp-spec.md:344` |
| Revocation | Immediate — the next request fails. There is no cache to invalidate because none is described. | `business-docs/wiki/shared/mvp-spec.md:247` |

## What is deliberately not here

| Not here | Why |
| --- | --- |
| Retrieving an existing token | Impossible by design: only the hash is stored ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)). Lost keys are revoked and reissued, never recovered. |
| A user issuing their own token | `admin:tokens` is admin-only (`business-docs/wiki/shared/mvp-spec.md:142`). A member cannot mint themselves a key, nor a narrower one for a second client. |
| OAuth consent, refresh, client registration | Out of scope for the MVP; OAuth 2.1 is the upgrade path ([ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md), `business-docs/wiki/shared/mvp-spec.md:49`, `business-docs/wiki/shared/mvp-spec.md:434-435`). |
| Rotation | No policy is stated anywhere. Recorded in [[divergences]]. |
| Rate limiting on issuance or revocation | Not specified. See [[security]]. |
