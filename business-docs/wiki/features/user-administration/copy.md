---
feature: user-administration
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:153
updated: 2026-08-29
---

# User administration — copy

**This page is thin, and that is structural.** There are no screens ([[user-administration-screens]]) and no localization system: the server returns structured tool results, and the MCP client decides every word the human reads (`business-docs/wiki/shared/mvp-spec.md:53`). The only server-authored strings with business weight are error messages and the one-time token payload.

| Key | Source text | Placeholders | Where it appears |
| --- | --- | --- | --- |
| permission denied | `Permission denied: '<tool>' requires '<permission>'; your role is '<role>'.` | tool name, permission, role | MCP error on any `admin:users` call by a non-admin (`business-docs/wiki/shared/mvp-spec.md:153-154`) |
| guard rejection — self | **not specified** | — | `user_update` targeting the caller (`business-docs/wiki/shared/mvp-spec.md:230-231`) |
| guard rejection — last admin | **not specified** | — | `user_update` / `user_delete` on the last active admin (`business-docs/wiki/shared/mvp-spec.md:231-232`) |

## Copy that asserts a rule

| String | Claim | Enforced? |
| --- | --- | --- |
| `Permission denied: '<tool>' requires '<permission>'; your role is '<role>'.` | That the named permission is what gates the named tool. | **Enforced.** `TOOL_PERMISSIONS` is one table in code and a missing entry fails to compile ([ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md), `business-docs/wiki/shared/mvp-spec.md:428`). The message can only be wrong if it is built from a literal instead of from that table — build it from the table. |
| The same message | That the caller's role is the reason. | **Partly misleading.** A denial can also come from a token's `scopes` narrowing an otherwise-sufficient role (`business-docs/wiki/shared/mvp-spec.md:126-128`, `business-docs/wiki/shared/mvp-spec.md:426`). A message naming only the role sends the admin to fix the wrong thing. Recorded here rather than in [[divergences]] because no implementation exists to diverge yet. |

## The one-time token payload

Not a UI string, but the most sensitive output this feature produces. `user_create` with `issue_token: true` returns the **plaintext token, exactly once** (`business-docs/wiki/shared/mvp-spec.md:225`, [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)). Unusual properties, all of which the specification leaves to the client:

- It is a bearer credential carrying the new user's full role permissions.
- It is unrecoverable. If the client's rendering truncates it, or the human loses the message, the only path is revoke and reissue.
- The server never logs it, plaintext or hashed (`business-docs/wiki/shared/mvp-spec.md:361`, [[security]]) — but the **client's** transcript, history, and any sync that transcript has are entirely outside the server's control. Nothing addresses that.
- The `wc_` prefix exists so a leaked token is greppable in logs (`business-docs/wiki/shared/mvp-spec.md:335`) — a detection aid, not permission to log it.

## Not localized

Nothing is. There is no localization system and no requirement for one; the client is the presentation layer. Every string above is a hard-coded English literal by design.

## Unused keys

None — there is no string catalogue to hold them.
