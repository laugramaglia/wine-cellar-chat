---
feature: wine-catalog
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:84
  - business-docs/wiki/shared/mvp-spec.md:172
updated: 2026-08-29
---

# Wine catalogue

The catalogue is the shared list of **bottlings** — *Catena Malbec 2019* — that every user of the server sees (`business-docs/wiki/shared/mvp-spec.md:61`). It is not ownership: how many bottles you have is a cellar item, and the two are deliberately separate entities ([ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md)). The catalogue starts when an agent calls `wine_upsert` with whatever it read off a label, and it never ends: a wine is filled in over time, call by call, by whoever knows more.

> **Nothing here is implemented.** The only source in this repository is [[mvp-spec]], a specification for a Cloudflare Workers MCP server that has not been written. Every rule below is a claim the specification makes, not a behaviour observed in a running program. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | The MCP tools `wine_upsert`, `wine_search`, `wine_get` (`business-docs/wiki/shared/mvp-spec.md:172`–`business-docs/wiki/shared/mvp-spec.md:189`), called by a connected MCP client over `/mcp` |
| Owns | The `wines` table and its fields; the uniqueness key; `wine_upsert` merge semantics; `wine_search` filters and limits; `wine_get` composition; "every field except `name` is optional"; NV (null `vintage`) handling |
| Does not own | Ownership and quantity ([[cellar-index]]), ratings and tasting notes as reviews ([[reviews-index]]), scoring and ranking ([[recommendation-engine-index]]), token identity ([[authentication-index]]), permission checks ([[authorization-index]]) |
| Status | stub — specified, not built |

## Pages

- [[wine-catalog-flow]] — the happy path
- [[wine-catalog-screens]] — screens and their IDs (there are none; the page says why)
- [[wine-catalog-states]] — the `wines` row and its lifecycle
- [[wine-catalog-errors]] — error catalogue
- [[wine-catalog-copy]] — user-visible strings with business weight
- [[wine-catalog-validations]] — input rules
- [[wine-catalog-api]] — the tool contracts
- [[wine-catalog-decisions]] — the ADRs that apply
- [[wine-catalog-related]] — neighbours and shared concerns

## Rules

