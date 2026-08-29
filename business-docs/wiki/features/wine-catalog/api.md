---
feature: wine-catalog
page: api
status: stub
source_of_truth: wiki
code_refs:
  - README.md:158
  - README.md:118
updated: 2026-08-29
---

# Wine catalogue — API

**There is no OpenAPI document, by decision** ([ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md)). The surface is not REST: one endpoint, `POST /mcp`, carrying JSON-RPC, with every operation expressed as an MCP tool call ([[mcp-protocol]]). The schemas therefore live here.

| Tool | Permission | Planned handler | Called from |
| --- | --- | --- | --- |
| `wine_upsert` | `catalog:write` (`README.md:119`) | `src/tools/` — one file per tool, zod schema plus handler (`README.md:363`) | The client after label extraction; `cellar_add` with inline wine fields (`README.md:179`) |
| `wine_search` | `catalog:read` (`README.md:118`) | same | The client; the engine reads the catalogue directly, not through this tool |
| `wine_get` | `catalog:read` (`README.md:118`) | same | The client, after a search |

`catalog:read` is held by `admin`, `member` and `guest`. `catalog:write` is held by `admin` and `member` only (`README.md:118`–`README.md:119`). See [[authorization-index]].

## `wine_upsert`

**Input** — all `wines` fields (`README.md:70`–`README.md:73`), plus:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | **yes** | The only required field (`README.md:161`) |
| `producer`, `vintage`, `country`, `region`, `subregion`, `wine_type`, `grapes`, `abv`, `sweetness`, `body`, `tannin`, `acidity`, `avg_price`, `style_tags`, `food_pairings`, `tasting_notes` | see [[wine-catalog-states]] | no | Column values |
| `wine_id` | id | no | Target an existing row directly; skips matching (`README.md:161`) |
| `overwrite` | bool | no | Replace non-null values. Absent means false (`README.md:164`) |

**Output**

| Field | Type | Meaning |
| --- | --- | --- |
| *(the wine)* | full `wines` row | Post-write state (`README.md:166`) |
| `created` | bool | The row was inserted by this call |
| `fields_filled` | `string[]` | Columns this call actually wrote |

## `wine_search`

**Input** (`README.md:168`–`README.md:171`)

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `query` | string | — | Free text over `name`, `producer`, `region`, `tasting_notes` |
| `wine_type`, `country`, `region`, `grapes` | filters | — | Structured filters |
| `vintage_min`, `vintage_max` | integer | — | Range on `vintage` |
| `price_min`, `price_max` | number | — | Range on `avg_price` |
| `owned_only` | bool | — | Restrict to wines the caller holds |
| `limit` | integer | **10**, max **50** | Result cap |

**Output** — matching wine rows, each annotated `owned` and `quantity` (`README.md:172`).

## `wine_get`

**Input** — one wine id.

**Output**, four parts (`README.md:174`–`README.md:175`):

| Part | Scope | Owned by |
| --- | --- | --- |
| The wine row | Global | this feature |
| The caller's cellar holdings | **Per caller** | [[cellar-index]] |
| The caller's reviews | **Per caller** | [[reviews-index]] |
| Aggregate rating | **Across all users** | [[reviews-index]] |

## Request rules that matter here

| Rule | Expression |
| --- | --- |
| `limit` default and cap | `default 10, max 50` (`README.md:171`). Whether over-max clamps or rejects is not stated |
| Row targeting | `wine_id` if given, else match `(producer, name, vintage)` (`README.md:161`–`README.md:162`) |
| Merge | Fill nulls only, unless `overwrite: true` (`README.md:163`–`README.md:164`) |
| No `user_id` parameter | Apart from the `admin:*` tools, no tool takes one. The caller comes from `props`, never from input (`README.md:154`, `README.md:336`) — you cannot read or write another account's data whatever your role |
| No images | Structured fields only. There is no image parameter on any tool (`README.md:30`, `README.md:38`) |

## Response rules that matter here

| Field | What it really means |
| --- | --- |
| `owned`, `quantity` | **Computed per caller** against the caller's cellar, over a row that is shared by everyone (`README.md:172`). The same wine returns a different `owned` to a different token. Two tokens belonging to the same *user* return the same value — one identity, one cellar (`README.md:402`) |
| aggregate rating in `wine_get` | The one **global** derived value in this feature's responses (`README.md:175`). A single `wine_get` result therefore mixes per-caller and all-user data; an agent summarising it must not confuse the two |
| `fields_filled` | Names what was written, never what was refused. A value dropped because the column was already non-null is invisible in the response — see [[wine-catalog-errors]] |
| `created_by` | The row's creator, not the author of any particular field. There is no field-level provenance |
| Nothing is stripped | No field is documented as hidden from a response. The catalogue is shared and fully readable by every role, guests included |

## Planned

Everything on this page. No handler, no schema, and no `src/` directory exist; the file layout at `README.md:353` is a sketch. Post-MVP additions that would touch this feature: an `enrich_wine` tool against an external API, and pgvector-backed "wines like this one" search (`README.md:420`–`README.md:424`). Neither is specified beyond its name.
