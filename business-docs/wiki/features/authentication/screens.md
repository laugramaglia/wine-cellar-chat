---
feature: authentication
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:395
updated: 2026-08-29
---

# Authentication — screens

**There are no screens.** This is a headless remote MCP server. **A web UI is explicitly out of scope: "The MCP client *is* the UI"** (`business-docs/wiki/shared/mvp-spec.md:53`). There is no login form, no consent screen, no session page, no token-management screen — an admin manages tokens by asking their agent to call `token_create` ([[token-administration-index]]).

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist, and none are planned for the MVP |

The nearest thing to a user-facing surface is client configuration: the URL and the header a person pastes once, into a tool this project does not ship.

## Client configuration

Two values, and nothing else (`business-docs/wiki/shared/mvp-spec.md:397-400`):

```
https://<worker>.workers.dev/mcp
Authorization: Bearer <your-token>
```

Claude Code (`business-docs/wiki/shared/mvp-spec.md:404-407`):

```bash
claude mcp add --transport http wine-cellar https://<worker>.workers.dev/mcp \
  --header "Authorization: Bearer <your-token>"
```

**Any other MCP client: point it at the same URL with the same header** (`business-docs/wiki/shared/mvp-spec.md:409`). No client-specific configuration exists — the transport is Streamable HTTP at `/mcp`, remote only, with no stdio binary (`business-docs/wiki/shared/mvp-spec.md:39`).

| Element | Value | Where it comes from |
| --- | --- | --- |
| URL | `https://<worker>.workers.dev/mcp` | `wrangler deploy` (`business-docs/wiki/shared/mvp-spec.md:415`) |
| Header name | `Authorization` | `business-docs/wiki/shared/mvp-spec.md:399` |
| Header value | `Bearer wc_…` | issued by `token_create`, shown once ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)) |
| Label | one token per client — `claude-desktop`, `gemini`, `phone` | `business-docs/wiki/shared/mvp-spec.md:76`, `business-docs/wiki/shared/mvp-spec.md:337` |

The `label` is the only concession to there being distinct clients, and it exists for revocation, not for display: revoking Gemini leaves Claude working (`business-docs/wiki/shared/mvp-spec.md:337-338`).

## Navigation contract

Not applicable. There is nothing to push, replace, or pop.

What replaces it is the identity contract: **the same token, or two different tokens for the same user, from two different clients, see one cellar and one prefs profile** (`business-docs/wiki/shared/mvp-spec.md:416`). Identity lives in the database, not in the client (`business-docs/wiki/shared/mvp-spec.md:22-23`), so "which app am I in" is never a distinction the server makes.

## What the user sees when authentication fails

The client's own error surface, which this project does not control and cannot style. A `401` reaches the MCP client as a failed connection — no tool list, nothing (`business-docs/wiki/shared/mvp-spec.md:159`). What that looks like is Claude Desktop's or Cursor's business. See [[authentication-errors]] and [[authentication-copy]].

## Not real yet

No deployed Worker exists, so `<worker>.workers.dev` names nothing. `wrangler deploy` putting a reachable `/mcp` endpoint live is the first unchecked box in the definition of done (`business-docs/wiki/shared/mvp-spec.md:415`).
