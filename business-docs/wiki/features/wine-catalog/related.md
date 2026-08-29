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
| [[cellar-index]] | Consumes. `cellar_items.wine_id` points at a catalogue row (`README.md:76`); `cellar_add` may pass inline wine fields, which upsert through this feature first (`README.md:179`). It owns quantity, price paid, location and the drink window — this feature owns none of them ([ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md)) |
| [[reviews-index]] | Consumes. `reviews.wine_id` points at a catalogue row (`README.md:80`). It owns `rating` and review text; `wine_get` surfaces the caller's reviews and the all-user aggregate rating (`README.md:174`) but does not define them. Note the near-collision: a wine's `tasting_notes` column is catalogue data, a review's `body_text` is a person's opinion |
| [[recommendation-engine-index]] | Consumes. Reads catalogue fields — `food_pairings`, `grapes`, `avg_price`, and the four palate scales — as scoring inputs (`README.md:292`–`README.md:299`). Sparse rows stay competitive under [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) |
| [[preferences-index]] | Indirect. `user_prefs.likes`/`dislikes` name grapes, regions and styles that must match catalogue values — so any normalization decision here changes what preferences can match (`README.md:67`) |
| [[authentication-index]] | Upstream. Resolves the caller from the bearer token before any tool runs; the caller is never taken from tool input (`README.md:336`) |
| [[authorization-index]] | Upstream. Gates `catalog:read` and `catalog:write`, both by hiding tools and by re-checking in the handler (`README.md:118`, `README.md:130`) |
| [[user-administration-index]] | Weak. Deleting a user, even with `hard: true`, leaves their contributed wines in the shared catalogue (`README.md:222`) |
| [[token-administration-index]] | Weak. A token with explicit `scopes` can hold `catalog:read` without `catalog:write`, narrowing a member to a read-only catalogue client (`README.md:114`) |

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[glossary]] | *Wine*, *bottling*, *cellar item*, *NV* — terms this feature's boundary depends on |
| [[data-types]] | The `wine_type`, `sweetness`, `body`, `tannin` and `acidity` enums, shared with preferences and the engine (`README.md:84`–`README.md:89`) |
| [[error-codes]] | The one specified error shape, and the `401` edge behaviour |
| [[mcp-protocol]] | Transport, `tools/list` visibility, and the shape of a tool result |
| [[security]] | The unanswered question of how `wine_search.query` reaches SQL, and why a published tool schema is not a defence |
| [[divergences]] | Every gap this page set found, in one place |
| [[audit-logging]] | For contrast: `audit_log` covers admin actions only (`README.md:345`). **Catalogue writes are not audited** — nothing records who filled which field |

## Code shared with other features

None exists yet. Planned, from the layout sketch at `README.md:353`: `src/db/queries/wines.ts` would be read by the cellar, reviews and engine code as well as by this feature's tools, and `src/permissions.ts` holds the single `TOOL_PERMISSIONS` table that makes a tool without a permission a compile error (`README.md:147`, [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md)). Neither file exists.
