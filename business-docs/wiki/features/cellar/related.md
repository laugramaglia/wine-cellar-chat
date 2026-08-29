---
feature: cellar
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Cellar — related

## Features

| Feature | Relationship |
| --- | --- |
| [[wine-catalog-index]] | Owns `wines`. Every cellar item references one. **`cellar_add` writes into it** — inline wine fields upsert first (`README.md:179`); see the cross-feature writes below. `wine_search` and `wine_get` read back the other way, returning an `owned` flag and `quantity` for the caller (`README.md:172`, `README.md:174`). |
| [[reviews-index]] | **Writes into the cellar.** `review_write` with `consume: true` decrements it (`README.md:193`). Both features describe the same bottle being drunk; the review is the only durable record of it. |
| [[recommendation-engine-index]] | Reads the cellar. `source: "cellar"` requires `quantity > 0` **and** `status = in_cellar` (`README.md:285`) — the cellar's lifecycle *is* that filter. Drink-window urgency (0.05, cellar only, `README.md:299`) reads `drink_until`. Results carry `in_cellar` and `quantity`. |
| [[authorization-index]] | Owns `cellar:read` / `cellar:write` and the two-layer enforcement that gates every call here (`README.md:120`–`121`, `README.md:130`). |
| [[authentication-index]] | Owns the bearer flow that produces `props`, which is where the item's owner comes from (`README.md:333`). |
| [[user-administration-index]] | `user_delete` with `hard: true` drops the user's cellar items; soft delete leaves them (`README.md:221`). |
| [[token-administration-index]] | A scoped token can be narrower than its user's role — a `catalog:read` token is refused by `cellar_add` even though its user is a `member` (`README.md:412`). |
| [[preferences-index]] | No direct link. `prefs.budget_min/max` are compared against price with the same unspecified currency as `purchase_price`. |

## Cross-feature writes

The two places something outside this feature changes a `cellar_items` row. Both are worth documenting because they make the cellar's invariants someone else's problem too.

| Write | Direction | Ordering | Gap |
| --- | --- | --- | --- |
| `cellar_add` with inline wine fields | cellar → catalogue | Wine upserts **first**, then the item inserts (`README.md:179`) | Not stated whether the two are transactional, whether `cellar:write` alone authorizes a catalogue write, or whether the upsert result is reported back |
| `review_write` with `consume: true` | reviews → cellar | Decrement as a side effect of recording a tasting (`README.md:193`) | Not stated whether the last-bottle auto-`drunk` rule fires on this path, nor what happens when the wine is not in the caller's cellar at all |

Both gaps are in [[divergences]] and in [[cellar-states]].

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[glossary]] | *cellar item*, *drink window*, *bottling* — terms this feature depends on meaning precisely |
| [[data-types]] | `wine_type`, dates, ids, and the `in_cellar \| drunk \| gifted` enum on the wire |
| [[error-codes]] | The `401` and permission-denial shapes, the only specified failures |
| [[security]] | The structural rule: no non-admin tool takes a `user_id` (`README.md:155`, `README.md:336`) — and the one place it could leak, `cellar_update`'s item id |
| [[mcp-protocol]] | How a cellar tool is called, and how `tools/list` visibility hides it from a `guest` |
| [[audit-logging]] | Cellar mutations are **not** audited. `audit_log` covers admin actions only (`README.md:345`–`346`). Drinking, gifting, and quantity changes leave no trail. |
| [[divergences]] | Every gap listed on these pages |

## Code shared with other features

None exists yet. The planned shape puts cellar queries in `src/db/queries/cellar.ts` and one file per tool under `src/tools/` (`README.md:362`–`363`) — planned paths, not real ones, which is why they appear here as prose rather than in `code_refs`.

The upsert logic `cellar_add` depends on belongs to [[wine-catalog-index]] and must be shared rather than reimplemented; two implementations of "fill blanks, never clobber" would be a divergence the moment either changed.
