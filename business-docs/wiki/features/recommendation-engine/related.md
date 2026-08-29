---
feature: recommendation-engine
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Recommendation engine — related

This feature owns almost no data. It reads four other features' tables and turns them into
a ranking — so nearly every rule it *appears* to state about a wine, a bottle, a rating or
a preference is actually owned next door.

## Features

| Feature | Relationship |
| --- | --- |
| [[wine-catalog-index]] | **Consumes.** Supplies every candidate under `source: "catalog"` and every `wine` object in the result. Owns `food_pairings`, `avg_price`, `grapes`, `style_tags`, and the palate columns `sweetness`/`body`/`tannin`/`acidity` (`README.md:70-73`) — four of the six scoring components read fields it owns. Also owns the rule that every field except `name` is optional (`README.md:91`), which is *why* [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) exists. |
| [[cellar-index]] | **Consumes.** Supplies candidates under `source: "cellar"`, and `in_cellar` / `quantity` on every entry. Owns `quantity`, `status`, and the `drink_from` / `drink_until` window (`README.md:76-78`) that the drink-window-urgency component reads. The `quantity > 0 AND status = in_cellar` test (`README.md:285`) is stated here as a filter but the fields are the cellar's. |
| [[preferences-index]] | **Consumes.** Supplies `user_prefs` when `use_prefs` is true. Owns `likes`, `dislikes`, `budget_min`/`budget_max`, the palate targets, and `avoid` (`README.md:65-68`). Two of its fields — `avoid` and `dislikes` — act as **hard filters** here, so a preferences edit silently changes what the engine can return. |
| [[reviews-index]] | **Consumes.** Supplies the caller's rating history for the personal-history component (`README.md:296`). Owns `rating` and its 1–100 range (`README.md:80`). The `avg 92 over 4 reviews` reason string (`README.md:264`) asserts an aggregate over its data whose definition neither feature states — see [[recommendation-engine-copy]]. |
| [[authorization-index]] | **Gates.** `wine_recommend` requires the `recommend` permission (`README.md:126`), held by all three roles, and enforced in two layers ([ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md)). A narrowed token `scopes` list is the only way a caller loses it. |
| [[authentication-index]] | **Gates.** Resolves the caller from the bearer token into `props`; the engine never reads a user id from tool input (`README.md:336-337`). |
| [[user-administration-index]] | Indirect. A suspended user's tokens fail at the edge (`README.md:144`), so no recommendation runs. |
| [[token-administration-index]] | Indirect. A token with `scopes` narrower than `recommend` cannot call this tool (`README.md:113-114`). |

**Nothing consumes this feature.** `wine_recommend` is a leaf: its output goes to the MCP
client and nowhere else. No other tool calls it, and nothing is written back — including
nothing learned. Accepting or ignoring a recommendation changes no future recommendation.

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[glossary]] | *Wine* vs *cellar item*, *hard filter* vs *component*, *reason*, *penalty* — terms this page uses precisely. |
| [[data-types]] | The palate enums (`README.md:86-89`), `wine_type`, and the shared wine row shape returned inside every result entry. |
| [[error-codes]] | The `401` edge rejections and the permission-denied message shape this feature inherits. |
| [[divergences]] | Holds all six open questions from [[recommendation-engine-decisions]] plus the standing "nothing is implemented" divergence. |
| [[mcp-protocol]] | How a tool call arrives, and why `tools/list` filtering is a UX affordance rather than a boundary. |
| [[security]] | Why "you can only touch your own cellar" is structural here — there is no `user_id` argument to abuse. |
| [[audit-logging]] | Deliberately **not** applicable: `audit_log` records admin actions only (`README.md:345-347`). Recommendations are not logged, so there is no record of what the engine advised. |

## Code shared with other features

None exists — there is no code. Planned, from the code-shape sketch (`README.md:353-372`):

| Planned | Owner | Shared with |
| --- | --- | --- |
| `src/engine/recommend.ts` | this feature | nothing |
| `src/engine/weights.ts` | this feature | nothing — one config object per [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md) |
| `src/engine/pairings.ts` | this feature | nothing today. If [[wine-catalog-index]] ever validates `food_pairings` against a vocabulary, this table is where that vocabulary already lives. |
| `src/db/queries/wines.ts`, `cellar.ts`, `reviews.ts`, `prefs.ts` (`README.md:362`) | the four features named above | read by the engine |

The pairing-table row is the one to watch. It is a domain vocabulary that two features would
want, currently scoped as a private detail of one — the shape duplicated logic starts in.
