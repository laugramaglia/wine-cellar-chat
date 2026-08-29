---
page: data-types
status: stub
updated: 2026-08-29
code_refs:
  - README.md:84
---

# Shared data types

Closed enumerations and shared shapes that cross feature boundaries. All enum values are **lowercase strings** on the wire and in the database.

Source: `README.md:84-90` (enums), `README.md:54-82` (tables).

## Enumerations

| Type | Values | Used by |
| --- | --- | --- |
| `wine_type` | `red`, `white`, `rose`, `sparkling`, `orange`, `dessert`, `fortified` | [[wine-catalog-index]], [[recommendation-engine-index]] |
| `sweetness` | `bone_dry`, `dry`, `off_dry`, `medium_sweet`, `sweet` | [[wine-catalog-index]], [[preferences-index]] |
| `body` | `low`, `medium_minus`, `medium`, `medium_plus`, `high` | [[wine-catalog-index]], [[preferences-index]] |
| `tannin` | `low`, `medium_minus`, `medium`, `medium_plus`, `high` | [[wine-catalog-index]], [[preferences-index]] |
| `acidity` | `low`, `medium_minus`, `medium`, `medium_plus`, `high` | [[wine-catalog-index]], [[preferences-index]] |
| `user.role` | `admin`, `member`, `guest` | [[authorization-index]], [[user-administration-index]] |
| `user.status` | `active`, `suspended` — plus an undocumented `deleted`, see [[divergences]] | [[authentication-index]], [[user-administration-index]] |
| `cellar_item.status` | `in_cellar`, `drunk`, `gifted` | [[cellar-index]] |
| `recommend.source` | `cellar`, `catalog`, `both` | [[recommendation-engine-index]] |

`body`, `tannin` and `acidity` share one 5-point scale, which is what lets the engine measure palate fit as a distance along it.

## Nullability

`tannin` is `null` for most whites — an absent value, not a `low` one. The engine treats a missing component by dropping it and renormalizing the remaining weights, so `null` must never be coerced to a scale position.

**Every field of a wine except `name` is optional** (`README.md:91`). A wine created from a blurry photo may be nothing but `{ name, producer }`, and it must still be storable, findable, and recommendable.

## Shared shapes

| Shape | Fields | Notes |
| --- | --- | --- |
| `prefs.likes` / `prefs.dislikes` | `{ grapes: [], regions: [], styles: [] }` (jsonb) | [[preferences-index]] |
| `prefs.avoid` | jsonb list — allergens, "no oak", "no sulfites added" | a hard filter, not a soft preference |
| `wines.grapes` | `text[]` | lowercase, matched case-insensitively |
| `wines.style_tags` / `food_pairings` | `text[]` | `food_pairings` feeds the 0.30 pairing component |

## Identity and uniqueness

- `wines`: `UNIQUE (lower(producer), lower(name), vintage)` — the natural key `wine_upsert` matches on when no `wine_id` is given.
- `user_prefs`: `user_id` is the primary key — exactly one profile per user, which is what makes it follow them across clients.

## Open questions

- The scale positions are ordered, but no page yet states the numeric distance between adjacent steps that "palate fit" uses. Needed before the engine is implemented.
- `rating` is `1-100`; no page states whether the bound is enforced in the tool schema, the database, or both.
