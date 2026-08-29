---
feature: wine-catalog
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Wine catalogue — decisions

ADRs that constrain this feature. The ADR itself is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) | `wine_upsert` fills blanks and never overwrites a non-null field unless `overwrite: true` | **The central decision here.** It is what makes a shared, agent-written catalogue safe: one careless call cannot degrade data someone else entered. It also produces `created` and `fields_filled`, and it is why a refused value is silent |
| [ADR-0008](../../decisions/0008-wine-and-cellar-item-are-separate.md) | A wine and a cellar item are separate entities | Draws this feature's boundary. `wines` rows carry no ownership, quantity, price paid, or drink window — those are [[cellar-index]]. It is also why `owned`/`quantity` must be computed per caller rather than stored |
| [ADR-0009](../../decisions/0009-vision-happens-client-side.md) | Vision happens client-side; the server never sees images | Defines the input contract: structured fields only, no image parameter, no blob storage. Extraction quality is the client's property and varies between clients — the server cannot improve it |
| [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) | An unknown scoring component is dropped and the remaining weights renormalized | Owned by [[recommendation-engine-index]], but it is what makes "every field except `name` is optional" (`README.md:91`) viable rather than a trap. Without it, a sparse row would rank last forever and the photo-first workflow would punish itself |

Also in force, from outside this feature: [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) (no OpenAPI document — schemas live in [[wine-catalog-api]]), [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) and [ADR-0001](../../decisions/0001-the-wiki-is-the-source-of-truth.md).

## Open questions

Decisions this feature still needs. Each is currently a silence in `README.md`, not a choice.

| Question | Blocked on |
| --- | --- |
| **How is a non-vintage wine identified?** `vintage` is null for NV and participates in the unique key, so in Postgres the constraint does not constrain NV rows and an equality match never finds one. `NULLS NOT DISTINCT`, a sentinel vintage, or `IS NOT DISTINCT FROM` — pick one before the migration is written | A schema decision |
| **Is there field-level provenance?** `created_by` records the row's creator only. In a shared catalogue merged from many agents, nothing says who claimed a region — and nothing can therefore un-claim it | A product decision: is provenance worth a per-field audit trail, or is the fill-only rule enough? |
| **What happens on an unknown `wine_id`?** Error, no-op, or insert-with-that-id | A handler decision, needed by [[cellar-index]] too |
| **How is `wine_search.query` turned into SQL?** Nothing states that it is parameterized, and nothing names the matching strategy (`ILIKE`, trigram, full-text) | A security and correctness decision — see [[security]] |
| **What units does the catalogue speak?** `abv` and `avg_price` have no unit, range or currency, and both are compared against user-supplied numbers | A data decision. A shared catalogue with mixed currencies filters wrongly and silently |
| **Is any string normalized besides `producer` and `name`?** `region` and `grapes` are filter keys and are matched as given | A data decision |
| **Can a wine ever be deleted or two duplicates merged?** No tool does either, and wines outlive their creator (`README.md:222`) | A product decision |

An open question recorded here is worth more than an ADR invented to fill the table. All seven are also listed in [[divergences]].
