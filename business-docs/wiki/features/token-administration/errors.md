---
feature: token-administration
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:153
updated: 2026-08-29
---

# Token administration — errors

Shared catalogue: [[error-codes]].

> **Unverified.** Specified only; no code exists. Most rows below are *unspecified* — that is the finding. See [[divergences]].

## Failures the specification states

| Condition | Code / exception | What the user sees | Recovery |
| --- | --- | --- | --- |
| Caller's own token is unknown, revoked, or expired | `401` at the Worker edge (`business-docs/wiki/shared/mvp-spec.md:157-158`) | Connection refused, no tool list, nothing | Obtain a working token |
| Caller's user is `status = suspended` | `401`, identical to the above (`business-docs/wiki/shared/mvp-spec.md:158-159`) | Same opaque failure | An admin reinstates the account |
| A non-admin calls a token tool | MCP error: `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` — the same shape for `admin:tokens` (`business-docs/wiki/shared/mvp-spec.md:153-155`) | An explicit message the agent reports instead of retrying | Ask an admin |
| A non-admin *looks for* a token tool | It is absent from `tools/list` (`business-docs/wiki/shared/mvp-spec.md:146-148`) | The model never sees `token_create` | — |

The rejection message is deliberately explicit "so the agent reports it instead of retrying in a loop" (`business-docs/wiki/shared/mvp-spec.md:155`). That is a product rule about agent behaviour, not just phrasing.

## Failures the specification does not state

Each of these is a real path with no defined behaviour. They belong in [[divergences]] until someone decides.

| Condition | Unspecified |
| --- | --- |
| `token_create` with a `user_id` that does not exist | Error shape and code |
| `token_create` with `scopes` naming a permission the target user's role does not grant | **Ignored (silently intersected) or rejected?** The highest-consequence gap in this feature — see [[token-administration-validations]] |
| `token_create` with `scopes` naming a string that is not a permission at all | Whether the tool schema is a closed enum |
| `token_create` with `expires_at` already in the past | Whether it is rejected or creates a born-dead token |
| `token_revoke` on an unknown token id | Error shape |
| `token_revoke` on an already-revoked token | **Idempotent or an error?** Also: does it write a second `audit_log` entry? |
| `token_revoke` on the caller's *own* token | Nothing forbids an admin locking themselves out. `user_update` has explicit self-harm guards (`business-docs/wiki/shared/mvp-spec.md:231-232`); `token_revoke` has none stated |
| Revoking the last active admin's last token | Same gap: the last-admin guards protect the *account* (`business-docs/wiki/shared/mvp-spec.md:231-232`), not its keys |
| Too many tokens for one user | No maximum is stated |
| Repeated `token_create` calls | No rate limit is stated anywhere ([[security]]) |

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `last_used_at` write | A deferred `ctx.waitUntil` update that fails or never runs (`business-docs/wiki/shared/mvp-spec.md:355`) | A stale or null "last used" in `token_list`, indistinguishable from a genuinely unused token. See [[token-administration-states]] |
| Suspension | Tokens are not revoked; the *user lookup* fails instead (`business-docs/wiki/shared/mvp-spec.md:230`, `business-docs/wiki/shared/mvp-spec.md:345`) | `token_list` still shows the tokens as un-revoked while every one of them returns `401` |
| Every edge rejection | Five distinct causes collapse into one bare `401` (`business-docs/wiki/shared/mvp-spec.md:157-159`) | Deliberate — the caller cannot distinguish "wrong token" from "suspended account", which is the point. Owned by [[authentication-index]] |

The first two are accidental and belong in [[divergences]]. The third is a decision.

## Retries

Nothing here is retried, and nothing should be. `token_create` is not idempotent — a retried call mints a *second* token, and the first one is unrecoverable and stays valid forever unless someone notices the extra row in `token_list`. No idempotency key is specified.
