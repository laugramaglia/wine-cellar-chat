---
feature: reviews
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:206
  - business-docs/wiki/shared/mvp-spec.md:207
updated: 2026-08-29
---

# Reviews — flow

## Happy path

1. The user tells their agent they drank a bottle and what they thought of it.
2. The agent resolves the wine — `wine_search` or `wine_get`, or `wine_upsert` first if the wine is not in the catalog yet ([[wine-catalog-index]]).
3. The agent calls `review_write` with `wine_id`, `rating` (1-100), and any of `drank_on`, `occasion`, `body_text`, `would_buy_again` (`business-docs/wiki/shared/mvp-spec.md:206-207`).
4. The server resolves the calling user from the bearer token — not from tool input (`business-docs/wiki/shared/mvp-spec.md:350-352`) — and inserts a row into `reviews` (`business-docs/wiki/shared/mvp-spec.md:94-95`).
5. If the call carried `consume: true`, the caller's cellar holding for that wine is decremented (`business-docs/wiki/shared/mvp-spec.md:207`). Draining the last bottle sets `status = drunk` on the cellar item, which is [[cellar-index]]'s rule (`business-docs/wiki/shared/mvp-spec.md:198`).
6. The rating is now visible to the engine. The next `wine_recommend` scores this wine, its grape, its region and its producer differently through the personal-history component, weight `0.20` (`business-docs/wiki/shared/mvp-spec.md:310`).

## Preconditions

| | |
| --- | --- |
| Token | valid, not revoked, not expired; user `status = active` (`business-docs/wiki/shared/mvp-spec.md:157-159`) |
| Permission | `review:write` — `admin` or `member`. A `guest` cannot write (`business-docs/wiki/shared/mvp-spec.md:137`) |
| Wine | a `wines` row must exist to point `wine_id` at (`business-docs/wiki/shared/mvp-spec.md:94`) |
| Cellar | for `consume: true`, presumably a cellar item with `quantity > 0` — **unspecified**, see below |

## Postconditions

- A `reviews` row exists, owned by the caller, with `created_at` set (`business-docs/wiki/shared/mvp-spec.md:95`).
- With `consume: true`, the caller's cellar quantity for that wine is one lower, and may have flipped to `status = drunk` (`business-docs/wiki/shared/mvp-spec.md:198`).
- The caller's future recommendations are affected. The rating is also folded into the global aggregate that `wine_get` reports to **every** user (`business-docs/wiki/shared/mvp-spec.md:189`).
- Nothing is written for other users, and no cellar but the caller's is touched (`business-docs/wiki/shared/mvp-spec.md:168-170`).

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Plain review | `consume` absent or false | Row inserted. Cellar untouched. |
| Review and consume | `consume: true` and the caller owns bottles | Row inserted, cellar decremented (`business-docs/wiki/shared/mvp-spec.md:207`) |
| Review and consume, nothing owned | `consume: true` and the caller owns no bottles of that wine | **Unspecified.** Insert-and-ignore, insert-and-warn, and reject are all consistent with the text. |
| Read by wine | `review_list` with `wine_id` | Reviews for that wine — whose, is ambiguous; see [[reviews-api]] |
| Read own recent | `review_list` without `wine_id` | The caller's recent reviews (`business-docs/wiki/shared/mvp-spec.md:209-210`) |

## Timing and automatic behaviour

| Behaviour | Detail |
| --- | --- |
| Cellar auto-`drunk` | Drinking the last bottle sets `status = drunk` without being asked (`business-docs/wiki/shared/mvp-spec.md:198`). Reached through `consume: true`, but owned by [[cellar-index]]. |
| `last_used_at` touch | The token's `last_used_at` is updated best-effort via `ctx.waitUntil` on every request, this one included (`business-docs/wiki/shared/mvp-spec.md:355`). |
| Engine effect | Immediate and unannounced. There is no confirmation step between writing a rating and that rating changing recommendations. |

No timers, no retries, no debounce are specified anywhere in this flow.

## What is deliberately not here

| Absent | Why |
| --- | --- |
| Editing a review | No `review_update` tool is specified (`business-docs/wiki/shared/mvp-spec.md:204-210`). Not stated as a decision either — it is a gap, recorded in [[divergences]]. |
| Deleting a review | No `review_delete` tool. Reviews are only removed wholesale, by `user_delete` with `hard: true` (`business-docs/wiki/shared/mvp-spec.md:235`), which is [[user-administration-index]]'s. |
| Reviewing on behalf of someone else | Structural: no non-admin tool takes a `user_id` (`business-docs/wiki/shared/mvp-spec.md:168-170`). |
| Rating a wine that is not in the catalog | `review_write` takes `wine_id`; unlike `cellar_add` (`business-docs/wiki/shared/mvp-spec.md:193-194`) it has no stated inline-wine upsert path. |
