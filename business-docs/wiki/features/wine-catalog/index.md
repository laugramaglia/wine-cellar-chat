---
feature: wine-catalog
page: index
status: stub
source_of_truth: wiki
code_refs:
  - README.md:70
  - README.md:158
updated: 2026-08-29
---

# Wine catalogue

The catalogue is the shared list of **bottlings** — *Catena Malbec 2019* — that every user of the server sees (`README.md:47`). It is not ownership: how many bottles you have is a cellar item, and the two are deliberately separate entities ([ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md)). The catalogue starts when an agent calls `wine_upsert` with whatever it read off a label, and it never ends: a wine is filled in over time, call by call, by whoever knows more.

> **Nothing here is implemented.** The only source in this repository is `README.md`, a specification for a Cloudflare Workers MCP server that has not been written. Every rule below is a claim the specification makes, not a behaviour observed in a running program. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | The MCP tools `wine_upsert`, `wine_search`, `wine_get` (`README.md:158`–`README.md:175`), called by a connected MCP client over `/mcp` |
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
| `wine-identity-key` | A bottling is identified by producer, name and vintage, case-insensitively on the two strings. | `UNIQUE (lower(producer), lower(name), vintage)` | `README.md:74` |
| `wine-name-required` | `name` is the only required field on a wine. Everything else is optional. | `name` | `README.md:91` |
| `wine-catalogue-is-shared` | One catalogue, visible and writable by every user. It is not per-account. | shared | `README.md:47` |
| `wine-vintage-nullable` | `vintage` is nullable; null means non-vintage (NV). | `null = NV` | `README.md:70` |
| `wine-upsert-fills-blanks` | `wine_upsert` writes a field only where the stored value is null. | fill-only | `README.md:163` |
| `wine-upsert-overwrite-flag` | A non-null field is replaced only when the caller passes `overwrite: true`. | `overwrite: true` | `README.md:164` |
| `wine-upsert-target-by-id` | With `wine_id`, the upsert targets that row; without it, it matches on `(producer, name, vintage)`. | `wine_id` else match | `README.md:161` |
| `wine-upsert-reports-change` | The result reports whether the row was created and which fields the call filled. | `created: bool`, `fields_filled: string[]` | `README.md:166` |
| `wine-search-limit-default` | `wine_search` returns 10 results when `limit` is not given. | `10` | `README.md:171` |
| `wine-search-limit-max` | `limit` is capped at 50. | `50` | `README.md:171` |
| `wine-search-free-text-fields` | `query` is free text over name, producer, region and notes. | name/producer/region/notes | `README.md:169` |
| `wine-search-per-caller-ownership` | Each search result carries an `owned` flag and a `quantity` for the calling user. | `owned`, `quantity` | `README.md:172` |
| `wine-get-composition` | `wine_get` returns the wine, the caller's cellar holdings, the caller's reviews, and the aggregate rating across all users. | 4 parts | `README.md:174` |
| `wine-server-takes-no-images` | The server accepts structured fields only; image upload or storage of any kind is out of scope. | none | `README.md:30`, `README.md:38` |
| `wine-survives-user-deletion` | Wines contributed by a deleted user stay in the shared catalogue. | retained | `README.md:222` |
| `wine-read-permission` | `wine_search` and `wine_get` require `catalog:read` — held by admin, member and guest. | `catalog:read` | `README.md:118` |
| `wine-write-permission` | `wine_upsert` requires `catalog:write` — admin and member only; a guest cannot write. | `catalog:write` | `README.md:119` |

Enums for `wine_type`, `sweetness`, `body`, `tannin`, `acidity` are shared: [[data-types]] (`README.md:86`–`README.md:89`).

## Not real yet

| What | Detail |
| --- | --- |
| The whole feature | No `src/` exists. The planned files — `src/tools/wine_*.ts`, `src/db/queries/wines.ts`, `src/db/schema.sql` — are named in the specification's directory sketch (`README.md:353`) and nothing more. |
| The `wines` table | No migration exists. The column list at `README.md:70`–`README.md:74` has no types, no lengths, and no constraints besides the unique key. |
| Field-level provenance | Nothing records **which caller supplied which field** after a merge. `created_by` names only whoever created the row (`README.md:73`). In a shared catalogue built up by many agents, "who claimed this region" is unanswerable by design-so-far. |
| Behaviour for an unknown `wine_id` | The specification never says what `wine_upsert`, `wine_get` or `cellar_add` do when `wine_id` names a row that does not exist. |
| Units and ranges | `abv` and `avg_price` have no stated unit, no range, and no currency (`README.md:71`–`README.md:72`). |
| String normalization | Matching is case-insensitive on `producer` and `name` only. Nothing is stated for `grapes`, `region`, `country` or `subregion`, which are matched as filters in `wine_search` (`README.md:170`). |
| NV identity | `vintage` is null for non-vintage wines, and it is part of the uniqueness key. In Postgres a null never equals a null, so `UNIQUE (lower(producer), lower(name), vintage)` does **not** constrain NV rows at all, and a naive `vintage = $3` match finds no existing NV row. Nothing in the specification decides which behaviour is intended. See [[wine-catalog-validations]]. |
