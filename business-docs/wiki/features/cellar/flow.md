---
feature: cellar
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:193
  - business-docs/wiki/shared/mvp-spec.md:418
updated: 2026-08-29
---

# Cellar — flow

> **Unverified.** Traced to [[mvp-spec]] only; no implementation exists.

## Happy path — bottles in

The intended end-to-end path is *photo → agent extracts fields → `wine_upsert` → `cellar_add`* (`business-docs/wiki/shared/mvp-spec.md:418`).

1. The user photographs a label and asks their agent to store it. Vision runs **client-side**; the server never sees the image ([ADR-0009](../../decisions/0009-vision-happens-client-side.md), `business-docs/wiki/shared/mvp-spec.md:25`).
2. The agent calls `wine_upsert` with whatever fields it read. Only `name` is required (`business-docs/wiki/shared/mvp-spec.md:105`). The wine now exists in the shared catalogue — see [[wine-catalog-index]].
3. The agent calls `cellar_add` with `wine_id`, `quantity`, and optionally `purchase_price`, `purchase_date`, `location`, `drink_from`, `drink_until` (`business-docs/wiki/shared/mvp-spec.md:193`–`195`).
4. A `cellar_items` row exists for **the calling user**, resolved from `props`, never from tool input (`business-docs/wiki/shared/mvp-spec.md:350`).
5. Later, `cellar_list` returns that user's cellar, optionally filtered and sorted (`business-docs/wiki/shared/mvp-spec.md:200`–`202`).
6. When a bottle is drunk, `cellar_update` decrements `quantity` — or `review_write` with `consume: true` does it as a side effect of recording the tasting (`business-docs/wiki/shared/mvp-spec.md:207`). Emptying the cellar of that wine sets `status = drunk` automatically (`business-docs/wiki/shared/mvp-spec.md:198`). Full table in [[cellar-states]].

## Short path — `cellar_add` with inline wine fields

`cellar_add` takes `wine_id` **or inline wine fields, which upsert first** (`business-docs/wiki/shared/mvp-spec.md:193`). Steps 2 and 3 collapse into one call, and the ordering is fixed:

1. The inline wine fields are upserted, under `wine_upsert` merge semantics — fill blanks, never clobber ([ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md)). Match is on `(producer, name, vintage)` when no `wine_id` is given (`business-docs/wiki/shared/mvp-spec.md:176`).
2. The resulting wine id is used for the new `cellar_items` row.

This is a **cross-feature write**: a `cellar:write` call mutates the shared catalogue that [[wine-catalog-index]] owns. See [[cellar-related]].

> **Unverified.** The specification does not say whether this upsert is transactional with the insert, what the tool returns about it (`wine_upsert` returns `created` and `fields_filled`, `business-docs/wiki/shared/mvp-spec.md:180` — whether `cellar_add` echoes them is unstated), or whether `cellar:write` alone suffices when the call effectively performs a `catalog:write`.

## Preconditions

| Precondition | Source |
| --- | --- |
| A valid, unexpired, unrevoked bearer token whose user is `active`. | `business-docs/wiki/shared/mvp-spec.md:343`–`345` |
| The caller holds `cellar:write` (add/update) or `cellar:read` (list) — `admin` or `member`, never `guest`. | `business-docs/wiki/shared/mvp-spec.md:134`–`135`, `business-docs/wiki/shared/mvp-spec.md:122` |
| For `cellar_add` by id: the wine exists. For inline fields: `name` is present. | `business-docs/wiki/shared/mvp-spec.md:175` |

## Postconditions

| After | State |
| --- | --- |
| `cellar_add` | One `cellar_items` row owned by the caller; possibly a created or field-filled `wines` row. |
| `cellar_update` | Quantity / location / drink window changed, or `status` set to `drunk` or `gifted`; possibly an automatic `drunk`. |
| `cellar_list` | Nothing persisted. |

Nothing in the specification describes a consumption history: once `quantity` is decremented, the previous value is gone. Drinking stats are named as post-MVP work (`business-docs/wiki/shared/mvp-spec.md:437`). A `review_write` with `consume: true` leaves the review as the only durable trace of that bottle.

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Add by `wine_id` | The agent already knows the wine | Row inserted, catalogue untouched |
| Add with inline fields | The wine may not exist yet | Upsert first, then insert (ordering above) |
| Decrement to zero | Last bottle drunk | `status = drunk` set automatically (`business-docs/wiki/shared/mvp-spec.md:198`) |
| Mark gifted | Caller passes `status: gifted` | Item leaves the engine's `source: "cellar"` pool (`business-docs/wiki/shared/mvp-spec.md:299`) |
| Consume via review | `review_write` with `consume: true` | Cellar decremented from another feature — [[reviews-index]] |

## Timing and automatic behaviour

| Automatic behaviour | Trigger | Source |
| --- | --- | --- |
| `status = drunk` | Drinking the last bottle | `business-docs/wiki/shared/mvp-spec.md:198` |
| Cellar decrement | `review_write` with `consume: true` | `business-docs/wiki/shared/mvp-spec.md:207` |
| Cellar items dropped | `user_delete` with `hard: true` | `business-docs/wiki/shared/mvp-spec.md:235` |

No timers, retries, or background jobs are specified. Nothing ages an item out of its drink window; `ready_to_drink` and `drink_soon` are evaluated at query time (`business-docs/wiki/shared/mvp-spec.md:200`–`201`).

## What is deliberately not here

| Absent | Why |
| --- | --- |
| Image upload or storage | Out of scope for the MVP; vision is client-side ([ADR-0009](../../decisions/0009-vision-happens-client-side.md), `business-docs/wiki/shared/mvp-spec.md:52`) |
| Any screen | The MCP client is the UI (`business-docs/wiki/shared/mvp-spec.md:53`) — see [[cellar-screens]] |
| Price lookup / enrichment of what a bottle is worth | No external wine APIs (`business-docs/wiki/shared/mvp-spec.md:51`); `purchase_price` is whatever the caller says |
| Sharing a cellar between users | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:437`) |
| Consumption history | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:437`) |
