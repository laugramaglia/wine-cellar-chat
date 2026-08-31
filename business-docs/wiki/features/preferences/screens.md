---
feature: preferences
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
updated: 2026-08-29
---

# Preferences — screens

**There are none, and there will not be any.**

This is a headless remote MCP server (`business-docs/wiki/shared/mvp-spec.md:20`). A web UI is explicitly out of scope
for the MVP: *"A web UI. The MCP client **is** the UI"* (`business-docs/wiki/shared/mvp-spec.md:53`). The only
surface is Streamable HTTP at `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`).

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist |

## What plays the part of a screen

| Surface | Owned by | What the user actually sees |
| --- | --- | --- |
| The MCP client's chat window | Claude / Gemini / Cursor / a custom agent | whatever the agent chooses to say about the profile it just read or wrote |
| `tools/list` | [[authorization-index]] | whether `prefs_set` is even offered — a `guest` never sees it (`business-docs/wiki/shared/mvp-spec.md:146-148`) |
| The `prefs_get` / `prefs_set` tool results | [[preferences-api]] | structured data, rendered however the client renders tool output |

The presentation of a preference is therefore **not a rule this project owns**. The same
profile will be phrased differently in Claude and in Gemini, and neither phrasing is
specified here or anywhere else.

## Navigation contract

Not applicable. There is no navigation: a tool call is a single request/response over
`/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`), and MCP *resources* and *prompts* — the closest thing to
browsable UI — are named as post-MVP (`business-docs/wiki/shared/mvp-spec.md:436-437`).

## Composition

Not applicable. Nothing is server-driven or block-composed.
