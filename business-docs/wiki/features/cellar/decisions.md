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
| [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) | `wine_upsert` fills blanks and never overwrites | `cellar_add` accepts inline wine fields, "which upsert first" (`README.md:179`), so a `cellar:write` call inherits catalogue merge semantics — including that a conflicting field is silently dropped rather than rejected. See [[cellar-flow]] and [[cellar-errors]]. |
| [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) | Missing data never penalizes a wine | The cellar's own fields are almost all optional. A bottle added with nothing but a quantity must still be recommendable from `source: "cellar"`; drink-window urgency (0.05) simply drops out when there is no window. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | Two-layer permission enforcement | A `guest` never sees the cellar tools, and every cellar handler re-checks anyway. Visibility is UX; execution is the boundary. |
| [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md) | A deterministic rule-based engine | Makes the cellar's `quantity > 0 AND status = in_cellar` guard a hard filter with a stated meaning rather than a model's judgement (`README.md:285`). |
| [ADR-0001](../../decisions/0001-the-wiki-is-the-source-of-truth.md) | The wiki is the source of truth | Why this page set exists and why every claim on it cites a line. |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | No OpenAPI for an MCP surface | Why [[cellar-api]] carries the tool contracts itself. |

## Open questions

Decisions this feature still needs. Each is a real gap in `README.md`, not an invented one; the full list with consequences is in [[cellar-states]].

| Question | Blocked on |
| --- | --- |
| What happens when `cellar_update` would take `quantity` below zero — clamp, reject, or store? | A product call. Affects the last-bottle rule's interaction with concurrent decrements. |
| What is the default `N` for `drink_soon`? | A product call. Without it the filter has no defined behaviour when omitted. |
| What does `ready_to_drink` mean for an item with a null `drink_from` or `drink_until`? | A product call. Both fields are optional, so this is the common case for a bottle added from a photo. |
| Is `drunk` terminal, or can an item be resurrected? | A product call. "Marked it drunk by mistake" is a real user action with no described path. |
| Partial gifting: decrement `quantity`, or split the row? | A modelling call. `status` is per row, so it cannot describe some-but-not-all bottles. |
| What currency and unit is `purchase_price`? | A product call. It is compared against `price_max`/`price_min` and `prefs.budget_*` with no stated unit. |
| Is `cellar_update` scoped by `user_id` from `props`? | Should be an ADR, not an implementation detail — it is where the structural ownership guarantee could leak. See [[security]]. |
| Does the last-bottle auto-transition also fire on the `review_write` `consume: true` decrement? | A correctness call. Stated only under `cellar_update` (`README.md:184`). |

None of these warrant an ADR yet — an ADR records a decision that closed off an alternative, and no alternative has been closed off. Recording the questions is the honest state.
