---
feature: recommendation-engine
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Recommendation engine — decisions

ADRs that constrain this feature. The ADR itself is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md) | The engine is deterministic and rule-based: hard filters plus a weighted sum, no LLM inside it. | This *is* the feature's architecture. It fixes the two-stage shape, forbids an embedding or model step, and puts the weights in one tunable config object. It also caps the ceiling: quality is bounded by the pairing table and the weights. |
| [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) | Every point of score maps to a reason string; `reasons` is the contract, not decoration. | Makes [[recommendation-engine-copy]] a specification rather than a style guide. A component that cannot be explained is removed rather than scored silently — so adding a scoring input costs a sentence of copy. It is also what makes undefined tie-breaking a violation and not a detail: a silent ordering influence is forbidden. |
| [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) | An unknown component is dropped and the remaining weights renormalized. | The renormalization rule at the centre of [[recommendation-engine-states]]. Absent must never be implemented as `0`. It is also the source of the feature's sharpest known flaw: scores computed over different component sets are ranked against each other as if comparable. |
| [ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md) | A wine and a cellar item are separate entities. | Makes `source: "cellar" \| "catalog" \| "both"` a filter over one candidate set rather than two code paths, and makes `in_cellar` / `quantity` per-caller computed fields on every result entry. |

Decisions that reach this feature but are owned elsewhere:

| ADR | Owner | Effect here |
| --- | --- | --- |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | project-wide | [[recommendation-engine-api]] carries the tool contract itself; there is no OpenAPI document to defer to. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | [[authorization-index]] | `wine_recommend` is hidden from `tools/list` without `recommend`, **and** re-checks it in the handler. |
| [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) | [[wine-catalog-index]] | Determines how completely a wine is described over time, which determines how many components the engine can score it on. |

## Open questions

Decisions this feature still needs. Each is a genuine gap in `README.md`, not a detail
awaiting implementation — an implementer must *invent* an answer, and two implementers
would invent different ones.

| Question | Why it is blocked, and what blocks it | Weight at stake |
| --- | --- | --- |
| **What is the numeric distance between adjacent points on the 5-point scale?** `low \| medium_minus \| medium \| medium_plus \| high` (`README.md:88`) is an ordered enum with no metric. Palate fit is "distance on the 5-point scale" (`README.md:295`). | Nobody has chosen. Linear `0, 0.25, 0.5, 0.75, 1` is the obvious default but is a decision, not a reading of the spec. It also needs a rule for `tannin = null`, which is normal for whites (`README.md:89`) — presumably "drop the sub-component", per ADR-0006. | **0.25** |
| **What is in the built-in food→style pairing table?** Three examples and an ellipsis: red meat→tannic red, shellfish→high-acid white, spicy→off-dry aromatic (`README.md:294`). | The table is the largest input to the heaviest component and is entirely undocumented. Planned home `src/engine/pairings.ts` (`README.md:368`). Someone must write and own the list — it is a domain judgement, not an implementation detail. | **0.30** |
| **How are `reasons` strings produced?** ADR-0005 makes them the contract but says nothing about their form. | Templates, per-component literals, or a shared catalogue are three different maintenance stories. Without a decision the strings scatter and nobody can review the claims the product makes. | all |
| **How are ties broken?** | Determinism (`README.md:303`) demands a total order. Any implicit key is an unexplained ordering influence, forbidden by ADR-0005. A stated key — say `drink_until` ascending, then `id` — would need its own reason string or an explicit exemption. | ordering |
| **What happens to a wine with zero usable components?** | Renormalization divides by a zero weight sum, and the entry would carry no reasons, breaking `README.md:407`. ADR-0006 names this as a degenerate case it does not address. Options: exclude it, floor the score, or give it a "we know almost nothing about this bottle" reason. | edge |
| **Does `use_prefs: false` also disable the `avoid` and `dislikes` hard filters?** | Read literally it does, since both filters are defined over `prefs` (`README.md:286-287`). `avoid` carries allergens (`README.md:68`), so this is a safety question, not a preference one. | filters |

These are recorded rather than resolved on purpose. An open question written down is worth
more than an ADR invented to fill the table — and each of these needs a human who knows
what the product should do, not an author reading a specification.

Every one of them is also mirrored in [[divergences]] so a reader who never opens this
page still meets them.
