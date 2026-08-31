---
adr: 0019
title: Bottles are held as lots, and stock is status = 'in_cellar'
status: accepted
date: 2026-08-29
amended: 2026-08-29
affects:
  - cellar
  - reviews
supersedes:
superseded_by:
source: human decision — schema design, 2026-08-29; resolves the partial-gifting and terminal-state gaps in business-docs/wiki/shared/divergences.md
---

# ADR-0019 — Bottles are held as lots, and stock is `status = 'in_cellar'`

**Decision.** A `cellar_items` row is a **lot** — bottles of one wine acquired together — so a user may hold many rows for the same wine; a lot that is drunk or gifted keeps the count of what left, and **stock is defined by `status = 'in_cellar'`, never by a quantity of zero**.

> **Amended the day it was written.** As first accepted, this ADR also said a closed lot must hold `quantity = 0`. Implementing it proved the two clauses contradict each other — see *The amendment* below. The constraint was dropped; the split was kept.

## Context

[[mvp-spec]] puts `status` (`in_cellar | drunk | gifted`) and `quantity` on the same row (`business-docs/wiki/shared/mvp-spec.md:90-92`) and leaves three things undefined, all recorded in [[divergences]]:

- **Partial gifting is unrepresentable.** `status` is per row, so it cannot describe giving away two of six bottles. Whether that decrements or splits the row is unspecified.
- **Whether `drunk` and `gifted` are terminal is unstated**, so a row can sit in a terminal state still claiming three bottles.
- Drinking the last bottle auto-sets `status = drunk` (`business-docs/wiki/shared/mvp-spec.md:198`), but only under `cellar_update` — whether it fires on the `review_write consume: true` path is unstated.

There is also a real modelling question underneath. Six bottles of the same wine bought on two dates at two prices, stored in two places, are not one holding: `purchase_price`, `purchase_date`, `location` and the drink window are all per-acquisition. A one-row-per-wine model has to lie about at least one of them.

## Decision

A row is a lot. `(user_id, wine_id)` carries **no** unique constraint, and `cellar_add` called twice for the same wine creates two rows unless the caller names an existing item.

`status` describes what happened to *that lot*, and it is the **only** definition of stock:

```sql
-- what a stock read looks like, everywhere, without exception
SUM(quantity) FILTER (WHERE status = 'in_cellar')
```

Partial gifting is a **split**: the gifted bottles move to a new row with `status = 'gifted'` **carrying their own count**, and the original lot's `quantity` is reduced by the same amount. Consuming works the same way. The closed row is the record of what left the cellar and why — five bottles gifted on a date, at a price, from a location.

`drunk` and `gifted` are terminal for the lot: a closed lot is never reopened, and a closed row never appears in a stock read. The single `CHECK` that survives is `quantity >= 0`.

The last-bottle auto-transition to `drunk` fires **wherever consumption empties a lot**, `cellar_update` and `review_write consume: true` alike. It is a property of the lot, not of the tool that touched it.

## The amendment

As first written this ADR carried a second constraint — `CHECK (status = 'in_cellar' OR quantity = 0)` — on the reasoning that a closed lot holding bottles would be counted as stock by a query that forgot to filter on status.

Writing the code broke it immediately. Gifting two bottles from a lot of six creates a `gifted` row, and the only number worth putting on that row is **2**. A constraint demanding zero makes the count unrepresentable, which destroys exactly the record this ADR rejected the decrement-only model to preserve: *"a cellar that shrinks with no trace of what was opened."* The two clauses could not both stand.

The split was kept because it carries the information; the constraint was dropped because it forbids it. What replaces the column rule is a query rule, stated once and enforced by convention plus the partial indexes: **stock is `status = 'in_cellar'`**.

That is a genuine weakening — a query that forgets the filter is now wrong instead of merely redundant, and nothing in the database catches it. The mitigation is that `cellar_by_wine` and `cellar_window` are both partial indexes on `status = 'in_cellar'`, so the correct query is also the fast one, and every read path in `src/db/memory.ts` goes through one `holdings()` helper that applies the filter.

The auto-`drunk` rule fires **wherever quantity reaches zero by consumption**, `cellar_update` and `review_write consume: true` alike. It is a property of the lot, not of the tool that touched it.

A wine cannot be deleted while any lot references it — `cellar_items.wine_id` is `ON DELETE RESTRICT` — which is the schema's statement of [ADR-0008](0008-wine-and-cellar-item-are-separate.md): the shared catalogue may not drop a row somebody owns.

## Consequences

- `purchase_price` and `purchase_date` are finally honest: each lot carries what was actually paid, when. "What did this cost me" stops being an average of two truths.
- Drink windows work per acquisition, which is how they behave in reality — the 2019s bought in 2021 and in 2024 close at the same time, but the case in the garage and the two in the kitchen may not.
- **`cellar_list` must aggregate.** A user with four lots of one Malbec sees four rows unless the query groups them, and the drink-window filters (`ready_to_drink`, `drink_soon`) then have to decide which lot's window they mean. This is the cost of the model and it lands squarely on [[cellar-api]].
- The engine's `source: "cellar"` filter becomes `EXISTS (… quantity > 0 AND status = 'in_cellar')` rather than a column read.
- A lot with zero bottles still `in_cellar` remains legal — an emptied lot awaiting its status, or a placeholder.
- **A stock read that forgets `WHERE status = 'in_cellar'` is silently wrong, and the database will not stop it.** This is the cost of the amendment and the trap this ADR now exists to prevent. Route stock reads through one helper.
- A closed lot's `quantity` is a historical count, not a holding. Anything summing `quantity` across all statuses is measuring "bottles this user has ever had", which is a different and rarely wanted question.
- Nothing here decides what `cellar_update` should do when a decrement would go below zero; the `quantity >= 0` check makes it an error rather than a negative holding, and the *message* is still an open question for [[cellar-index]].

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| `UNIQUE (user_id, wine_id)`, one row per holding | Cannot represent two purchases at two prices, and forces `purchase_price` to become an average — a number that was never paid. Also makes partial gifting impossible without inventing a second table. |
| ~~Force a terminal row to hold zero~~ | **Tried, and reverted.** It makes a partial gift's count unrepresentable, which defeats the reason splitting was chosen over decrementing. Recorded above. |
| Decrement in place with no gifted/drunk row | Loses the record entirely: a cellar that shrinks with no trace of what was opened. Consumption history is named as post-MVP work (`business-docs/wiki/shared/mvp-spec.md:436`) and this keeps the door open at no cost. |
| A separate `cellar_events` ledger, quantity derived | The right long-term model and clearly out of scope for the MVP. It also makes every read a fold. Revisit when consumption history lands. |
| `ON DELETE CASCADE` from `wines` | Deleting a catalogue row would silently empty someone's cellar. No tool deletes wines today, which is exactly when to make it impossible. |

## Where this is enforced

`src/db/schema.sql` (the absent `(user_id, wine_id)` unique, `ON DELETE RESTRICT`, the partial indexes on `status = 'in_cellar'`, and the comment recording why no closed-lot constraint exists) and `src/db/memory.ts` — `holdings()`, `updateCellarItem()` and `consume()`, which between them own the split, the auto-`drunk` transition, and the one place the stock filter is applied. Cite as `ADR-0019`. See [[cellar-index]] and [[reviews-index]].
