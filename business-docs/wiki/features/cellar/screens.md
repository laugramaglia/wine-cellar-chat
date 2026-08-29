---
feature: cellar
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - README.md:39
updated: 2026-08-29
---

# Cellar — screens

**There are none.** This is a headless remote MCP server; *"the MCP client **is** the UI"* (`README.md:39`), and a web UI is explicitly out of scope for the MVP (`README.md:33`–`39`).

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | No screens exist or are planned. |

The only route the project exposes is the transport endpoint `/mcp`, Streamable HTTP (`README.md:25`, `README.md:384`) — a protocol surface, not a screen. See [[mcp-protocol]].

## What renders the cellar instead

Whatever the connected client is — Claude Desktop/Code/web, Gemini, Cursor, a custom agent (`README.md:6`–`8`). Each renders `cellar_list` output in its own way, and the server has no say in it, no layout, and no navigation contract.

The practical consequence for authoring: **presentation rules cannot be specified here**. Ordering *can* — `sort` is a server-side parameter with four legal values (`README.md:188`) and belongs to [[cellar-api]]. Grouping, colour, and phrasing do not exist server-side at all.

## Navigation contract

Not applicable. There is no navigation stack, no push/replace, no back behaviour. MCP tool calls are independent request/response pairs; see [[mcp-protocol]].

One adjacent rule is worth knowing, because it is the closest thing to a navigation affordance the project has: `tools/list` returns only the tools the caller is permitted to call (`README.md:132`). A `guest` never sees `cellar_list`, `cellar_add`, or `cellar_update` at all (`README.md:120`–`121`), so from that client's point of view the cellar does not exist. That is a visibility rule owned by [[authorization-index]], not a screen.

## Composition

Not applicable.
