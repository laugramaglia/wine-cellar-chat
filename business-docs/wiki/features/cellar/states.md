---
feature: cellar
page: states
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:90
  - business-docs/wiki/shared/mvp-spec.md:198
  - business-docs/wiki/shared/mvp-spec.md:299
updated: 2026-08-29
---

# Cellar — states

A cellar item carries two pieces of state that must be read together: `status` (`in_cellar | drunk | gifted`, `business-docs/wiki/shared/mvp-spec.md:92`) and `quantity` (`business-docs/wiki/shared/mvp-spec.md:90`). Neither alone decides whether the bottle is drinkable — the engine requires **both** `quantity > 0` **and** `status = in_cellar` (`business-docs/wiki/shared/mvp-spec.md:299`).

> **Unverified.** No implementation exists. The transitions below are read off `business-docs/wiki/shared/mvp-spec.md:198` and `business-docs/wiki/shared/mvp-spec.md:207`; guards marked *(undefined)* are gaps in the specification, not omissions here.

## State shape

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `id` | id | The cellar item | assigned |
| `user_id` | id | Owner. Never from tool input — from `props` (`business-docs/wiki/shared/mvp-spec.md:350`) | the caller |
| `wine_id` | id | The bottling owned ([[wine-catalog-index]]) | required |
| `quantity` | number | Bottles on hand | *(undefined — no default stated)* |
| `purchase_price` | number | What the user paid. No currency or unit stated | null |
| `purchase_date` | date | When bought; a `cellar_list` sort key | null |
| `location` | text | Free text, e.g. a rack or shelf | null |
| `drink_from` | date | Window opens | null |
| `drink_until` | date | Window closes; a `cellar_list` sort key, and what `drink_soon` measures | null |
| `status` | enum | `in_cellar \| drunk \| gifted` | `in_cellar` *(implied by `cellar_add`, never stated)* |
| `notes` | text | Free text | null |

### Derived values

| Derived | Definition | Source |
| --- | --- | --- |
| `drinkable` (engine eligibility) | `quantity > 0 AND status = 'in_cellar'` | `business-docs/wiki/shared/mvp-spec.md:299` |
| `ready_to_drink` | "now inside the drink window" | `business-docs/wiki/shared/mvp-spec.md:200` |
| `drink_soon` | "window closes within N months" | `business-docs/wiki/shared/mvp-spec.md:201` |
| `owned` / `quantity` on a wine | Reported by `wine_search` and `wine_get` for the caller | `business-docs/wiki/shared/mvp-spec.md:186`, `business-docs/wiki/shared/mvp-spec.md:188` |

Both `ready_to_drink` and `drink_soon` read fields that are nullable, and the specification never says what a null window means for either. Nor does it give a default `N`. See **Gaps** below.

## Transitions

| From | Event | To | Guard |
| --- | --- | --- | --- |
| *(none)* | `cellar_add` | `in_cellar`, `quantity = n` | Caller holds `cellar:write` (`business-docs/wiki/shared/mvp-spec.md:135`) |
| `in_cellar`, `quantity = n > 1` | `cellar_update` decrements | `in_cellar`, `quantity = n - 1` | Bottles remain after the decrement |
| `in_cellar`, `quantity = n > 1` | `review_write` with `consume: true` | `in_cellar`, `quantity = n - 1` | Same decrement, triggered from [[reviews-index]] (`business-docs/wiki/shared/mvp-spec.md:207`) |
| `in_cellar`, `quantity = 1` | decrement, by either route | **`drunk`**, `quantity = 0` | **The last-bottle rule: "Drinking the last bottle sets `status = drunk` automatically" (`business-docs/wiki/shared/mvp-spec.md:198`)** |
| `in_cellar` | `cellar_update` with `status: drunk` | `drunk` | Explicit. Effect on `quantity` *(undefined)* |
| `in_cellar` | `cellar_update` with `status: gifted` | `gifted` | Explicit. Whether some or all bottles *(undefined)* |
| `in_cellar` | `cellar_update` changes quantity / location / drink window | `in_cellar` | Non-status edits do not move the state (`business-docs/wiki/shared/mvp-spec.md:197`) |
| `in_cellar`, `quantity = n` | `cellar_update` increments | `in_cellar`, `quantity = n + k` | Nothing forbids topping a row up rather than adding a second row *(undefined which is intended)* |
| `drunk` | `cellar_update` | *(undefined)* | No rule permits or forbids resurrecting a drunk item |
| `gifted` | `cellar_update` | *(undefined)* | Same |
| any | `user_delete` with `hard: true` | row deleted | Admin only; soft delete leaves cellar items in place (`business-docs/wiki/shared/mvp-spec.md:235`) |

