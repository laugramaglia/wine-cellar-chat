---
feature: wine-catalog
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - README.md:11
  - README.md:160
updated: 2026-08-29
---

# Wine catalogue — flow

> **Stub.** Described from `README.md`. No implementation exists to check this against.

## Happy path — photograph a bottle into the catalogue

1. The user photographs a bottle and hands the image to their MCP client.
2. **The client** reads the label. Vision is client-side; the server never sees the image (`README.md:11`, [ADR-0009](../../decisions/0009-vision-happens-client-side.md)).
3. The client calls `wine_upsert` with whatever structured fields it extracted. Only `name` is required (`README.md:91`); `{ name, producer }` alone is a legal wine (`README.md:408`).
4. The server resolves the caller from the bearer token ([[authentication-index]]) and checks `catalog:write` ([[authorization-index]], `README.md:119`).
5. Without `wine_id`, the server matches on `(producer, name, vintage)` (`README.md:162`). A match is an update; no match is an insert.
6. On update, the server **fills blanks only** — a null column takes the supplied value, a non-null column is left alone ([ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md), `README.md:163`).
7. The server returns the full wine row plus `created: bool` and `fields_filled: string[]` (`README.md:166`), so the agent can tell the user what actually changed.

## Happy path — fill a wine in later

Same call, a week later, with the grapes and the region (`README.md:165`). The row is matched, the null columns are filled, `created` is `false`, and `fields_filled` names exactly what was added. Nothing already known is touched. The definition of done tests this directly (`README.md:405`).

## Happy path — find a wine

1. The client calls `wine_search` with free text and/or structured filters (`README.md:168`–`README.md:171`).
2. The server checks `catalog:read` — every role holds it, including `guest` (`README.md:118`).
3. Results are capped: `limit` defaults to 10 and cannot exceed 50 (`README.md:171`).
4. Each row is annotated **for the calling user** with `owned` and `quantity` (`README.md:172`) — a per-caller value computed against the caller's cellar, over a shared row.
5. `wine_get` on one id returns the wine, the caller's cellar holdings, the caller's reviews, and the aggregate rating across all users (`README.md:174`).

## Preconditions

| | |
| --- | --- |
| Transport | A live Streamable HTTP session at `/mcp` (`README.md:25`, [[mcp-protocol]]) |
| Identity | A bearer token that is known, unrevoked, unexpired, and whose user is `active` (`README.md:329`–`README.md:331`) |
| Permission | `catalog:read` to search or get, `catalog:write` to upsert (`README.md:118`–`README.md:119`) |
| Data | For an upsert, a `name`. Nothing else. |

## Postconditions

| | |
| --- | --- |
| Persisted | One `wines` row, created or field-filled. `updated_at` moves; `created_by` is set on creation only (`README.md:73`). |
| Not persisted | The image. Any image, ever (`README.md:38`). |
| Not persisted | Which caller supplied which field. Only the row creator is recorded. |
| Visible to | Everyone. The catalogue is shared (`README.md:47`). |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Insert | No `wine_id` and no `(producer, name, vintage)` match | New row, `created: true`, `fields_filled` = every supplied field |
| Fill | Match found, some target columns null | Row updated in those columns only, `created: false` |
| No-op | Match found, every supplied column already non-null | Row unchanged, `created: false`, `fields_filled: []` |
| Overwrite | Caller passes `overwrite: true` | Supplied values replace non-null values (`README.md:164`) |
| Targeted | Caller passes `wine_id` | The match step is skipped entirely (`README.md:161`) |
| Inline from the cellar | `cellar_add` is called with inline wine fields instead of a `wine_id` | It upserts first, through this same path (`README.md:179`) — owned by [[cellar-index]] |

## Timing and automatic behaviour

Nothing in this feature is timed, retried, debounced or auto-advanced. The one background action on the request path belongs to [[authentication-index]]: `last_used_at` is updated best-effort via `ctx.waitUntil` (`README.md:341`).

## What is deliberately not here

| Not here | Why |
| --- | --- |
| Image upload, OCR, any server-side vision | [ADR-0009](../../decisions/0009-vision-happens-client-side.md); out of scope at `README.md:38` |
| Enrichment from an external wine API, price lookups, scraping | Out of scope (`README.md:37`); the agent already has web search (`README.md:31`). An `enrich_wine` tool is post-MVP (`README.md:424`). |
| Semantic "wines like this one" search | Embeddings and pgvector are post-MVP (`README.md:36`) |
| A delete or merge path for wines | The specification defines no way to remove or merge a catalogue row. Wines outlive even the deletion of the user who created them (`README.md:222`). |
| Quantity, price paid, drink window | [[cellar-index]] |
