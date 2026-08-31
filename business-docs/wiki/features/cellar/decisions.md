---
feature: cellar
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Cellar — decisions

ADRs that constrain this feature. The ADR itself is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md) | A wine and a cellar item are separate entities | **Central.** It is the reason this feature exists. `cellar_items` holds per-user ownership; `wines` holds the shared bottling. Everything this feature owns — quantity, price paid, location, drink window, lifecycle — lives on the item precisely because it cannot live on a row two people share. |
| [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) | `wine_upsert` fills blanks and never overwrites | `cellar_add` accepts inline wine fields, "which upsert first" (`business-docs/wiki/shared/mvp-spec.md:193`), so a `cellar:write` call inherits catalogue merge semantics — including that a conflicting field is silently dropped rather than rejected. See [[cellar-flow]] and [[cellar-errors]]. |
| [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) | Missing data never penalizes a wine | The cellar's own fields are almost all optional. A bottle added with nothing but a quantity must still be recommendable from `source: "cellar"`; drink-window urgency (0.05) simply drops out when there is no window. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | Two-layer permission enforcement | A `guest` never sees the cellar tools, and every cellar handler re-checks anyway. Visibility is UX; execution is the boundary. |
| [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md) | A deterministic rule-based engine | Makes the cellar's `quantity > 0 AND status = in_cellar` guard a hard filter with a stated meaning rather than a model's judgement (`business-docs/wiki/shared/mvp-spec.md:299`). |
| [ADR-0001](../../decisions/0001-the-wiki-is-the-source-of-truth.md) | The wiki is the source of truth | Why this page set exists and why every claim on it cites a line. |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | No OpenAPI for an MCP surface | Why [[cellar-api]] carries the tool contracts itself. |
| [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) | A `cellar_items` row is a lot; many rows per wine are allowed, and a non-`in_cellar` row must hold `quantity = 0` | **Reshapes this feature.** It makes `purchase_price`, `purchase_date`, `location` and the drink window per-acquisition rather than averaged, settles partial gifting as a row split, and makes the last-bottle auto-transition a property of the lot — so it fires on `review_write consume: true` too. The cost lands on [[cellar-api]]: `cellar_list` must now aggregate |
| [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) | Stated bounds are `CHECK` constraints as well as Zod schemas | `quantity >= 0` and `drink_from <= drink_until` become impossible to violate. An inverted window used to break both `ready_to_drink` and `drink_soon` silently |
| [ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md) | Closed enumerations are Postgres enum types | `cellar_status` is `in_cellar | drunk | gifted` in the database, so a fourth lifecycle state cannot be introduced by a write — only by a migration and a decision |

## Open questions

Decisions this feature still needs. Each is a real gap in [[mvp-spec]], not an invented one; the full list with consequences is in [[cellar-states]].

| Question | Blocked on |
| --- | --- |
| What does `cellar_update` *report* when a decrement would take `quantity` below zero? | A product call. [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) settles the storage question — the `CHECK` makes a negative holding impossible — so what remains is whether the tool clamps and says so, or rejects. |
| What is the default `N` for `drink_soon`? | A product call. Without it the filter has no defined behaviour when omitted. |
| What does `ready_to_drink` mean for an item with a null `drink_from` or `drink_until`? | A product call. Both fields are optional, so this is the common case for a bottle added from a photo. |
| Can a lot marked `drunk` by mistake be corrected? | A product call. [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) settles the invariant — a closed lot holds no bottles — so the question is now only whether there is a correction path or whether the user re-adds. |
| What currency and unit is `purchase_price`? | A product call. It is compared against `price_max`/`price_min` and `prefs.budget_*` with no stated unit. |
| Is `cellar_update` scoped by `user_id` from `props`? | Should be an ADR, not an implementation detail — it is where the structural ownership guarantee could leak. See [[security]]. |

None of these warrant an ADR yet — an ADR records a decision that closed off an alternative, and no alternative has been closed off. Recording the questions is the honest state.
