---
feature: authentication
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - README.md:381
updated: 2026-08-29
---

# Authentication — screens

**There are no screens.** This is a headless remote MCP server. **A web UI is explicitly out of scope: "The MCP client *is* the UI"** (`README.md:39`). There is no login form, no consent screen, no session page, no token-management screen — an admin manages tokens by asking their agent to call `token_create` ([[token-administration-index]]).

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist, and none are planned for the MVP |

The nearest thing to a user-facing surface is client configuration: the URL and the header a person pastes once, into a tool this project does not ship.

## Client configuration

Two values, and nothing else (`README.md:383-386`):

```
https://<worker>.workers.dev/mcp
Authorization: Bearer <your-token>
```

Claude Code (`README.md:390-393`):

```bash
claude mcp add --transport http wine-cellar https://<worker>.workers.dev/mcp \
  --header "Authorization: Bearer <your-token>"
```

**Any other MCP client: point it at the same URL with the same header** (`README.md:395`). No client-specific configuration exists — the transport is Streamable HTTP at `/mcp`, remote only, with no stdio binary (`README.md:25`).

| Element | Value | Where it comes from |
| --- | --- | --- |
| URL | `https://<worker>.workers.dev/mcp` | `wrangler deploy` (`README.md:401`) |
| Header name | `Authorization` | `README.md:385` |
| Header value | `Bearer wc_…` | issued by `token_create`, shown once ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)) |
| Label | one token per client — `claude-desktop`, `gemini`, `phone` | `README.md:62`, `README.md:323` |

The `label` is the only concession to there being distinct clients, and it exists for revocation, not for display: revoking Gemini leaves Claude working (`README.md:323-324`).

## Navigation contract

Not applicable. There is nothing to push, replace, or pop.

What replaces it is the identity contract: **the same token, or two different tokens for the same user, from two different clients, see one cellar and one prefs profile** (`README.md:402`). Identity lives in the database, not in the client (`README.md:8-9`), so "which app am I in" is never a distinction the server makes.

## What the user sees when authentication fails

The client's own error surface, which this project does not control and cannot style. A `401` reaches the MCP client as a failed connection — no tool list, nothing (`README.md:145`). What that looks like is Claude Desktop's or Cursor's business. See [[authentication-errors]] and [[authentication-copy]].

## Not real yet

No deployed Worker exists, so `<worker>.workers.dev` names nothing. `wrangler deploy` putting a reachable `/mcp` endpoint live is the first unchecked box in the definition of done (`README.md:401`).
