---
feature: cellar
page: api
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:193
  - business-docs/wiki/shared/mvp-spec.md:263
updated: 2026-08-29
---

# Cellar — API

**There is no OpenAPI document, by decision.** The surface is MCP tools over Streamable HTTP at a single endpoint, not a set of REST resources — see [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). An OpenAPI file would have exactly one path (`POST /mcp`) and describe nothing about the cellar. The tool contracts below are therefore the contract, and this page is where they live.

Transport and framing: [[mcp-protocol]]. Types and enums: [[data-types]].

| Tool | Permission | Transport | Called from |
| --- | --- | --- | --- |
| `cellar_add` | `cellar:write` | `tools/call` on `POST /mcp` | Any MCP client (`business-docs/wiki/shared/mvp-spec.md:193`, `business-docs/wiki/shared/mvp-spec.md:135`) |
| `cellar_update` | `cellar:write` | same | (`business-docs/wiki/shared/mvp-spec.md:197`) |
| `cellar_list` | `cellar:read` | same | (`business-docs/wiki/shared/mvp-spec.md:200`, `business-docs/wiki/shared/mvp-spec.md:134`) |

> **Unverified.** The specification gives these as prose field lists, not schemas. Types, optionality, and every return shape below are inferred where marked.

## `cellar_add`

Put bottles in the cellar (`business-docs/wiki/shared/mvp-spec.md:193`–`195`).

| Input | Type | Notes |
| --- | --- | --- |
| `wine_id` | id | **Or** inline wine fields, which upsert first |
| inline wine fields | `wines` fields | `name` required; merged per [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) |
| `quantity` | number | No default stated |
| `purchase_price` | number | No currency stated |
| `purchase_date` | date | |
| `location` | text | |
| `drink_from` | date | |
| `drink_until` | date | |

No `user_id` — the owner comes from `props` (`business-docs/wiki/shared/mvp-spec.md:169`).

**Return shape is unspecified.** By analogy `wine_upsert` returns the full row plus `created: bool` and `fields_filled: string[]` (`business-docs/wiki/shared/mvp-spec.md:180`); whether `cellar_add` reports what its side-effect upsert did is not stated, and it matters — see [[cellar-errors]].

## `cellar_update`

Change quantity / location / drink window, or mark `status: drunk | gifted` (`business-docs/wiki/shared/mvp-spec.md:197`–`198`).

| Input | Type | Notes |
| --- | --- | --- |
| item identifier | id | Not named in the specification; an update must identify a row. Scoping it to the caller is unstated — see [[cellar-validations]] |
| `quantity` | number | Below zero is undefined |
| `location`, `drink_from`, `drink_until` | as above | |
| `status` | enum | `drunk \| gifted`. Setting `in_cellar` back is unstated |

**Side effect:** drinking the last bottle sets `status = drunk` automatically (`business-docs/wiki/shared/mvp-spec.md:198`). Full transition table in [[cellar-states]].

## `cellar_list`

The caller's cellar (`business-docs/wiki/shared/mvp-spec.md:200`–`202`).

| Filter | Type | Notes |
| --- | --- | --- |
| `wine_type` | enum | Seven values (`business-docs/wiki/shared/mvp-spec.md:100`) |
| `region` | text | |
| `ready_to_drink` | bool | "now inside the drink window" |
| `drink_soon` | months | "window closes within N months" — **no default `N`** |
| `sort` | enum | `drink_until \| purchase_date \| price \| name`; no default, no direction stated |

No `limit` is specified, unlike `wine_search` (default 10, max 50, `business-docs/wiki/shared/mvp-spec.md:185`).

## Request rules that matter here

| Rule | Detail |
| --- | --- |
| Caller resolution | `{ userId, role, tokenId, permissions }` arrive as `props`; handlers read the user from `props`, never from tool input (`business-docs/wiki/shared/mvp-spec.md:347`, `business-docs/wiki/shared/mvp-spec.md:350`) |
| Permission re-check | Every handler re-checks before doing any work, independently of `tools/list` filtering (`business-docs/wiki/shared/mvp-spec.md:150`) |
| Auth precedes everything | Bad token → `401` at the edge; no tool list, nothing (`business-docs/wiki/shared/mvp-spec.md:159`) |
| Ordering inside `cellar_add` | Inline wine fields upsert **first**, then the item is inserted ([[cellar-flow]]) |

No defaults or clamps are stated for any cellar input. That is itself the finding.

## Response rules that matter here

| Rule | Detail |
| --- | --- |
| Scope | A cellar response contains only the caller's items. Structural, not filtered — there is no way to ask for another user's |
| Cross-feature echo | `wine_search` and `wine_get` return an `owned` flag and `quantity` for the caller (`business-docs/wiki/shared/mvp-spec.md:186`, `business-docs/wiki/shared/mvp-spec.md:188`) — cellar data surfaced by catalogue tools |
| Engine echo | `wine_recommend` entries carry `in_cellar: bool` and `quantity` (`business-docs/wiki/shared/mvp-spec.md:275`–`276`) |
| Not returned | Nothing is specified as stripped. `location` and `notes` are free text going straight to a language model |

## Planned

| Planned | Status |
| --- | --- |
| MCP **resources** exposing the cellar as browsable context | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:436`) — no resource is implemented or specified |
| Consumption history / drinking stats | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:437`) |
| Sharing a cellar between users | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:437`) |

None of these exist. Do not assume a `resources/list` returns a cellar.
