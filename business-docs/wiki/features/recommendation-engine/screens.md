---
feature: recommendation-engine
page: screens
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:53
updated: 2026-08-29
---

# Recommendation engine — screens

**There are no screens.** This feature has no UI surface of its own and never will under
the current scope.

| Screen ID | Route | Implementation | Notes |
| --- | --- | --- | --- |
| — | — | — | none exist |

## Why there are none

A web UI is explicitly out of scope: *"A web UI. The MCP client **is** the UI"*
(`business-docs/wiki/shared/mvp-spec.md:53`). The product is a remote MCP server on Cloudflare Workers with a single
Streamable HTTP endpoint at `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`). Claude Desktop, Claude Code, Gemini,
Cursor or a bespoke agent connect to it (`business-docs/wiki/shared/mvp-spec.md:20-22`); each of those renders its own
conversation, and none of them is ours to specify.

Do not add screens to this page when a UI appears somewhere. If one is ever built it is a
different feature with its own page set, and it consumes `wine_recommend` rather than
containing it.

## The screen equivalent

The nearest thing to a screen is the **tool result rendered by the calling agent** — the
JSON of `business-docs/wiki/shared/mvp-spec.md:271-285` turned into prose by a model we do not control.

| Surface | What it is | Who controls it |
| --- | --- | --- |
| The `wine_recommend` result object | Ranked entries with `wine`, `score`, `in_cellar`, `quantity`, `reasons`, `penalties` (`business-docs/wiki/shared/mvp-spec.md:271-285`) | This feature — see [[recommendation-engine-api]] |
| The rendering of that object | Sentences the agent writes for the user | The MCP client. Different in Claude and in Gemini for the same call. |
| The `reasons` / `penalties` strings | The only user-facing text this feature authors | This feature — see [[recommendation-engine-copy]] |

That split is the reason the `reasons` strings carry so much weight. They are the only
part of the presentation we can guarantee: whatever the agent does with the numbers, the
sentences travel with them. [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md)
is in effect a UI decision made in the absence of a UI.

## Navigation contract

Not applicable. There is no navigation, no push or replace, and no back stack. One tool
call in, one result out. The protocol itself is documented in [[mcp-protocol]].

## Composition

Not applicable. Nothing is server-driven or block-composed. Post-MVP, MCP *resources*
exposing the cellar as browsable context and MCP *prompts* for "sommelier mode"
(`business-docs/wiki/shared/mvp-spec.md:436-437`) would be the first thing resembling a composed surface; neither
exists.
