---
feature: reviews
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
updated: 2026-08-29
---

# Reviews — screens

**There are no screens.** This project is a headless remote MCP server on Cloudflare Workers (`business-docs/wiki/shared/mvp-spec.md:20-21`). A web UI is explicitly out of scope for the MVP: *"A web UI. The MCP client **is** the UI."* (`business-docs/wiki/shared/mvp-spec.md:53`).

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist, by scope decision (`business-docs/wiki/shared/mvp-spec.md:53`) |

## Navigation contract

Not applicable. The only route the server exposes is the Streamable HTTP MCP endpoint `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`, `business-docs/wiki/shared/mvp-spec.md:398`), which is a transport, not a screen.

## Composition

Not applicable. What a user sees when they write or read a review is rendered entirely by their MCP client — Claude Desktop, Claude Code, Gemini, Cursor, or a custom agent (`business-docs/wiki/shared/mvp-spec.md:20-22`). The server contributes tool results; the client decides how they look.

Two consequences worth stating, because they are why this page is not simply empty:

| Consequence | Detail |
| --- | --- |
| Presentation is unowned | No page in this wiki can specify how a rating is displayed. Each client renders it differently, and none of that is testable from this repository. |
| Tool descriptions are the UI | The one piece of interface this feature controls is the tool name, description, and input schema the agent reads before calling. That copy is in [[reviews-copy]]; the protocol is in [[mcp-protocol]]. |
