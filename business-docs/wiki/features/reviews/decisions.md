---
feature: reviews
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Reviews — decisions

ADRs that constrain this feature. The ADR is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) | Every point of score maps to a reason string | Review data becomes user-visible prose: `avg 92 over 4 reviews` (`business-docs/wiki/shared/mvp-spec.md:278`). Rating accuracy stops being an internal detail and becomes a claim the user can check, so counting and averaging reviews correctly is a contract, not an implementation choice. |
| [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md) | The engine is deterministic and rule-based | Ratings are inputs to arithmetic, not to a model. The same reviews always produce the same ranking, so a review written today has a predictable, reproducible effect — and a wrong score has a component responsible for it. |
| [ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md) | A wine and a cellar item are separate entities | `reviews.wine_id` points at the shared bottling, not at the caller's bottle. You can review a wine you never owned, and consuming a bottle (`consume: true`) is a second, separate write against `cellar_items`. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | Permissions are enforced at visibility **and** execution | `guest` never sees `review_write` in `tools/list`, and the handler re-checks anyway (`business-docs/wiki/shared/mvp-spec.md:144-151`). |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | No OpenAPI document for an MCP surface | The tool schemas in [[reviews-api]] are the contract; there is no generated spec to defer to. |
| [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) | Stated bounds are `CHECK` constraints as well as Zod schemas | Answers where `rating` 1–100 is enforced: **both**. Zod produces the readable message, the column guarantees the invariant — which matters because aggregate ratings are shown to users as fact in `reasons` strings. It deliberately adds no `UNIQUE (user_id, wine_id)`; that stays a product question |
| [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) | A cellar row is a lot, and a closed lot holds nothing | Binds `review_write consume: true`: the decrement targets a lot, splits it if the review consumes part of it, and triggers the same auto-`drunk` transition as `cellar_update`. Whether consuming with no bottles owned is an error is still open |

## Open questions

Decisions this feature still needs. Each is recorded rather than invented.

| Question | Why it is blocking | Blocked on |
| --- | --- | --- |
| May a user write more than one review of the same wine? | It defines what `avg 92 over 4 reviews` counts, and whether repeat ratings can skew a wine's global aggregate. Nothing in [[mvp-spec]] allows or forbids it. | A product call. This is the highest-value one on the list. |
| Can `review_list` read other users' reviews? | `review:read` is a guest permission (`business-docs/wiki/shared/mvp-spec.md:136`) and aggregates are already cross-user (`business-docs/wiki/shared/mvp-spec.md:189`), but `body_text` is personal prose. See [[reviews-api]]. | A privacy decision, worth an ADR either way. |
| Are reviews editable or deletable? | No `review_update` / `review_delete` exists. If the answer is "no, deliberately", that is an ADR; if it is an oversight, it is a backlog item. | A product call. |
| Does `review_write` with `consume: true` fail when the caller owns no bottles? | Silently ignoring it hides a cellar bug; rejecting it blocks a normal "drunk at a restaurant" review. | A product call, jointly with [[cellar-index]]. |
| Should `drank_on` be checked against the cellar's `drink_until`? | Drinking past the window is exactly the thing the drink-window urgency component exists to prevent (`business-docs/wiki/shared/mvp-spec.md:313`), and reviews are where that outcome is observable. | A product call. |

Nothing above should be resolved by writing plausible prose into these pages. They belong in [[divergences]] until somebody decides.
