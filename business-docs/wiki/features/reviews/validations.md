---
feature: reviews
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:94
  - business-docs/wiki/shared/mvp-spec.md:206
updated: 2026-08-29
---

# Reviews — validations

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| `rating` | Integer on a `1-100` scale | **Unstated.** The bound is written twice — in the table as `rating (1-100)` (`business-docs/wiki/shared/mvp-spec.md:94`) and in the tool as `rating` 1–100 (`business-docs/wiki/shared/mvp-spec.md:206`) — but never assigned to the zod schema, the column, or both | unspecified |
| `wine_id` | Must reference an existing wine | Presumably an FK on `reviews.wine_id` (`business-docs/wiki/shared/mvp-spec.md:94`); not stated | unspecified |
| `user_id` | Not an input at all — taken from `props` | Structural, at the auth layer (`business-docs/wiki/shared/mvp-spec.md:350-352`) | n/a |
| `drank_on` | A date | unstated; no format, no bound | unspecified |
| `occasion`, `body_text` | Free text | no length limit stated | unspecified |
| `would_buy_again` | Boolean | unstated whether required, and no `?? false` fallback is given (`business-docs/wiki/shared/mvp-spec.md:95`) | unspecified |
| `consume` | Boolean, opt-in | `business-docs/wiki/shared/mvp-spec.md:207`; behaviour when the caller owns nothing is unstated | unspecified |
| `min_rating` | Filter on `review_list` | not stated whether it shares the `1-100` bound (`business-docs/wiki/shared/mvp-spec.md:210`) | unspecified |
| `since` | Date filter on `review_list` | unstated whether it filters `drank_on` or `created_at` | unspecified |
| `limit` | Result cap on `review_list` | **No default and no maximum stated** — unlike `wine_search`, which specifies `limit` default 10, max 50 (`business-docs/wiki/shared/mvp-spec.md:185`) | unspecified |

## Client vs server

There is no client to validate on. Every tool input arrives from an agent over MCP and is validated exactly once, server-side, by a zod input schema per tool (`business-docs/wiki/shared/mvp-spec.md:377`) plus whatever the database enforces.

| Rule | Agent (client) | Server |
| --- | --- | --- |
| `rating` in `1-100` | Not trustworthy — the caller is an LLM composing JSON | Must enforce. Layer unstated. |
| Ownership ("only your own reviews") | Cannot be asserted client-side | Structural: user comes from the token, not the payload (`business-docs/wiki/shared/mvp-spec.md:350-352`) |
| Permission | Hinted by `tools/list` filtering (`business-docs/wiki/shared/mvp-spec.md:146-148`) | Re-checked in the handler; this is the boundary (`business-docs/wiki/shared/mvp-spec.md:149-151`) |

The caller being a language model raises the stakes on the first row: an agent will cheerfully send `rating: 9.5` or `rating: "92/100"` if the schema lets it.

## Not validated

The following reach the system unchecked as far as the specification goes. Each is a real gap, recorded in [[divergences]]:

| Gap | Why it matters |
| --- | --- |
| Where the `1-100` bound lives — zod, the column `CHECK`, or both | Schema-only is bypassable by any future non-tool write path; column-only turns a user mistake into a database error |
| Whether one user may write **more than one** review of the same wine | Changes what `avg 92 over 4 reviews` means, and whether a user can dominate a wine's global aggregate by rating it repeatedly. See [[reviews-api]] |
| Whether `drank_on` may be in the future, or before the cellar item's `drink_from` | The `reviews.drank_on` / `cellar_items.drink_until` relationship is never stated (`business-docs/wiki/shared/mvp-spec.md:91`, `business-docs/wiki/shared/mvp-spec.md:94`) |
| Whether `review_write` on a wine the caller has never owned is legal | Nothing forbids it, and reviewing a wine drunk at a restaurant is a normal thing to do |
| `limit` on `review_list` | No cap stated; an unbounded limit is a denial-of-service shape on a shared Worker |
