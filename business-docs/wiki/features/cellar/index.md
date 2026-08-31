---
feature: cellar
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:90
  - business-docs/wiki/shared/mvp-spec.md:193
updated: 2026-08-29
---

# Cellar

The cellar is the set of bottles **one user actually owns**. A `cellar_items` row says: this user has *n* bottles of this wine, bought on this date for this price, kept in this place, to be drunk between these two dates, and currently `in_cellar`, `drunk`, or `gifted` (`business-docs/wiki/shared/mvp-spec.md:90`). It starts when bottles are added (`cellar_add`) and ends when the last one is consumed or given away.

It is deliberately not the catalogue. A wine is an abstract bottling shared by everyone; a cellar item is ownership of copies of it ([ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md)). That split is what lets the engine answer *"what should I open tonight"* over the cellar alone (`business-docs/wiki/shared/mvp-spec.md:66`).

> **Unverified — nothing here is implemented.** Every claim on this page is traced to [[mvp-spec]], a specification. No code exists. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | `cellar_add`, `cellar_update`, `cellar_list` over MCP (`business-docs/wiki/shared/mvp-spec.md:193`–`202`); `review_write` with `consume: true` (`business-docs/wiki/shared/mvp-spec.md:207`) |
| Owns | the `cellar_items` row and its fields; the `in_cellar / drunk / gifted` lifecycle; the last-bottle auto-transition; `cellar_list` filters and sort |
| Does not own | wine fields — [[wine-catalog-index]]; scoring and drink-window urgency — [[recommendation-engine-index]]; the `consume` flag's own tool — [[reviews-index]]; permission checks — [[authorization-index]] |
| Status | stub — specified, not built |

## Pages

- [[cellar-flow]] — the happy path
- [[cellar-screens]] — there are none, and why
- [[cellar-states]] — the lifecycle state machine (**the page that matters here**)
- [[cellar-errors]] — error catalogue
- [[cellar-copy]] — user-visible strings
- [[cellar-validations]] — input rules
- [[cellar-api]] — the three tool contracts
- [[cellar-decisions]] — the ADRs that apply
- [[cellar-related]] — neighbours and cross-feature writes

## Rules

Indexed machine-readable form: `business-docs/rules/cellar.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `cellar-item-is-per-user` | A cellar item belongs to exactly one user and references one wine. | `cellar_items.user_id`, `.wine_id` | `business-docs/wiki/shared/mvp-spec.md:90` |
| `cellar-status-enum` | An item's status is one of three values. | `in_cellar \| drunk \| gifted` | `business-docs/wiki/shared/mvp-spec.md:92` |
| `cellar-last-bottle-auto-drunk` | Drinking the last bottle sets `status = drunk` automatically. | — | `business-docs/wiki/shared/mvp-spec.md:198` |
| `cellar-engine-source-requires-both` | For `source: "cellar"` the engine requires **both** `quantity > 0` **and** `status = in_cellar`. | two conditions, AND | `business-docs/wiki/shared/mvp-spec.md:299` |
| `cellar-add-may-upsert-wine` | `cellar_add` accepts inline wine fields, which upsert the wine first. | — | `business-docs/wiki/shared/mvp-spec.md:193` |
| `cellar-write-permission` | `cellar_add` and `cellar_update` require `cellar:write`; `cellar_list` requires `cellar:read`. | — | `business-docs/wiki/shared/mvp-spec.md:134`–`135` |
| `cellar-guest-no-cellar` | `guest` holds neither cellar permission — no reads, no mutations. | — | `business-docs/wiki/shared/mvp-spec.md:122` |
| `cellar-caller-from-props` | No cellar tool takes a `user_id`; the owner comes from `props`. | — | `business-docs/wiki/shared/mvp-spec.md:169`, `business-docs/wiki/shared/mvp-spec.md:350` |
| `cellar-list-filters` | `cellar_list` filters on `wine_type`, `region`, `ready_to_drink`, `drink_soon`. | — | `business-docs/wiki/shared/mvp-spec.md:200`–`201` |
| `cellar-list-sort` | `sort` accepts four keys. | `drink_until \| purchase_date \| price \| name` | `business-docs/wiki/shared/mvp-spec.md:202` |
| `cellar-review-consume-decrements` | `review_write` with `consume: true` decrements the cellar. | — | `business-docs/wiki/shared/mvp-spec.md:207` |
| `cellar-hard-delete-drops-items` | `user_delete` with `hard: true` drops that user's cellar items. | — | `business-docs/wiki/shared/mvp-spec.md:235` |
| `cellar-item-is-a-lot` | A row is a **lot** — bottles acquired together. There is no unique constraint on `(user_id, wine_id)`, so two purchases at two prices, in two places, closing at two times are two rows. | no `(user_id, wine_id)` unique | [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) |
| `stock-is-in-cellar` | Stock is `status = 'in_cellar'`, never a quantity of zero. A closed lot keeps the count of what left the cellar, so a read that forgets the status filter is silently wrong — every stock read goes through one helper. | `WHERE status = 'in_cellar'` | [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) |
| `partial-gift-splits-the-lot` | Gifting or drinking part of a lot **splits** it: the bottles that left become a new row with the new status, and the original quantity drops by the same amount. | split, not decrement | [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) |
| `auto-drunk-fires-on-every-path` | The last-bottle transition to `drunk` is a property of the lot, so it fires wherever consumption empties it — `review_write` with `consume: true` exactly as much as `cellar_update`. | every path | [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) |
| `wine-delete-restricted-by-holdings` | `cellar_items.wine_id` is `ON DELETE RESTRICT`: the shared catalogue cannot drop a wine that any user holds. | `ON DELETE RESTRICT` | [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md), [ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md) |
| `cellar-bounds` | `quantity >= 0` and `drink_from <= drink_until` are `CHECK` constraints, so a negative holding and an inverted window are both unstorable. | two `CHECK`s | [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) |

## Not real yet

Everything. There is no `src/`, no `cellar.ts`, no migration. The table shape, the three tools and the lifecycle exist only as prose in [[mvp-spec]].

Beyond that, the specification itself leaves these undefined — each is a decision someone still has to make, not an omission from this page:

| Undefined | Why it bites |
| --- | --- |
| Behaviour when `cellar_update` would drive `quantity` below zero | Clamp at 0, reject, or store negative — three different products. |
| Default `N` for `drink_soon` ("window closes within N months", `business-docs/wiki/shared/mvp-spec.md:201`) | Every caller that omits it gets an unspecified window. |
| `ready_to_drink` when `drink_from` / `drink_until` are null | Both fields are optional; whether a null window means always-ready or never-ready is unstated. |
| Whether a `drunk` item can return to `in_cellar` | No un-drink path is described; also no rule forbidding one. |
| Gifting *some* bottles: decrement quantity, or split the row? | `status` is per row, so `gifted` cannot describe a partial quantity. |
| Currency and unit of `purchase_price` | No currency is stated anywhere; `price` also sorts `cellar_list` and filters the engine. |
| Whether the drink window must satisfy `drink_from <= drink_until` | Nothing states an ordering constraint. |

All of these are mirrored in [[divergences]].
