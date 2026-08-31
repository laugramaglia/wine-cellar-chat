---
feature: wine-catalog
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:25
  - business-docs/wiki/shared/mvp-spec.md:174
updated: 2026-08-29
---

# Wine catalogue — flow

> **Stub.** Described from [[mvp-spec]]. No implementation exists to check this against.

## Happy path — photograph a bottle into the catalogue

1. The user photographs a bottle and hands the image to their MCP client.
2. **The client** reads the label. Vision is client-side; the server never sees the image (`business-docs/wiki/shared/mvp-spec.md:25`, [ADR-0009](../../decisions/0009-vision-happens-client-side.md)).
3. The client calls `wine_upsert` with whatever structured fields it extracted. Only `name` is required (`business-docs/wiki/shared/mvp-spec.md:105`); `{ name, producer }` alone is a legal wine (`business-docs/wiki/shared/mvp-spec.md:422`).
4. The server resolves the caller from the bearer token ([[authentication-index]]) and checks `catalog:write` ([[authorization-index]], `business-docs/wiki/shared/mvp-spec.md:133`).
5. Without `wine_id`, the server matches on `(producer, name, vintage)` (`business-docs/wiki/shared/mvp-spec.md:176`). A match is an update; no match is an insert.
6. On update, the server **fills blanks only** — a null column takes the supplied value, a non-null column is left alone ([ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md), `business-docs/wiki/shared/mvp-spec.md:177`).
7. The server returns the full wine row plus `created: bool` and `fields_filled: string[]` (`business-docs/wiki/shared/mvp-spec.md:180`), so the agent can tell the user what actually changed.

## Happy path — fill a wine in later

Same call, a week later, with the grapes and the region (`business-docs/wiki/shared/mvp-spec.md:179`). The row is matched, the null columns are filled, `created` is `false`, and `fields_filled` names exactly what was added. Nothing already known is touched. The definition of done tests this directly (`business-docs/wiki/shared/mvp-spec.md:419`).

## Happy path — find a wine

1. The client calls `wine_search` with free text and/or structured filters (`business-docs/wiki/shared/mvp-spec.md:182`–`business-docs/wiki/shared/mvp-spec.md:185`).
2. The server checks `catalog:read` — every role holds it, including `guest` (`business-docs/wiki/shared/mvp-spec.md:132`).
3. Results are capped: `limit` defaults to 10 and cannot exceed 50 (`business-docs/wiki/shared/mvp-spec.md:185`).
4. Each row is annotated **for the calling user** with `owned` and `quantity` (`business-docs/wiki/shared/mvp-spec.md:186`) — a per-caller value computed against the caller's cellar, over a shared row.
5. `wine_get` on one id returns the wine, the caller's cellar holdings, the caller's reviews, and the aggregate rating across all users (`business-docs/wiki/shared/mvp-spec.md:188`).

## Preconditions

| | |
| --- | --- |
| Transport | A live Streamable HTTP session at `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`, [[mcp-protocol]]) |
| Identity | A bearer token that is known, unrevoked, unexpired, and whose user is `active` (`business-docs/wiki/shared/mvp-spec.md:343`–`business-docs/wiki/shared/mvp-spec.md:345`) |
| Permission | `catalog:read` to search or get, `catalog:write` to upsert (`business-docs/wiki/shared/mvp-spec.md:132`–`business-docs/wiki/shared/mvp-spec.md:133`) |
| Data | For an upsert, a `name`. Nothing else. |

## Postconditions

| | |
| --- | --- |
| Persisted | One `wines` row, created or field-filled. `updated_at` moves; `created_by` is set on creation only (`business-docs/wiki/shared/mvp-spec.md:87`). |
| Not persisted | The image. Any image, ever (`business-docs/wiki/shared/mvp-spec.md:52`). |
| Not persisted | Which caller supplied which field. Only the row creator is recorded. |
| Visible to | Everyone. The catalogue is shared (`business-docs/wiki/shared/mvp-spec.md:61`). |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Insert | No `wine_id` and no `(producer, name, vintage)` match | New row, `created: true`, `fields_filled` = every supplied field |
| Fill | Match found, some target columns null | Row updated in those columns only, `created: false` |
| No-op | Match found, every supplied column already non-null | Row unchanged, `created: false`, `fields_filled: []` |
| Overwrite | Caller passes `overwrite: true` | Supplied values replace non-null values (`business-docs/wiki/shared/mvp-spec.md:178`) |
| Targeted | Caller passes `wine_id` | The match step is skipped entirely (`business-docs/wiki/shared/mvp-spec.md:175`) |
| Inline from the cellar | `cellar_add` is called with inline wine fields instead of a `wine_id` | It upserts first, through this same path (`business-docs/wiki/shared/mvp-spec.md:193`) — owned by [[cellar-index]] |

## Timing and automatic behaviour

Nothing in this feature is timed, retried, debounced or auto-advanced. The one background action on the request path belongs to [[authentication-index]]: `last_used_at` is updated best-effort via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`).

## What is deliberately not here

| Not here | Why |
| --- | --- |
| Image upload, OCR, any server-side vision | [ADR-0009](../../decisions/0009-vision-happens-client-side.md); out of scope at `business-docs/wiki/shared/mvp-spec.md:52` |
| Enrichment from an external wine API, price lookups, scraping | Out of scope (`business-docs/wiki/shared/mvp-spec.md:51`); the agent already has web search (`business-docs/wiki/shared/mvp-spec.md:45`). An `enrich_wine` tool is post-MVP (`business-docs/wiki/shared/mvp-spec.md:438`). |
| Semantic "wines like this one" search | Embeddings and pgvector are post-MVP (`business-docs/wiki/shared/mvp-spec.md:50`) |
| A delete or merge path for wines | The specification defines no way to remove or merge a catalogue row. Wines outlive even the deletion of the user who created them (`business-docs/wiki/shared/mvp-spec.md:236`). |
| Quantity, price paid, drink window | [[cellar-index]] |
