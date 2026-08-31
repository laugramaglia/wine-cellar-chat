# Wine Cellar MCP

A remote MCP server for wine: keep a catalog, track your own cellar, write and read tasting
reviews, and ask a deterministic recommendation engine what to drink. Any MCP client —
Claude, Gemini, Cursor, your own agent — connects to the same URL with its own bearer token
and sees the same cellar, because identity lives in the database, not in the client.

Nothing is implemented yet. This repository currently holds the specification and the wiki
derived from it.

## The details are in the wiki

**[`business-docs/`](business-docs/README.md) is the source of truth.** Every business rule,
tool contract, permission, scoring weight and open question lives there — not here.

| Looking for | Go to |
| --- | --- |
| Where to start, and how the wiki is maintained | [`business-docs/README.md`](business-docs/README.md) |
| The features, decisions and shared concerns | [`business-docs/wiki/README.md`](business-docs/wiki/README.md) |
| The original MVP specification, verbatim | [`business-docs/wiki/shared/mvp-spec.md`](business-docs/wiki/shared/mvp-spec.md) |
| A rule by key, or a closed enum | `business-docs/rules/<feature>.json` (derived — never hand-edit) |
| Why something was decided the way it was | [`business-docs/wiki/decisions/`](business-docs/wiki/decisions/) |

Changing a rule means changing the wiki first, then running `/business-wiki:derive`.
