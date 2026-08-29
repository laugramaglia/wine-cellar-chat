---
feature: reviews
page: api
status: stub
source_of_truth: wiki
code_refs:
  - README.md:192
  - README.md:195
updated: 2026-08-29
---

# Reviews — API

There is **no OpenAPI document, by decision**: the surface is MCP tools over Streamable HTTP, not REST, and [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) records why a spec would describe one endpoint (`POST /mcp`) and hide everything that matters. The tool schemas below are therefore the contract, and this page is where they live. Protocol mechanics: [[mcp-protocol]].

| Tool | Permission | Handler | Called from |
| --- | --- | --- | --- |
| `review_write` | `review:write` (`README.md:123`) | `src/tools/` — planned, does not exist (`README.md:363`) | any MCP client |
| `review_list` | `review:read` (`README.md:122`) | `src/tools/` — planned | any MCP client |
| `wine_get` | `catalog:read` (`README.md:118`) — owned by [[wine-catalog-index]] | planned | returns review data; see below |

## `review_write`

Record a tasting (`README.md:192-193`).

| Field | Type | Notes |
| --- | --- | --- |
| `wine_id` | id | Required. No inline-wine upsert path is specified, unlike `cellar_add` (`README.md:179-180`) |
| `rating` | int `1-100` | `README.md:192` |
| `drank_on` | date | |
| `occasion` | text | |
| `body_text` | text | |
| `would_buy_again` | bool | |
| `consume` | bool | Optional. `true` decrements the cellar (`README.md:193`) |

No `user_id`. The author is the token holder (`README.md:154-156`). The return shape is not specified.

## `review_list`

Reviews by wine, or the caller's recent reviews (`README.md:195-196`).

| Filter | Type | Notes |
| --- | --- | --- |
| `wine_id` | id | Scopes to one wine |
| `min_rating` | int | Floor. Bound unstated |
| `since` | date | Unstated whether it filters `drank_on` or `created_at` |
| `limit` | int | **No default, no maximum stated** — compare `wine_search`, default 10 / max 50 (`README.md:171`) |

## Whose reviews are visible

This is the sharpest unresolved question in the feature, because it is a data-exposure rule.

| Data | Audience | Source |
| --- | --- | --- |
| Aggregate rating on a wine | **All users.** `wine_get` returns "aggregate rating across all users" | `README.md:175` — explicit |
| The caller's own reviews on a wine | **Caller only.** `wine_get` returns "the caller's reviews" as a distinct thing | `README.md:174-175` — explicit |
| `review_list` with `wine_id` | **Ambiguous.** "reviews by wine, or the caller's recent reviews" reads either as one scope with two filters, or as two modes, one of them global | `README.md:195-196` |

Three facts pull against each other and cannot all be satisfied by one reading:

1. `review:read` is granted to `guest` (`README.md:122`), yet `guest` is described as read-only over the catalog and *"their own prefs"* — reviews are not named in the role description (`README.md:108`).
2. The structural rule is that no non-admin tool takes a `user_id` and you cannot read another account's data (`README.md:154-156`). That constrains *addressing* another user, not aggregating over everyone — and `wine_get` already aggregates.
3. Aggregate ratings are cross-user **by design**, so "reviews are private" is already false in the numeric sense. The open question is whether other users' `body_text` and `occasion` — prose, written personally — are also readable.

**Unresolved from the specification.** Recorded in [[divergences]]. The safe default until it is decided: `review_list` returns only the caller's rows, and cross-user review data reaches nobody except as the aggregate number `wine_get` already promises.

## Response rules that matter here

- The engine's personal-history component (weight `0.20`) reads only the **caller's** ratings (`README.md:296`), while `wine_get`'s aggregate reads **everyone's** (`README.md:175`). Two different numbers about the same wine will be on screen at once. Whatever the fields are called must make that unmistakable, or an agent will report the crowd's opinion as the user's own.
- A reason string quotes the caller's own history back at them — `avg 92 over 4 reviews` (`README.md:264`) — which makes review counting a user-visible claim under [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md).

## Planned

| Absent | Note |
| --- | --- |
| `review_update` | Not specified anywhere. Reviews cannot be corrected. |
| `review_delete` | Not specified. The only removal path is `user_delete` with `hard: true`, which drops all of a user's reviews (`README.md:221`). |
| Consumption history / drinking stats | Explicitly post-MVP (`README.md:423`). |

None of these are in `README.md` as promises; they are listed so nobody mistakes their absence for an oversight in this wiki.
