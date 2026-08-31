---
feature: wine-catalog
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:105
  - business-docs/wiki/shared/mvp-spec.md:175
updated: 2026-08-29
---

# Wine catalogue — validations

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| `name` | Required on `wine_upsert`. The only required field on a wine (`business-docs/wiki/shared/mvp-spec.md:105`, `business-docs/wiki/shared/mvp-spec.md:175`) | Planned: the tool's zod input schema (`business-docs/wiki/shared/mvp-spec.md:377`) | Not specified |
| every other wine field | Optional. A wine may be nothing but `{ name, producer }` (`business-docs/wiki/shared/mvp-spec.md:106`, `business-docs/wiki/shared/mvp-spec.md:422`) | — | — |
| `wine_type` | One of `red \| white \| rose \| sparkling \| orange \| dessert \| fortified` (`business-docs/wiki/shared/mvp-spec.md:100`) | Not stated — schema, database, or neither | Not specified |
| `sweetness` | One of `bone_dry \| dry \| off_dry \| medium_sweet \| sweet` (`business-docs/wiki/shared/mvp-spec.md:101`) | Not stated | Not specified |
| `body`, `tannin`, `acidity` | One of `low \| medium_minus \| medium \| medium_plus \| high` (`business-docs/wiki/shared/mvp-spec.md:102`) | Not stated | Not specified |
| `tannin` | Null is meaningful — "not applicable", true of most whites (`business-docs/wiki/shared/mvp-spec.md:103`) | — | — |
| `vintage` | Nullable. Null means NV (`business-docs/wiki/shared/mvp-spec.md:84`). No minimum or maximum year is stated | Not stated | Not specified |
| `limit` on `wine_search` | Default 10, maximum 50 (`business-docs/wiki/shared/mvp-spec.md:185`) | Planned: the tool's input schema. Whether an over-max value is clamped or rejected is **not stated** | Not specified |
| `overwrite` on `wine_upsert` | Boolean. Absent means false — fill blanks only (`business-docs/wiki/shared/mvp-spec.md:177`) | — | — |
| identity | `(lower(producer), lower(name), vintage)` must be unique (`business-docs/wiki/shared/mvp-spec.md:88`) | The database, as a unique index | Not specified |
| caller identity | Never taken from tool input. Resolved from the bearer token in `props` (`business-docs/wiki/shared/mvp-spec.md:350`) | The auth middleware — structural, not a validation ([[authentication-index]]) | `401` |

## Client vs server

"Client" here is the MCP client's own tool-schema conformance; "server" is the handler.

| Rule | Client | Server |
| --- | --- | --- |
| `name` required | Yes — the tool's JSON schema is published in `tools/list`, so a well-behaved client enforces it | Intended, via zod (`business-docs/wiki/shared/mvp-spec.md:377`). Not verifiable; no code exists |
| Enum membership | Yes, if the schema publishes the enums | Not stated |
| `limit` ≤ 50 | Yes, if the schema publishes the bound | Not stated |
| Permission | The tool is hidden from `tools/list` (`business-docs/wiki/shared/mvp-spec.md:146`) | **Re-checked in every handler. This is the security boundary; visibility is only a UX affordance** (`business-docs/wiki/shared/mvp-spec.md:149`–`business-docs/wiki/shared/mvp-spec.md:151`) |
| Uniqueness | No | The database |

A schema published to the client is a hint, not a defence: any HTTP client can post whatever it likes to `/mcp`. See [[security]].

## Not validated

Real gaps. Each is a place where an input reaches the system unchecked, or where the specification does not say whether it is checked.

| Gap | Why it matters |
| --- | --- |
| `wine_search.query` is free text over name, producer, region and notes (`business-docs/wiki/shared/mvp-spec.md:183`). **Nothing states that it is parameterized**, and nothing states how it is turned into SQL | A free-text search string concatenated into a query against a shared Postgres database is the highest-value injection surface in this server. Whatever the answer is, it must be written down. See [[security]] |
| `abv` has no stated unit, range or precision | `13.5` and `13.5%` and `135` are all accepted by "a number". A shared catalogue will accumulate all three |
| `avg_price` has no stated currency or range | `price_min/max` in `wine_search` (`business-docs/wiki/shared/mvp-spec.md:185`) and the budget component in the engine both compare it against user numbers. Comparing across currencies silently produces wrong filtering |
| No normalization is stated for `grapes`, `region`, `country`, `subregion` | The uniqueness key lowercases `producer` and `name` (`business-docs/wiki/shared/mvp-spec.md:88`), which shows normalization was considered — but `wine_search` filters on `region` and `grapes` (`business-docs/wiki/shared/mvp-spec.md:184`), and `Mendoza`, `mendoza` and `MENDOZA` will not match each other unless something says they do |
| No behaviour when `wine_id` names a nonexistent row | `wine_upsert`, `wine_get`, and `cellar_add` (`business-docs/wiki/shared/mvp-spec.md:193`) all take one. Insert-under-a-given-id, error, and silent no-op are all plausible and materially different |
| No length bound on any string, notably `tasting_notes` | An unbounded text column written by an agent, on a shared row |
| NV identity is undecided | `vintage` is null for NV and participates in the unique key. In Postgres a null is never equal to a null, so the constraint does **not** stop duplicate NV rows, and an upsert matching with `vintage = $3` will never find one — every NV call inserts again. Making it work needs either `NULLS NOT DISTINCT`, a sentinel vintage, or `IS NOT DISTINCT FROM` in the match. The specification chooses none of these |

Every row above is a specification gap, not a code defect — there is no code. They belong in [[divergences]] and should be closed by a decision before the table is migrated.
