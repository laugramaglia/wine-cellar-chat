---
feature: reviews
page: index
status: stub
source_of_truth: wiki
code_refs:
  - README.md:80
  - README.md:192
  - README.md:296
updated: 2026-08-29
---

# Reviews

A review is one tasting: a user records what they drank, scored `1-100`, on a date, with optional notes and a "would I buy it again" verdict. Writing one may also take the bottle out of the cellar.

Reviews are **not a passive log**. They are the training data for the recommender. The engine's *personal history* component (weight `0.20`) reads the caller's past ratings of a wine, its grape, its region and its producer — "a grape you rate 90+ pulls hard" (`README.md:296`). A rating written here changes what [[recommendation-engine-index]] returns tomorrow, and shows up verbatim in a reason string the user reads: `"Malbec matches a grape you rate highly (avg 92 over 4 reviews)"` (`README.md:264`).

## At a glance

| | |
| --- | --- |
| Entry points | `review_write` and `review_list` MCP tools (`README.md:192-196`); reviews are also returned inside `wine_get` (`README.md:174-175`) |
| Owns | the `reviews` table; the `1-100` rating scale; `review_write` and its `consume: true` option; `review_list` and its filters; the aggregate rating surfaced by `wine_get` |
| Does not own | cellar decrement mechanics ([[cellar-index]]), the scoring that consumes ratings ([[recommendation-engine-index]]), wine fields ([[wine-catalog-index]]), review deletion on account removal ([[user-administration-index]]) |
| Status | stub — specified in `README.md`, no code exists |

## Pages

- [[reviews-flow]] — the happy path
- [[reviews-screens]] — screens and their IDs (there are none; see the page)
- [[reviews-states]] — states and transitions
- [[reviews-errors]] — error catalogue
- [[reviews-copy]] — user-visible strings with business weight
- [[reviews-validations]] — input validation
- [[reviews-api]] — the tools this feature exposes
- [[reviews-decisions]] — the ADRs that apply
- [[reviews-related]] — neighbours and shared concerns

## Rules

Indexed machine-readable form: `business-docs/rules/reviews.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `review-row-shape` | A review row is `id, user_id, wine_id, rating, drank_on, occasion, body_text, would_buy_again, created_at`. | — | `README.md:80-81` |
| `review-rating-scale` | Rating is on a 1-100 scale. | `1-100` | `README.md:80`, `README.md:192` |
| `review-owner-is-the-caller` | `user_id` is resolved from the bearer token, never from tool input. No review tool takes a `user_id`. | — | `README.md:154-156`, `README.md:336-338` |
| `review-write-permission` | `review_write` requires `review:write` — `admin` and `member` only. | `review:write` | `README.md:123` |
| `review-read-permission` | `review_list` requires `review:read`, which **`guest` also holds**. | `review:read` | `README.md:122` |
| `review-consume-decrements-cellar` | `review_write` with `consume: true` decrements the caller's cellar for that wine. | `consume: true` | `README.md:193` |
| `review-list-filters` | `review_list` filters on `wine_id`, `min_rating`, `since`, `limit`. | — | `README.md:195-196` |
| `wine-get-aggregate-is-global` | `wine_get` returns an aggregate rating **across all users**, alongside the **caller's own** reviews. | all users | `README.md:174-175` |
| `review-feeds-personal-history` | The caller's ratings feed the engine's personal-history component, weight `0.20`, matched on wine, grape, region and producer. | `0.20` | `README.md:296` |
| `review-no-edit-or-delete` | No `review_update` or `review_delete` tool exists. A review, once written, has no specified way back out. | absent | `README.md:190-196` |

## Not real yet

- **Nothing is implemented.** There is no source code in this repository; `README.md` is a specification. Every claim on these pages traces to that document and to nothing that runs. See [[divergences]].
- Planned implementation sites, per `README.md:353-368`: `src/tools/` (one file per tool, zod schema + handler), `src/db/queries/reviews.ts`, `src/db/schema.sql`. **None of these paths exist.**
- No item in the MVP definition of done (`README.md:399-417`) exercises `review_write` or `review_list`. The feature is specified but untested by the acceptance list.
- "Consumption history and drinking stats" is explicitly post-MVP (`README.md:423`). Reviews are the raw material for it; the aggregation is not built.
