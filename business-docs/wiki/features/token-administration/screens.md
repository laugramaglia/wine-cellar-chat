---
feature: token-administration
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
updated: 2026-08-29
---

# Token administration — screens

**There are no screens.** This is a headless remote MCP server; a web UI is explicitly out of scope and **the MCP client *is* the UI** (`business-docs/wiki/shared/mvp-spec.md:53`). Every interaction in this feature is a tool call made by an agent on an admin's behalf, rendered by whatever client that admin is using.

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist, and none are planned for the MVP |

## The nearest analogue: client configuration

The one place a human touches this feature directly is pasting an issued token into a client (`business-docs/wiki/shared/mvp-spec.md:397-409`). That is configuration, not a screen, and it happens outside this server entirely.

| Client | What the human does | Source |
| --- | --- | --- |
| Any MCP client | Point it at `https://<worker>.workers.dev/mcp` with header `Authorization: Bearer <your-token>` | `business-docs/wiki/shared/mvp-spec.md:398-399`, `business-docs/wiki/shared/mvp-spec.md:409` |
| Claude Code | `claude mcp add --transport http wine-cellar <url> --header "Authorization: Bearer <your-token>"` | `business-docs/wiki/shared/mvp-spec.md:405-406` |

The `label` chosen at `token_create` should name the client this token is pasted into — `claude-desktop`, `gemini`, `phone` (`business-docs/wiki/shared/mvp-spec.md:76`). That correspondence is a convention held by the admin, not enforced anywhere.

## Navigation contract

Not applicable. The transport is Streamable HTTP at `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`); see [[mcp-protocol]].

## Composition

Not applicable. What an admin's agent *shows* about a token is the client's rendering of the tool result — outside this project's control, which is precisely why the one-time plaintext in the `token_create` response is a hazard. See [[token-administration-copy]].
