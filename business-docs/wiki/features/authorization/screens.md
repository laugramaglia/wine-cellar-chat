---
feature: authorization
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - README.md:39
  - README.md:130
updated: 2026-08-29
---

# Authorization — screens

**There are no screens.** This is a headless remote MCP server; a web UI is explicitly out of scope and **the MCP client *is* the UI** (`README.md:39`). Nothing in this repository renders anything.

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist |

Do not add a row here without a rendering surface to point at.

## The nearest analogue: the filtered tool list

The one thing in this feature that a human genuinely *sees* is the tool list their MCP client renders, and that list is authorization's output.

| | |
| --- | --- |
| Produced by | the visibility layer — `tools/list` returns only permitted tools (`README.md:132-133`) |
| Rendered by | the MCP client (Claude Desktop / Code / web, Gemini, Cursor, a custom agent — `README.md:6-8`) |
| Varies by | the caller's effective permission set, so two tokens for the same user can show different lists |
| Verified by | `README.md:410` — Fabian's member token does not see `user_create` in `tools/list` |

Two callers of the same server therefore see different products. A guest's client offers four tools' worth of capability; an admin's offers all sixteen. Nothing tells the guest that more exists — that is the intent, not an omission (`README.md:133-134`).

## Navigation contract

Not applicable. There is no navigation stack, no routes, no push or replace. The transport is Streamable HTTP at `/mcp` (`README.md:25`) and the only URL is the one in `README.md:384`.

## Composition

Not applicable. The tool list is assembled from `TOOL_PERMISSIONS` (`README.md:147`) filtered by `props.permissions`, not from server-driven UI blocks. See [[mcp-protocol]] for the shape of a `tools/list` response.
