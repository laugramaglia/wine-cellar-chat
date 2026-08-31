---
feature: reviews
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Reviews — related

## Features

| Feature | Relationship |
| --- | --- |
| [[recommendation-engine-index]] | **The reason this feature exists.** Consumes the caller's ratings as the personal-history component, weight `0.20`, matched against the wine, its grape, its region and its producer — "a grape you rate 90+ pulls hard" (`business-docs/wiki/shared/mvp-spec.md:310`). Reviews are training data, not a diary. |
| [[cellar-index]] | `review_write` with `consume: true` decrements the caller's cellar (`business-docs/wiki/shared/mvp-spec.md:207`); draining the last bottle flips it to `status = drunk` (`business-docs/wiki/shared/mvp-spec.md:198`). The decrement mechanics are the cellar's rules, not ours. |
| [[wine-catalog-index]] | Owns `wines` and every wine field. `reviews.wine_id` is an FK to it, and `wine_get` is the catalog tool that surfaces both the caller's reviews and the global aggregate (`business-docs/wiki/shared/mvp-spec.md:188-189`). |
| [[preferences-index]] | A parallel, *declared* signal to the reviews' *revealed* one. Palate fit (`0.25`) reads `user_prefs`; personal history (`0.20`) reads reviews. They can disagree, and the engine weights both. |
| [[authorization-index]] | Owns `review:read` and `review:write` and their role grants (`business-docs/wiki/shared/mvp-spec.md:136-137`). Note that `review:read` reaches `guest`. |
| [[authentication-index]] | Resolves the caller whose reviews these are. The author is the token holder, never a tool argument (`business-docs/wiki/shared/mvp-spec.md:350-352`). |
| [[user-administration-index]] | `user_delete` with `hard: true` drops a user's reviews (`business-docs/wiki/shared/mvp-spec.md:235`); the soft path says nothing about them. |
| [[token-administration-index]] | A scoped token can hold `review:read` without `review:write`, narrowing a member's client (`business-docs/wiki/shared/mvp-spec.md:74-78`, `business-docs/wiki/shared/mvp-spec.md:127-128`). |

## The engine relationship, stated precisely

Two different numbers about the same wine come from this feature, and confusing them is the likeliest bug in the whole system:

| Number | Scope | Consumer | Source |
| --- | --- | --- | --- |
| Aggregate rating | **Every user's** reviews of that wine | `wine_get`, shown to the caller | `business-docs/wiki/shared/mvp-spec.md:189` |
| Personal history score | **Only the caller's** ratings, generalised to grape / region / producer | `wine_recommend` scoring, weight `0.20` | `business-docs/wiki/shared/mvp-spec.md:310` |

The engine never scores on the global aggregate. A wine everyone loves and this user has never rated contributes nothing to the personal-history component — and by the missing-data rule it is dropped and the remaining weights renormalized, rather than penalized (`business-docs/wiki/shared/mvp-spec.md:318-319`).

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[glossary]] | *review*, *rating*, *cellar item*, *personal history* |
| [[data-types]] | the `reviews` row shape and the shared date / enum conventions (`business-docs/wiki/shared/mvp-spec.md:98-102`) |
| [[error-codes]] | `401` at the edge, and the permission-denied message shape (`business-docs/wiki/shared/mvp-spec.md:153-159`) |
| [[security]] | the caller is resolved from the token, and cross-user visibility is the open question in [[reviews-api]] |
| [[mcp-protocol]] | tools are the only surface; `tools/list` filtering hides `review_write` from guests (`business-docs/wiki/shared/mvp-spec.md:146-148`) |
| [[audit-logging]] | writes to `audit_log` are **admin actions only** (`business-docs/wiki/shared/mvp-spec.md:359-361`). Writing a review is not audited — worth knowing before anyone asks who rated what, when. |
| [[divergences]] | six open gaps in this feature, indexed in [[reviews-decisions]] |

## Code shared with other features

None exists yet. When it does, `business-docs/wiki/shared/mvp-spec.md:367-382` places the shared pieces as: `src/db/queries/reviews.ts` (owned here), `src/db/queries/cellar.ts` (owned by [[cellar-index]], called by `consume: true`), `src/permissions.ts` (owned by [[authorization-index]]), and `src/engine/recommend.ts` (owned by [[recommendation-engine-index]], the only reader of review history).
