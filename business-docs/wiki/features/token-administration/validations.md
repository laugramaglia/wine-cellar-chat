---
feature: token-administration
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:238
updated: 2026-08-29
---

# Token administration — validations

> **Unverified.** Specified only; no code exists. Tool inputs are described as zod schemas (`business-docs/wiki/shared/mvp-spec.md:377`), but no schema is written down. See [[divergences]].

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| caller | Holds `admin:tokens`, checked in the handler before any work | `TOOL_PERMISSIONS` + a re-check in every handler (`business-docs/wiki/shared/mvp-spec.md:142`, `business-docs/wiki/shared/mvp-spec.md:149-151`, `business-docs/wiki/shared/mvp-spec.md:352-353`) | `Permission denied: '<tool>' requires 'admin:tokens'; your role is '<role>'.` (`business-docs/wiki/shared/mvp-spec.md:153-154`) |
| `token_create.user_id` | Required; identifies the token's owner | unspecified | unspecified |
| `token_create.label` | Required; names the client — `claude-desktop`, `gemini`, `phone` (`business-docs/wiki/shared/mvp-spec.md:76`) | unspecified — a convention, not a stated enum | unspecified |
| `token_create.scopes` | Optional. A **subset of that user's permissions** (`business-docs/wiki/shared/mvp-spec.md:239`) | unspecified — see below | unspecified |
| `token_create.expires_at` | Optional. Absent means the token never expires (`business-docs/wiki/shared/mvp-spec.md:339`) | unspecified | unspecified |
| `token_revoke.<token id>` | Required; revocation is by token id, not by user or label (`business-docs/wiki/shared/mvp-spec.md:247`) | unspecified | unspecified |
| `token_list` filter | "for a user or for everyone" (`business-docs/wiki/shared/mvp-spec.md:243`) — so a `user_id` filter is optional | unspecified | unspecified |

## The disclosure rules — validated by construction, not by a check

These are not input validations. They are properties the implementation must not be able to violate, and each is a structural constraint rather than an `if`.

| Rule | How it holds | Source |
| --- | --- | --- |
| The plaintext is returned **exactly once**, at creation | There is no second path that could return it — nothing stores it | `business-docs/wiki/shared/mvp-spec.md:240-241`, `business-docs/wiki/shared/mvp-spec.md:336` |
| Only the **SHA-256 hash** is persisted | `api_tokens.token_hash` is the only token column | `business-docs/wiki/shared/mvp-spec.md:74`, `business-docs/wiki/shared/mvp-spec.md:336` |
| `token_list` never returns the token | Its response is label, scopes, created, last used, revoked | `business-docs/wiki/shared/mvp-spec.md:243-245` |
| `token_list` never returns a recoverable prefix beyond the **last 4 characters** | A cap on the response, not on the input | `business-docs/wiki/shared/mvp-spec.md:244-245` |
| Tokens are never logged, plaintext or hashed | Including `audit_log` metadata ([[audit-logging]]) | `business-docs/wiki/shared/mvp-spec.md:361` |

The last-4 rule is the one that can be broken by a well-meaning change — someone adds a "token preview" to `token_list` to make keys easier to identify and picks 8 characters. It is capped at 4, and the identifier for a key is its `label`, not its bytes. See [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md).

## The scopes gap — flagged

**`business-docs/wiki/shared/mvp-spec.md:239` says `scopes` is a "subset of that user's permissions". It does not say what happens when it is not.**

Two readings, both defensible, with different security properties:

| Reading | Behaviour | Consequence |
| --- | --- | --- |
| **Ignore** — accept the array, let the request-time intersection drop the excess | `token_create` succeeds; `role_permissions(role) ∩ scopes` silently discards the ungranted permissions (`business-docs/wiki/shared/mvp-spec.md:346`) | The token is weaker than the admin was told it would be, and nothing says so. Fails silently, in the safe direction |
| **Reject** — validate at creation against the target user's role | `token_create` errors | The admin learns immediately. But a later role *demotion* leaves an over-broad `scopes` array on an existing token, so the request-time intersection is still required |

The invariant that resolves the risk either way is stated plainly: **a token can only ever narrow what its user's role allows, never widen it** (`business-docs/wiki/shared/mvp-spec.md:128`), enforced at request time by the intersection at `business-docs/wiki/shared/mvp-spec.md:346`. So neither reading grants excess power. What is undecided is whether the admin is *told*.

Two further consequences of the intersection nobody has written down:

- **Promotion.** A `member` given a `catalog:read` token who is later promoted to `admin` still has a `catalog:read` token. Scopes are absolute, not relative — that is correct, and worth stating.
- **Demotion.** An `admin` with an unscoped (`null`) token who is demoted to `member` loses the admin permissions on their existing token at the next request, because `null` means "inherit the role", resolved fresh each time (`business-docs/wiki/shared/mvp-spec.md:77`, `business-docs/wiki/shared/mvp-spec.md:346`).

Recorded in [[divergences]]. See [[authorization-index]] for the permission model itself.

## Client vs server

| Rule | Client | Server |
| --- | --- | --- |
| `admin:tokens` required | Visibility only — the tool is hidden from `tools/list` (`business-docs/wiki/shared/mvp-spec.md:146-148`) | **The boundary.** Every handler re-checks (`business-docs/wiki/shared/mvp-spec.md:149-151`) |
| Input shapes | none — the agent constructs the call | zod schema per tool (`business-docs/wiki/shared/mvp-spec.md:377`) |
| Scope subsetting | none | request-time intersection (`business-docs/wiki/shared/mvp-spec.md:346`); creation-time check unspecified |

There is no client in the usual sense: the "client" is an LLM agent, which will happily construct any call it can see. **Hiding a tool is not a control** ([[security]], [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md)). Every rule in this feature is server-side or it does not exist.

## Not validated

| Input | State |
| --- | --- |
| `label` | Free text. No enum, no uniqueness — nothing stops two tokens labelled `gemini`, which quietly defeats the one-token-per-client convention that makes selective revocation work (`business-docs/wiki/shared/mvp-spec.md:337-338`) |
| `expires_at` | No stated bound, minimum, maximum, or past-date check |
| number of tokens per user | No maximum stated |
| issuance rate | No rate limit stated anywhere ([[security]]) |
| `token_revoke` target ownership | Nothing stated stops an admin revoking their own last key, or the last admin's |
