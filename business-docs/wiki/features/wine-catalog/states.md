---
feature: wine-catalog
page: states
status: stub
source_of_truth: wiki
code_refs:
  - README.md:70
  - README.md:84
updated: 2026-08-29
---

# Wine catalogue — states

There is no client-side state machine here — the server is stateless per request ([[mcp-protocol]]). The state this feature owns is the **`wines` row**: what its columns mean, and how a row moves from "barely known" to "described".

## State shape — the `wines` row

Every column except `name` is nullable (`README.md:91`). Column list from `README.md:70`–`README.md:73`.

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `id` | identifier | Primary key, referenced by `cellar_items.wine_id` and `reviews.wine_id` | assigned |
| `name` | string | The bottling name. **The only required field.** | — |
| `producer` | string | The winery. Part of the identity key, matched case-insensitively | null |
| `vintage` | integer, nullable | Year. **Null means non-vintage (NV)** (`README.md:70`) | null |
| `country` | string | | null |
| `region` | string | Filterable in `wine_search`; part of the free-text `query` surface | null |
| `subregion` | string | | null |
| `wine_type` | enum | `red \| white \| rose \| sparkling \| orange \| dessert \| fortified` (`README.md:86`) | null |
| `grapes` | `text[]` | Filterable in `wine_search`; a soft preference in the engine | null |
| `abv` | number | Alcohol by volume. **No unit, range or precision is stated.** | null |
| `sweetness` | enum | `bone_dry \| dry \| off_dry \| medium_sweet \| sweet` (`README.md:87`) | null |
| `body` | enum | `low \| medium_minus \| medium \| medium_plus \| high` (`README.md:88`) | null |
| `tannin` | enum | Same 5-point scale. **Null for most whites** (`README.md:89`) — meaning "not applicable", not "unknown" | null |
| `acidity` | enum | Same 5-point scale | null |
| `avg_price` | number | **No currency and no range is stated.** Filtered by `price_min/max` in search and by budget in the engine | null |
| `style_tags` | `text[]` | | null |
| `food_pairings` | `text[]` | Read by the engine's 0.30-weight pairing component | null |
| `tasting_notes` | text | Part of the free-text `query` surface (`README.md:169`). Not a review — see [[reviews-index]] | null |
| `created_by` | user id | **Who created the row.** Not who supplied any later field | set on insert |
| `created_at` | timestamp | | set on insert |
| `updated_at` | timestamp | | set on write |

Shared enum definitions: [[data-types]]. Terminology: [[glossary]].

### Derived, per caller — not columns

These appear in tool results but are not stored on the row. They are computed against the **calling** user, so the same shared row reads differently for two callers.

| Value | Meaning | Where |
| --- | --- | --- |
| `owned` | The caller has this wine in their cellar | `README.md:172` |
| `quantity` | How many bottles the caller holds | `README.md:172` |
| aggregate rating | Average rating **across all users** — the one global derived value | `README.md:175` |

## Transitions

| From | Event | To | Guard |
| --- | --- | --- | --- |
| (absent) | `wine_upsert` with no matching row | Sparse row: `name` plus whatever was supplied | Caller holds `catalog:write` |
| Sparse | `wine_upsert` supplying a value for a null column | Fuller row; that column named in `fields_filled` | Column is null, **or** `overwrite: true` |
| Any | `wine_upsert` supplying a value for a non-null column | Unchanged | `overwrite` absent or false — [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) |
| Any | `wine_upsert` with `overwrite: true` | Value replaced | Caller holds `catalog:write` |
| Any | Creating user is deleted, even with `hard: true` | Unchanged, still in the catalogue | `README.md:222` |
| Any | — | (no deleted state) | No tool removes or merges a wine |

## Resolution order

For a single field in a `wine_upsert` call, in this order (`README.md:163`–`README.md:164`):

1. The field is absent from the input → the stored value stands. Absent is never "set to null".
2. `overwrite: true` → the supplied value is written.
3. The stored value is null → the supplied value is written, and the field name is appended to `fields_filled`.
4. Otherwise → the supplied value is discarded silently. This is the common case and it produces **no error and no warning** — see [[wine-catalog-errors]].

For targeting a row (`README.md:161`–`README.md:162`):

1. `wine_id` given → that row, and no matching is attempted.
2. Otherwise → match `(producer, name, vintage)`, with `lower()` applied to producer and name per the unique key (`README.md:74`).
3. No match → insert.

> **Unverified.** Step 4's silence is inferred from the absence of any stated error, not from a stated rule. The specification says what is written; it never says what the caller is told about what was refused, beyond `fields_filled` implying it by omission.

## Lifetime

A wine row is permanent. There is no soft-delete, no archive, no expiry, and no merge of duplicate rows. It is created by one user and thereafter edited by any user with `catalog:write` — the catalogue is shared (`README.md:47`) — and it survives the deletion of its creator (`README.md:222`).

The engine's "missing data never penalizes" rule ([ADR-0006](../../decisions/0006-missing-data-never-penalizes.md)) is what makes a sparse row usable rather than a second-class one: an unknown component is dropped and the remaining weights renormalized (`README.md:305`), so a `{ name, producer }` wine can still be recommended (`README.md:408`).
