---
feature: user-administration
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
updated: 2026-08-29
---

# User administration — screens

**There are none, by design.**

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | no screens exist in this project |

A web UI is explicitly out of scope for the MVP: *"A web UI. The MCP client **is** the UI"* (`business-docs/wiki/shared/mvp-spec.md:53`). The server is a headless remote MCP endpoint at `/mcp` over Streamable HTTP (`business-docs/wiki/shared/mvp-spec.md:39`); everything a person sees is rendered by their own MCP client — Claude Desktop, Claude Code, Gemini, Cursor, a bespoke agent (`business-docs/wiki/shared/mvp-spec.md:20-22`).

## Navigation contract

Not applicable. There is no navigation stack, no route table, no push/replace semantics. The nearest equivalent is the MCP tool surface, and that is documented in [[user-administration-api]] and [[mcp-protocol]].

## What replaces a screen

| Instead of | The user gets |
| --- | --- |
| An admin console | An MCP client conversation calling `user_list` and reading the result (`business-docs/wiki/shared/mvp-spec.md:227`). |
| A "user created" confirmation page | The `user_create` tool result, rendered however the client chooses (`business-docs/wiki/shared/mvp-spec.md:225`). |
| A form with field validation | The tool's input schema, enforced server-side. See [[user-administration-validations]]. |

Because presentation belongs to the client, **the server cannot control how the one-time plaintext token is displayed, stored, or logged by the client**. Nothing in the specification addresses that. See [[user-administration-copy]] and [[security]].
