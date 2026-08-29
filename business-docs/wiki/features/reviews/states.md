---
feature: reviews
page: states
status: stub
source_of_truth: wiki
code_refs:
  - README.md:80
updated: 2026-08-29
---

# Reviews — states

A review has **no lifecycle**. There is one state — written — and no specified transition out of it. That is the whole state machine, and it is a finding rather than a design: see [[divergences]].

## State shape

The `reviews` row (`README.md:80-81`):

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `id` | id | Primary key | generated |
| `user_id` | id | Author. From the bearer token, never from input (`README.md:336-338`) | required |
| `wine_id` | id | The bottling reviewed. FK to `wines` ([[wine-catalog-index]]) | required |
| `rating` | int `1-100` | The score (`README.md:80`) | unspecified whether required |
| `drank_on` | date | When it was drunk | unspecified |
| `occasion` | text | Free text | unspecified |
| `body_text` | text | Tasting note | unspecified |
| `would_buy_again` | bool | Verdict | unspecified — no stated `?? false` fallback |
| `created_at` | timestamp | Insert time | generated |

Derived values this feature is responsible for:

| Derived | Definition | Where it surfaces |
| --- | --- | --- |
| Aggregate rating | Mean rating over **all users'** reviews of a wine (`README.md:175`) | `wine_get` |
| Caller's reviews | This caller's rows for a wine (`README.md:174-175`) | `wine_get` |
| Personal history score | Caller's past ratings of the wine, its grape, its region, its producer (`README.md:296`) | [[recommendation-engine-index]] |

Neither aggregation is defined precisely: the averaging function, the minimum sample size, and whether a rating is weighted by recency are all unstated.

## Transitions

| From | Event | To | Guard |
| --- | --- | --- | --- |
| (none) | `review_write` | written | caller holds `review:write` (`README.md:123`) |
| written | `user_delete` with `hard: true` | deleted | admin action, all of that user's reviews at once (`README.md:221`) |
| written | edit | — | **no transition exists**; no `review_update` tool is specified |
| written | delete one | — | **no transition exists**; no `review_delete` tool is specified |

A soft `user_delete` sets the account to `deleted` and revokes tokens but says nothing about reviews (`README.md:220-221`) — so a soft-deleted user's ratings presumably remain in the global aggregate. Unstated; recorded in [[divergences]].

## Resolution order

The one ordering rule this feature depends on is the per-request auth chain, which runs before any handler (`README.md:329-334`): token present → token valid → user active → permissions resolved as `role_permissions(user.role) ∩ (token.scopes ?? everything)`. The `?? everything` is the rule that matters here: **a token with null `scopes` inherits the user's role in full** (`README.md:60-64`), so a member's default token can write reviews without asking for it.

No if/else chain inside the review handlers themselves is specified.

## Lifetime

Reviews live in Postgres (Neon), reached over HTTP by `@neondatabase/serverless` (`README.md:28`). They are durable and outlive every session, token and client — which is the point: *"identity lives in the database, not in the client"* (`README.md:8-9`). Two clients for one user see one review history.

Nothing caches reviews. The `McpAgent` Durable Object holds `props` (`README.md:333`), not domain data.
