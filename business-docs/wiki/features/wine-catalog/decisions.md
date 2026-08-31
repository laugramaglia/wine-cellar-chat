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
| [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) | An unknown scoring component is dropped and the remaining weights renormalized | Owned by [[recommendation-engine-index]], but it is what makes "every field except `name` is optional" (`business-docs/wiki/shared/mvp-spec.md:105`) viable rather than a trap. Without it, a sparse row would rank last forever and the photo-first workflow would punish itself |
| [ADR-0016](../../decisions/0016-nv-is-a-value-in-the-wine-identity-key.md) | A non-vintage wine has no vintage, and the identity key is declared `NULLS NOT DISTINCT` | Closes the feature's oldest open question. It makes `UNIQUE (lower(producer), lower(name), vintage)` (`business-docs/wiki/shared/mvp-spec.md:88`) actually constrain NV rows, which is what [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) silently assumed — the second upsert has to *find* the first one's row. It also obliges every natural-key lookup to use `IS NOT DISTINCT FROM` |
| [ADR-0021](../../decisions/0021-wine-search-is-full-text-plus-trigram.md) | `wine_search` matches a stored weighted `tsvector` plus trigram indexes, always parameterized | Names the matching strategy [[mvp-spec]] never gave, and closes the largest injection surface in the server. It is also why a producer misspelled off a blurry label still finds its wine. It decides matching only — normalization of `region` and `grapes` stays open below |
| [ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md) | Closed enumerations are Postgres enum types; `body`/`tannin`/`acidity` share one `intensity` type | `wine_type`, `sweetness` and the three palate columns become storable-only-if-valid rather than schema comments. The shared type is what lets the engine measure palate distance in SQL, and it keeps `tannin = null` an absent measurement rather than a scale position |
| [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) | Stated bounds are `CHECK` constraints as well as Zod schemas | Gives `tasting_notes` a length bound — unbounded model-written text on a row every user reads — and puts `abv`, `avg_price` and `vintage` in defined ranges. Text arrays default to `'{}'` so [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md)'s fill-blanks merge has one empty to test |

Also in force, from outside this feature: [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) (no OpenAPI document — schemas live in [[wine-catalog-api]]), [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) and [ADR-0001](../../decisions/0001-the-wiki-is-the-source-of-truth.md).

## Open questions

Decisions this feature still needs. Each is currently a silence in [[mvp-spec]], not a choice.

| Question | Blocked on |
| --- | --- |
| **Is there field-level provenance?** `created_by` records the row's creator only. In a shared catalogue merged from many agents, nothing says who claimed a region — and nothing can therefore un-claim it | A product decision: is provenance worth a per-field audit trail, or is the fill-only rule enough? |
| **What happens on an unknown `wine_id`?** Error, no-op, or insert-with-that-id | A handler decision, needed by [[cellar-index]] too |
| **What currency does the catalogue speak?** [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) fixes the *types* — `abv` is `numeric(4,2)` in 0–100, prices are `numeric(10,2)` and never binary floats — but names no currency, and `avg_price` is compared against `price_max` and `prefs.budget_*` | A data decision. A shared catalogue with mixed currencies filters wrongly and silently, and no column records which currency a row means |
| **Is any string normalized besides `producer` and `name`?** `region` and `grapes` are filter keys and are matched as given | A data decision |
| **Can a wine ever be deleted or two duplicates merged?** No tool does either, and wines outlive their creator (`business-docs/wiki/shared/mvp-spec.md:236`). [ADR-0019](../../decisions/0019-bottles-are-held-as-lots.md) makes `cellar_items.wine_id` `ON DELETE RESTRICT`, so a wine somebody owns cannot be dropped even by hand | A product decision. Merging matters more than deleting: [ADR-0016](../../decisions/0016-nv-is-a-value-in-the-wine-identity-key.md) prevents *new* duplicates but cannot merge ones created before it, or ones that differ by a typo in `producer` |

An open question recorded here is worth more than an ADR invented to fill the table. All five are also listed in [[divergences]].
