---
feature: wine-catalog
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Wine catalogue — related

## Features

| Feature | Relationship |
| --- | --- |
| [[cellar-index]] | Consumes. `cellar_items.wine_id` points at a catalogue row (`business-docs/wiki/shared/mvp-spec.md:90`); `cellar_add` may pass inline wine fields, which upsert through this feature first (`business-docs/wiki/shared/mvp-spec.md:193`). It owns quantity, price paid, location and the drink window — this feature owns none of them ([ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md)) |
| [[reviews-index]] | Consumes. `reviews.wine_id` points at a catalogue row (`business-docs/wiki/shared/mvp-spec.md:94`). It owns `rating` and review text; `wine_get` surfaces the caller's reviews and the all-user aggregate rating (`business-docs/wiki/shared/mvp-spec.md:188`) but does not define them. Note the near-collision: a wine's `tasting_notes` column is catalogue data, a review's `body_text` is a person's opinion |
| [[recommendation-engine-index]] | Consumes. Reads catalogue fields — `food_pairings`, `grapes`, `avg_price`, and the four palate scales — as scoring inputs (`business-docs/wiki/shared/mvp-spec.md:306`–`business-docs/wiki/shared/mvp-spec.md:313`). Sparse rows stay competitive under [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) |
| [[preferences-index]] | Indirect. `user_prefs.likes`/`dislikes` name grapes, regions and styles that must match catalogue values — so any normalization decision here changes what preferences can match (`business-docs/wiki/shared/mvp-spec.md:81`) |
| [[authentication-index]] | Upstream. Resolves the caller from the bearer token before any tool runs; the caller is never taken from tool input (`business-docs/wiki/shared/mvp-spec.md:350`) |
| [[authorization-index]] | Upstream. Gates `catalog:read` and `catalog:write`, both by hiding tools and by re-checking in the handler (`business-docs/wiki/shared/mvp-spec.md:132`, `business-docs/wiki/shared/mvp-spec.md:144`) |
| [[user-administration-index]] | Weak. Deleting a user, even with `hard: true`, leaves their contributed wines in the shared catalogue (`business-docs/wiki/shared/mvp-spec.md:236`) |
| [[token-administration-index]] | Weak. A token with explicit `scopes` can hold `catalog:read` without `catalog:write`, narrowing a member to a read-only catalogue client (`business-docs/wiki/shared/mvp-spec.md:128`) |

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[glossary]] | *Wine*, *bottling*, *cellar item*, *NV* — terms this feature's boundary depends on |
| [[data-types]] | The `wine_type`, `sweetness`, `body`, `tannin` and `acidity` enums, shared with preferences and the engine (`business-docs/wiki/shared/mvp-spec.md:98`–`business-docs/wiki/shared/mvp-spec.md:103`) |
| [[error-codes]] | The one specified error shape, and the `401` edge behaviour |
| [[mcp-protocol]] | Transport, `tools/list` visibility, and the shape of a tool result |
| [[security]] | The unanswered question of how `wine_search.query` reaches SQL, and why a published tool schema is not a defence |
| [[divergences]] | Every gap this page set found, in one place |
| [[audit-logging]] | For contrast: `audit_log` covers admin actions only (`business-docs/wiki/shared/mvp-spec.md:359`). **Catalogue writes are not audited** — nothing records who filled which field |

## Code shared with other features

None exists yet. Planned, from the layout sketch at `business-docs/wiki/shared/mvp-spec.md:367`: `src/db/queries/wines.ts` would be read by the cellar, reviews and engine code as well as by this feature's tools, and `src/permissions.ts` holds the single `TOOL_PERMISSIONS` table that makes a tool without a permission a compile error (`business-docs/wiki/shared/mvp-spec.md:161`, [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md)). Neither file exists.
