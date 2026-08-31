---
feature: cellar
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
updated: 2026-08-29
---

# Cellar — screens

**There are none.** This is a headless remote MCP server; *"the MCP client **is** the UI"* (`business-docs/wiki/shared/mvp-spec.md:53`), and a web UI is explicitly out of scope for the MVP (`business-docs/wiki/shared/mvp-spec.md:47`–`53`).

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | No screens exist or are planned. |

The only route the project exposes is the transport endpoint `/mcp`, Streamable HTTP (`business-docs/wiki/shared/mvp-spec.md:39`, `business-docs/wiki/shared/mvp-spec.md:398`) — a protocol surface, not a screen. See [[mcp-protocol]].

## What renders the cellar instead

Whatever the connected client is — Claude Desktop/Code/web, Gemini, Cursor, a custom agent (`business-docs/wiki/shared/mvp-spec.md:20`–`22`). Each renders `cellar_list` output in its own way, and the server has no say in it, no layout, and no navigation contract.

The practical consequence for authoring: **presentation rules cannot be specified here**. Ordering *can* — `sort` is a server-side parameter with four legal values (`business-docs/wiki/shared/mvp-spec.md:202`) and belongs to [[cellar-api]]. Grouping, colour, and phrasing do not exist server-side at all.

## Navigation contract

Not applicable. There is no navigation stack, no push/replace, no back behaviour. MCP tool calls are independent request/response pairs; see [[mcp-protocol]].

One adjacent rule is worth knowing, because it is the closest thing to a navigation affordance the project has: `tools/list` returns only the tools the caller is permitted to call (`business-docs/wiki/shared/mvp-spec.md:146`). A `guest` never sees `cellar_list`, `cellar_add`, or `cellar_update` at all (`business-docs/wiki/shared/mvp-spec.md:134`–`135`), so from that client's point of view the cellar does not exist. That is a visibility rule owned by [[authorization-index]], not a screen.

## Composition

Not applicable.
