---
feature: authorization
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
  - business-docs/wiki/shared/mvp-spec.md:144
updated: 2026-08-29
---

# Authorization — screens

**There are no screens.** This is a headless remote MCP server; a web UI is explicitly out of scope and **the MCP client *is* the UI** (`business-docs/wiki/shared/mvp-spec.md:53`). Nothing in this repository renders anything.

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist |

Do not add a row here without a rendering surface to point at.

## The nearest analogue: the filtered tool list

The one thing in this feature that a human genuinely *sees* is the tool list their MCP client renders, and that list is authorization's output.

| | |
| --- | --- |
| Produced by | the visibility layer — `tools/list` returns only permitted tools (`business-docs/wiki/shared/mvp-spec.md:146-147`) |
| Rendered by | the MCP client (Claude Desktop / Code / web, Gemini, Cursor, a custom agent — `business-docs/wiki/shared/mvp-spec.md:20-22`) |
| Varies by | the caller's effective permission set, so two tokens for the same user can show different lists |
| Verified by | `business-docs/wiki/shared/mvp-spec.md:424` — Fabian's member token does not see `user_create` in `tools/list` |

Two callers of the same server therefore see different products. A guest's client offers four tools' worth of capability; an admin's offers all sixteen. Nothing tells the guest that more exists — that is the intent, not an omission (`business-docs/wiki/shared/mvp-spec.md:147-148`).

## Navigation contract

Not applicable. There is no navigation stack, no routes, no push or replace. The transport is Streamable HTTP at `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`) and the only URL is the one in `business-docs/wiki/shared/mvp-spec.md:398`.

## Composition

Not applicable. The tool list is assembled from `TOOL_PERMISSIONS` (`business-docs/wiki/shared/mvp-spec.md:161`) filtered by `props.permissions`, not from server-driven UI blocks. See [[mcp-protocol]] for the shape of a `tools/list` response.
