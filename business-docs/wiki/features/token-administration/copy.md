---
feature: token-administration
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - README.md:226
updated: 2026-08-29
---

# Token administration — copy

This feature has almost no copy: there are no screens ([[token-administration-screens]]), and every string a human sees is either a tool result rendered by their MCP client or an error message. The short list below is what carries business weight.

| Key | Source text | Placeholders | Where it appears |
| --- | --- | --- | --- |
| plaintext token | the token itself: `wc_<base64url>` | — | `token_create` response, exactly once (`README.md:226`, `README.md:321`) |
| permission denial | `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` | tool, permission, role | Any tool call the caller may not make (`README.md:139-141`) |
| token prefix | `wc_` | — | Every token; chosen so it is greppable in logs (`README.md:321`) |

## The one-time plaintext token is an operational hazard

Not a string problem — a delivery problem, and worth recording because nothing else in this project has this shape.

`token_create` returns a live bearer credential as **tool output to an LLM agent** (`README.md:226-227`). The agent will, by default, do what agents do with tool output: **echo it into the chat transcript**. That transcript is then wherever transcripts go — the client's local history, a provider's logs, a screenshot, a shared session.

| Fact | Consequence |
| --- | --- |
| The server never logs the token (`README.md:347`) | The server-side guarantee holds |
| The token reaches an agent that renders output to a human | The client-side guarantee does not exist, and this project cannot enforce it |
| Only the hash is stored (`README.md:322`) | Nobody can tell afterwards whether a token was exposed — the leak is undetectable from here |
| The `wc_` prefix is greppable (`README.md:321`) | A detection aid *after* a leak, not permission to log one ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)) |

The only mitigation this feature actually holds is `token_revoke` (`README.md:233`) — an exposed token is revoked and reissued, never scrubbed. Treat any token that appeared in a transcript as compromised.

**Unspecified:** whether the `token_create` result carries any warning text telling the agent not to repeat it, or whether the response marks the field sensitive in any machine-readable way. Nothing in `README.md` says. Recorded in [[divergences]] and [[security]].

## Copy that asserts a rule

| String | Claim | Enforced? |
| --- | --- | --- |
| `Permission denied: '<tool>' requires '<permission>'; your role is '<role>'.` | That the named permission is what gates the tool | Enforced — the permission map is a single `TOOL_PERMISSIONS` record, and a missing entry is a compile error (`README.md:147-148`, [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md)) |
| "never retrievable again" (`README.md:226`) | That no path recovers a token | Enforced structurally: the plaintext is not stored (`README.md:322`) |

Note the message names the **role** but not the token's **scopes**. A member holding a `catalog:read`-only token who calls `cellar_add` is refused (`README.md:412`) — but the stated message text would report their role as `member`, which is true and unhelpful. Whether the message distinguishes a role denial from a scope denial is unspecified; recorded in [[divergences]].

## Not localized

Nothing is localized, and nothing is specified to be. Error text is English, in code, and read by an agent rather than a person — which makes it API surface, not UI copy. See [[error-codes]].

## Unused keys

None — there is no string catalogue.
