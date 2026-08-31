---
feature: wine-catalog
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
updated: 2026-08-29
---

# Wine catalogue — screens

**There are none.** This is a headless MCP server. A web UI is explicitly out of scope for the MVP, and the MCP client *is* the UI (`business-docs/wiki/shared/mvp-spec.md:53`).

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | No screens exist or are planned for this feature |

## What plays the part of a screen

The presentation layer lives entirely in the connected client — Claude Desktop, Claude Code, Gemini, Cursor, or a custom agent (`business-docs/wiki/shared/mvp-spec.md:20`–`business-docs/wiki/shared/mvp-spec.md:21`). What this feature controls is the **shape of the tool result**, not its rendering: an agent decides how to show `owned`, `quantity`, `fields_filled`, or a search result list, and different clients will show them differently. Those field contracts are in [[wine-catalog-api]].

The only route the server exposes is the transport endpoint, and it belongs to [[mcp-protocol]], not to this feature:

| Route | What it is | Where |
| --- | --- | --- |
| `/mcp` | Streamable HTTP, remote only, no stdio binary | `business-docs/wiki/shared/mvp-spec.md:39` |

## Navigation contract

Not applicable. There is no navigation stack, no push or replace, and nothing to return to.

## Composition

Not applicable — nothing is server-driven or block-composed. Do not add screens to this page unless a UI is actually built; the absence is the decision (`business-docs/wiki/shared/mvp-spec.md:53`).
