---
feature: cellar
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - README.md:179
  - README.md:404
updated: 2026-08-29
---

# Cellar — flow

> **Unverified.** Traced to `README.md` only; no implementation exists.

## Happy path — bottles in

The intended end-to-end path is *photo → agent extracts fields → `wine_upsert` → `cellar_add`* (`README.md:404`).

1. The user photographs a label and asks their agent to store it. Vision runs **client-side**; the server never sees the image ([ADR-0009](../../decisions/0009-vision-happens-client-side.md), `README.md:11`).
2. The agent calls `wine_upsert` with whatever fields it read. Only `name` is required (`README.md:91`). The wine now exists in the shared catalogue — see [[wine-catalog-index]].
3. The agent calls `cellar_add` with `wine_id`, `quantity`, and optionally `purchase_price`, `purchase_date`, `location`, `drink_from`, `drink_until` (`README.md:179`–`181`).
4. A `cellar_items` row exists for **the calling user**, resolved from `props`, never from tool input (`README.md:336`).
5. Later, `cellar_list` returns that user's cellar, optionally filtered and sorted (`README.md:186`–`188`).
6. When a bottle is drunk, `cellar_update` decrements `quantity` — or `review_write` with `consume: true` does it as a side effect of recording the tasting (`README.md:193`). Emptying the cellar of that wine sets `status = drunk` automatically (`README.md:184`). Full table in [[cellar-states]].

## Short path — `cellar_add` with inline wine fields

`cellar_add` takes `wine_id` **or inline wine fields, which upsert first** (`README.md:179`). Steps 2 and 3 collapse into one call, and the ordering is fixed:

1. The inline wine fields are upserted, under `wine_upsert` merge semantics — fill blanks, never clobber ([ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md)). Match is on `(producer, name, vintage)` when no `wine_id` is given (`README.md:162`).
2. The resulting wine id is used for the new `cellar_items` row.

This is a **cross-feature write**: a `cellar:write` call mutates the shared catalogue that [[wine-catalog-index]] owns. See [[cellar-related]].

> **Unverified.** The specification does not say whether this upsert is transactional with the insert, what the tool returns about it (`wine_upsert` returns `created` and `fields_filled`, `README.md:166` — whether `cellar_add` echoes them is unstated), or whether `cellar:write` alone suffices when the call effectively performs a `catalog:write`.

## Preconditions

| Precondition | Source |
| --- | --- |
| A valid, unexpired, unrevoked bearer token whose user is `active`. | `README.md:329`–`331` |
| The caller holds `cellar:write` (add/update) or `cellar:read` (list) — `admin` or `member`, never `guest`. | `README.md:120`–`121`, `README.md:108` |
| For `cellar_add` by id: the wine exists. For inline fields: `name` is present. | `README.md:161` |

## Postconditions

| After | State |
| --- | --- |
| `cellar_add` | One `cellar_items` row owned by the caller; possibly a created or field-filled `wines` row. |
| `cellar_update` | Quantity / location / drink window changed, or `status` set to `drunk` or `gifted`; possibly an automatic `drunk`. |
| `cellar_list` | Nothing persisted. |

Nothing in the specification describes a consumption history: once `quantity` is decremented, the previous value is gone. Drinking stats are named as post-MVP work (`README.md:423`). A `review_write` with `consume: true` leaves the review as the only durable trace of that bottle.

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Add by `wine_id` | The agent already knows the wine | Row inserted, catalogue untouched |
| Add with inline fields | The wine may not exist yet | Upsert first, then insert (ordering above) |
| Decrement to zero | Last bottle drunk | `status = drunk` set automatically (`README.md:184`) |
| Mark gifted | Caller passes `status: gifted` | Item leaves the engine's `source: "cellar"` pool (`README.md:285`) |
| Consume via review | `review_write` with `consume: true` | Cellar decremented from another feature — [[reviews-index]] |

## Timing and automatic behaviour

| Automatic behaviour | Trigger | Source |
| --- | --- | --- |
| `status = drunk` | Drinking the last bottle | `README.md:184` |
| Cellar decrement | `review_write` with `consume: true` | `README.md:193` |
| Cellar items dropped | `user_delete` with `hard: true` | `README.md:221` |

No timers, retries, or background jobs are specified. Nothing ages an item out of its drink window; `ready_to_drink` and `drink_soon` are evaluated at query time (`README.md:186`–`187`).

## What is deliberately not here

| Absent | Why |
| --- | --- |
| Image upload or storage | Out of scope for the MVP; vision is client-side ([ADR-0009](../../decisions/0009-vision-happens-client-side.md), `README.md:38`) |
| Any screen | The MCP client is the UI (`README.md:39`) — see [[cellar-screens]] |
| Price lookup / enrichment of what a bottle is worth | No external wine APIs (`README.md:37`); `purchase_price` is whatever the caller says |
| Sharing a cellar between users | Post-MVP (`README.md:423`) |
| Consumption history | Post-MVP (`README.md:423`) |
