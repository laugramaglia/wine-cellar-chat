---
feature: authentication
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:153
updated: 2026-08-29
---

# Authentication — copy

This feature produces **almost no user-visible text**. There is no UI (`business-docs/wiki/shared/mvp-spec.md:53`), and the one response it emits — a `401` — is deliberately wordless ([[authentication-errors]]). What text exists is either a protocol token or a one-time secret.

## Strings with business weight

| Key | Source text | Placeholders | Where it appears |
| --- | --- | --- | --- |
| `auth-scheme` | `Bearer` | — | the `Authorization` header the client sends (`business-docs/wiki/shared/mvp-spec.md:40`, `business-docs/wiki/shared/mvp-spec.md:399`) |
| `token-prefix` | `wc_` | — | the first three characters of every issued token (`business-docs/wiki/shared/mvp-spec.md:335`) |
| `bootstrap-token-print` | the plaintext admin token, printed once | the token | stdout of `scripts/bootstrap-admin.ts` (`business-docs/wiki/shared/mvp-spec.md:330`) |
| `token-issue-response` | the plaintext token, returned once | the token | the `token_create` / `user_create` response — owned by [[token-administration-index]] (`business-docs/wiki/shared/mvp-spec.md:225`, `business-docs/wiki/shared/mvp-spec.md:240`) |

## Copy that asserts a rule

| Claim | Enforced or copy | Detail |
| --- | --- | --- |
| `wc_` prefix — "so it is greppable in logs" (`business-docs/wiki/shared/mvp-spec.md:335`) | **enforced**, and load-bearing in an unusual direction | It exists so a leaked token can be *found* in logs. It is not permission to log one — tokens are never logged, plaintext or hashed (`business-docs/wiki/shared/mvp-spec.md:361`). The prefix is a leak-detection aid, not a logging convention. |
| "returned exactly once — it is never retrievable again" (`business-docs/wiki/shared/mvp-spec.md:240`) | **enforced** by storing only the SHA-256 hash ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)) | The sentence is a true description of the storage model, not a promise the code could quietly break. |
| "prints its token once" (`business-docs/wiki/shared/mvp-spec.md:330`) | **copy** | Nothing prevents a second run of the bootstrap script printing a second token. Idempotency is unstated — see [[authentication-flow]]. |
| "Suspending kills every one of that user's tokens at the next request" (`business-docs/wiki/shared/mvp-spec.md:231`) | **copy, and misleading** | Accurate about the *effect* while suspended; silent about the fact that no token is revoked, so reinstating restores them all. See [[authentication-states]] and [[divergences]]. |
| "takes effect immediately" — `token_revoke` (`business-docs/wiki/shared/mvp-spec.md:247`) | **copy** at session scope | True for new connections. Whether it reaches an established `McpAgent` session is unstated ([[authentication-states]]). |

## The message this feature does *not* emit

The explicit permission-denial message — `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` (`business-docs/wiki/shared/mvp-spec.md:153-154`) — is [[authorization-index]]'s copy, not this feature's, and it is only ever produced **after** authentication has succeeded. Authentication itself has no message. That contrast is the point; it is explained in [[authentication-errors]].

## Not localized

Nothing here is localized, and nothing needs to be: the strings are protocol tokens (`Bearer`, `wc_`) and a secret. The only prose the system emits — the permission-denied message — is deliberately English and deliberately fixed, because its reader is an LLM agent that must recognise it and stop, not a human choosing a locale.

## Unused keys

None. There is no string table.

## Not real yet

None of these strings exists in code. The `401` response body is unspecified — see [[authentication-errors]] — so whether it carries any text at all is an open question.