Indexed machine-readable form: `business-docs/rules/wine-catalog.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `wine-identity-key` | A bottling is identified by producer, name and vintage, case-insensitively on the two strings. | `UNIQUE (lower(producer), lower(name), vintage)` | `business-docs/wiki/shared/mvp-spec.md:88` |
| `wine-name-required` | `name` is the only required field on a wine. Everything else is optional. | `name` | `business-docs/wiki/shared/mvp-spec.md:105` |
| `wine-catalogue-is-shared` | One catalogue, visible and writable by every user. It is not per-account. | shared | `business-docs/wiki/shared/mvp-spec.md:61` |
| `wine-vintage-nullable` | `vintage` is nullable; null means non-vintage (NV). | `null = NV` | `business-docs/wiki/shared/mvp-spec.md:84` |
| `wine-upsert-fills-blanks` | `wine_upsert` writes a field only where the stored value is null. | fill-only | `business-docs/wiki/shared/mvp-spec.md:177` |
| `wine-upsert-overwrite-flag` | A non-null field is replaced only when the caller passes `overwrite: true`. | `overwrite: true` | `business-docs/wiki/shared/mvp-spec.md:178` |
| `wine-upsert-target-by-id` | With `wine_id`, the upsert targets that row; without it, it matches on `(producer, name, vintage)`. | `wine_id` else match | `business-docs/wiki/shared/mvp-spec.md:175` |
| `wine-upsert-reports-change` | The result reports whether the row was created and which fields the call filled. | `created: bool`, `fields_filled: string[]` | `business-docs/wiki/shared/mvp-spec.md:180` |
| `wine-search-limit-default` | `wine_search` returns 10 results when `limit` is not given. | `10` | `business-docs/wiki/shared/mvp-spec.md:185` |
| `wine-search-limit-max` | `limit` is capped at 50. | `50` | `business-docs/wiki/shared/mvp-spec.md:185` |
| `wine-search-free-text-fields` | `query` is free text over name, producer, region and notes. | name/producer/region/notes | `business-docs/wiki/shared/mvp-spec.md:183` |
| `wine-search-per-caller-ownership` | Each search result carries an `owned` flag and a `quantity` for the calling user. | `owned`, `quantity` | `business-docs/wiki/shared/mvp-spec.md:186` |
| `wine-get-composition` | `wine_get` returns the wine, the caller's cellar holdings, the caller's reviews, and the aggregate rating across all users. | 4 parts | `business-docs/wiki/shared/mvp-spec.md:188` |
| `wine-server-takes-no-images` | The server accepts structured fields only; image upload or storage of any kind is out of scope. | none | `business-docs/wiki/shared/mvp-spec.md:44`, `business-docs/wiki/shared/mvp-spec.md:52` |
| `wine-survives-user-deletion` | Wines contributed by a deleted user stay in the shared catalogue. | retained | `business-docs/wiki/shared/mvp-spec.md:236` |
| `wine-read-permission` | `wine_search` and `wine_get` require `catalog:read` — held by admin, member and guest. | `catalog:read` | `business-docs/wiki/shared/mvp-spec.md:132` |
| `wine-write-permission` | `wine_upsert` requires `catalog:write` — admin and member only; a guest cannot write. | `catalog:write` | `business-docs/wiki/shared/mvp-spec.md:133` |
| `nv-identity-nulls-not-distinct` | The identity index is declared `NULLS NOT DISTINCT`, which is what makes it constrain non-vintage rows. Without it a null never equals a null and every NV upsert inserts again. | `UNIQUE (lower(producer), lower(name), vintage) NULLS NOT DISTINCT` | [ADR-0016](../../decisions/0016-nv-is-a-value-in-the-wine-identity-key.md) |
| `nv-lookup-is-not-distinct-from` | The natural-key lookup in the `wine_upsert` path uses `vintage IS NOT DISTINCT FROM`, never `=`. A plain `=` misses the NV row the index would refuse to duplicate, turning a merge into a constraint violation. | `IS NOT DISTINCT FROM` | [ADR-0016](../../decisions/0016-nv-is-a-value-in-the-wine-identity-key.md) |
| `search-is-tsvector-plus-trigram` | `wine_search` matches a stored generated `tsvector` over name, producer, region, subregion, country and tasting notes, weighted A–D, plus trigram indexes on `name` and `producer` for misspellings. | `ts_rank` + `similarity` | [ADR-0021](../../decisions/0021-wine-search-is-full-text-plus-trigram.md) |
| `search-is-always-parameterized` | Every value reaching SQL in `wine_search` is a bound parameter, including the optional structured filters. No branch builds SQL by string concatenation. | always | [ADR-0021](../../decisions/0021-wine-search-is-full-text-plus-trigram.md) |
| `search-config-is-simple` | The text search configuration is `simple`, not `english`, because the corpus is multilingual proper nouns that English stemming mangles. | `simple` | [ADR-0021](../../decisions/0021-wine-search-is-full-text-plus-trigram.md) |
| `catalog-string-bounds` | Catalogue strings are length-bounded at the column, `tasting_notes` most importantly — it is unbounded model-written text on a row every user reads. | 300 / 200 / 100 / 8000 | [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) |
| `text-arrays-are-not-null` | `grapes`, `style_tags` and `food_pairings` are `NOT NULL` defaulting to `'{}'`, so empty has one representation for the fill-blanks merge and for the engine's overlap tests. | `'{}'` | [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md), [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) |

Enums for `wine_type`, `sweetness`, `body`, `tannin`, `acidity` are shared: [[data-types]] (`business-docs/wiki/shared/mvp-spec.md:100`–`business-docs/wiki/shared/mvp-spec.md:103`).

## Not real yet

| What | Detail |
| --- | --- |
| The whole feature | No `src/` exists. The planned files — `src/tools/wine_*.ts`, `src/db/queries/wines.ts`, `src/db/schema.sql` — are named in the specification's directory sketch (`business-docs/wiki/shared/mvp-spec.md:367`) and nothing more. |
| The `wines` table | No migration exists. The column list at `business-docs/wiki/shared/mvp-spec.md:84`–`business-docs/wiki/shared/mvp-spec.md:88` has no types, no lengths, and no constraints besides the unique key. |
| Field-level provenance | Nothing records **which caller supplied which field** after a merge. `created_by` names only whoever created the row (`business-docs/wiki/shared/mvp-spec.md:87`). In a shared catalogue built up by many agents, "who claimed this region" is unanswerable by design-so-far. |
| Behaviour for an unknown `wine_id` | The specification never says what `wine_upsert`, `wine_get` or `cellar_add` do when `wine_id` names a row that does not exist. |
| Units and ranges | `abv` and `avg_price` have no stated unit, no range, and no currency (`business-docs/wiki/shared/mvp-spec.md:85`–`business-docs/wiki/shared/mvp-spec.md:86`). |
| String normalization | Matching is case-insensitive on `producer` and `name` only. Nothing is stated for `grapes`, `region`, `country` or `subregion`, which are matched as filters in `wine_search` (`business-docs/wiki/shared/mvp-spec.md:184`). |
| NV identity | `vintage` is null for non-vintage wines, and it is part of the uniqueness key. In Postgres a null never equals a null, so `UNIQUE (lower(producer), lower(name), vintage)` does **not** constrain NV rows at all, and a naive `vintage = $3` match finds no existing NV row. Nothing in the specification decides which behaviour is intended. See [[wine-catalog-validations]]. |