### The last-bottle rule, precisely

The automatic transition has three parts, and all three are load-bearing:

1. It fires on a **decrement**, not on an edit that happens to set `quantity = 0`. The specification says *drinking* the last bottle (`business-docs/wiki/shared/mvp-spec.md:198`); whether writing `quantity: 0` directly also fires it is undefined.
2. It sets `drunk`, never `gifted`. Giving bottles away is always explicit.
3. It fires from **either** decrement route — `cellar_update` or `review_write` with `consume: true` — or the invariant would depend on which tool the agent happened to call. The specification states it only under `cellar_update`; that `review_write` shares it is an inference, and is recorded as a gap.

The engine's guard (`business-docs/wiki/shared/mvp-spec.md:299`) is redundant with a correct implementation of this rule — `quantity > 0` and `status = in_cellar` should not be separable after a decrement. It is stated as two conditions anyway, and both must be checked: an item can legitimately be `gifted` with `quantity > 0` (bottles given away without being drunk), and `drunk` with `quantity = 0`.

## Resolution order

Nothing in the specification resolves cellar status through an if/else chain — `status` is stored, not computed. The two computed predicates have no stated resolution order at all:

| Predicate | Inputs | Order / fallback |
| --- | --- | --- |
| `ready_to_drink` | `drink_from`, `drink_until`, now | *(undefined)* — behaviour on either null unstated |
| `drink_soon` | `drink_until`, now, `N` | *(undefined)* — no default `N`; behaviour on null `drink_until` unstated |
| engine eligibility | `quantity`, `status` | Conjunction, both required (`business-docs/wiki/shared/mvp-spec.md:299`) |

The engine's drink-window urgency component (weight 0.05, cellar only, `business-docs/wiki/shared/mvp-spec.md:313`) reads the same window, and consistency between it and `drink_soon` is not specified. That component is owned by [[recommendation-engine-index]].

## Lifetime

A `cellar_items` row is durable Postgres state (`business-docs/wiki/shared/mvp-spec.md:42`), not session state. It outlives every connection and every client: two tokens for the same user from two different clients see **one** cellar (`business-docs/wiki/shared/mvp-spec.md:416`). Nothing about it lives in the Durable Object — `McpAgent` holds the request's `props`, not the data (`business-docs/wiki/shared/mvp-spec.md:347`).

The row survives a soft `user_delete`; only `hard: true` drops it (`business-docs/wiki/shared/mvp-spec.md:235`). Wines the user contributed always stay in the shared catalogue (`business-docs/wiki/shared/mvp-spec.md:236`), so deleting a cellar never removes a bottling from [[wine-catalog-index]].

No caching, no snapshot, and no history table is specified. A decremented quantity is unrecoverable.

## Gaps

| Gap | Consequence |
| --- | --- |
| `cellar_update` driving `quantity` below zero is undefined | Clamp, reject, or store negative — and a negative quantity would still pass no stated guard |
| No default `N` for `drink_soon` | Callers that omit it get unspecified behaviour |
| `ready_to_drink` with null `drink_from` / `drink_until` | Both are optional; the filter's meaning for a bottle with no window is unstated |
| Whether `drunk` or `gifted` is terminal | No un-drink path described, none forbidden |
| Gifting a subset of bottles | `status` is per row, so partial gifting needs either a decrement or a row split; neither is specified |
| Whether the last-bottle rule applies to the `review_write` decrement | Stated only under `cellar_update` (`business-docs/wiki/shared/mvp-spec.md:198`) |
| Whether `status: drunk` set explicitly also zeroes `quantity` | Would otherwise leave `drunk` with stock on hand |
| No stated default for `status` on insert | `in_cellar` is implied by `cellar_add` but never written down |
| `drink_from <= drink_until` is not required anywhere | An inverted window makes both predicates meaningless |

All are recorded in [[divergences]].
