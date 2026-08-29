---
feature: token-administration
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Token administration — decisions

ADRs that constrain this feature. The ADR itself is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) | Only the SHA-256 hash is stored; the plaintext is returned exactly once and is never retrievable again. | **Central.** It is why `token_create` has a one-shot response, why `token_list` shows at most 4 characters, why a lost key is reissued rather than recovered, and why nothing here logs a token (`README.md:226-227`, `README.md:230-231`, `README.md:322`, `README.md:347`). |
| [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) | Static bearer tokens per client, hand-rolled; OAuth 2.1 is the upgrade path. | This feature exists *because* of it. Under OAuth there would be no `token_create` — issuance would be an authorization server's job. All three tools are provisional and expected to be replaced (`README.md:35`, `README.md:420-421`). |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | Visibility filtering plus a handler re-check; only the handler check is the boundary. | The token tools are the highest-value target on the surface. A member never sees them in `tools/list`, and that is not what stops them — the `admin:tokens` re-check inside each handler is (`README.md:130-137`, `README.md:338-339`). |
| [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md) | The tool→permission map is one exhaustive `TOOL_PERMISSIONS` record; a missing entry fails to compile. | A fourth token tool added without a permission entry cannot ship silently unguarded (`README.md:147-148`, `README.md:414`). |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | No OpenAPI document; the MCP tool schemas are the contract. | The three tool schemas are documented in [[token-administration-api]] and nowhere else. |
| [ADR-0001](../../decisions/0001-the-wiki-is-the-source-of-truth.md) | The wiki is the source of truth; derived formats never carry prose. | Why the scope and disclosure rules live here rather than in a comment. |

`scopes` is where this feature meets the permission model. The rule *a token can only ever narrow what its user's role allows, never widen it* (`README.md:114`) is enforced by the request-time intersection at `README.md:332` — owned by [[authentication-index]] and [[authorization-index]], relied on here. The MVP's own acceptance test for it is `README.md:412`: a `catalog:read`-only token is refused by `cellar_add` **even though its user is a member**.

## Open questions

Decisions this feature still needs. Every one is also in [[divergences]].

| Question | Blocked on | Consequence of leaving it open |
| --- | --- | --- |
| **`scopes` naming a permission the user's role does not grant — ignored or rejected?** | A human decision. Both readings are safe at request time thanks to the intersection; they differ in whether the admin is *told* their token is weaker than they asked for. | An admin believes a token can do something it cannot, or `token_create` fails unexpectedly after a role change. Highest priority here. |
| Is there a rotation policy, and should `expires_at` have a default? | Product. `expires_at` is optional, so tokens are immortal by default (`README.md:325`). | Every key ever issued stays valid forever. |
| Does listing tokens **for everyone** need more than `admin:tokens`? | Product. `README.md:229` gives one permission for both scopes of the query. | A cross-tenant read is gated identically to a single-user read. |
| Is issuance or revocation rate-limited? | Nothing anywhere specifies rate limiting ([[security]]). | Unbounded token minting by any compromised admin key. |
| Is `token_revoke` idempotent on an already-revoked token? | Implementation decision that should be recorded, not discovered. | Agents retry; an error-on-repeat turns a safe retry into a reported failure. |
| Is there a maximum number of tokens per user? | Product. | Nothing bounds the table. |
| Should reinstating a suspended user silently restore all their tokens? | A human decision. Suspension does not set `revoked_at`; the auth flow rejects on user status (`README.md:216`, `README.md:331`). | Suspension reads as revocation and is not. See [[token-administration-states]]. |
| Is `last_used_at` allowed to drive a "revoke unused keys" workflow? | It should not be — it is best-effort via `ctx.waitUntil` (`README.md:341`). Needs stating, or making reliable. | Someone revokes keys that are in daily use. |
| Is issuance audited beyond one "token issued" entry? | `README.md:345` names the action and says nothing about its `metadata` — see [[audit-logging]]. | No record of *what* was issued: label, scopes, expiry. |
