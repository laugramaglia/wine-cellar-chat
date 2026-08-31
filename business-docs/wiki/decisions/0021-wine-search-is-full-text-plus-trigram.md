---
adr: 0021
title: wine_search matches on a stored tsvector plus trigram indexes, always parameterized
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
  - recommendation-engine
supersedes:
superseded_by:
source: human decision — schema design, 2026-08-29; closes the open question in business-docs/wiki/features/wine-catalog/decisions.md
---

# ADR-0021 — `wine_search` matches on a stored tsvector plus trigram indexes, always parameterized

**Decision.** Free-text search runs against a generated, stored `tsvector` column on `wines`, with trigram indexes on `name` and `producer` for misspellings. Every value reaching SQL is a bound parameter; no query string is ever concatenated.

## Context

`wine_search` takes `query` as "free text over name/producer/region/notes" (`business-docs/wiki/shared/mvp-spec.md:182`) and [[mvp-spec]] never says how that becomes SQL. [[divergences]] and [[security]] both flag it: nothing states the query is parameterized and no matching strategy is named. **It is the largest injection surface in the server** — a free-text field written by a language model, reaching the database, in a system where the same table is shared by every user.

The matching strategy is not merely a performance question either. The input comes from an agent reading a label in a photo. It arrives misspelled, half-remembered, or with the producer and the wine name in the wrong order. `ILIKE '%…%'` cannot index, cannot rank, and cannot survive a transposed letter.

## Decision

`wines` carries a generated stored column:

```sql
search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(name,'')),     'A') ||
  setweight(to_tsvector('simple', coalesce(producer,'')), 'A') ||
  setweight(to_tsvector('simple', coalesce(region,'')),   'B') ||
  setweight(to_tsvector('simple', coalesce(subregion,'')),'B') ||
  setweight(to_tsvector('simple', coalesce(country,'')),  'C') ||
  setweight(to_tsvector('simple', coalesce(tasting_notes,'')), 'D')
) STORED
```

indexed with GIN, plus `gin_trgm_ops` indexes on `name` and `producer`.

Three properties are load-bearing:

- **`'simple'`, not `'english'`.** Wine vocabulary is multilingual — *Château*, *Rioja*, *Grüner Veltliner* — and English stemming mangles it. `simple` lowercases and splits on word boundaries and does nothing clever, which is what a proper-noun corpus wants.
- **Weighted.** A wine named *Malbec* outranks one that merely mentions malbec in its notes, because `name` and `producer` are weight A and `tasting_notes` is weight D. `ts_rank` then supplies a deterministic ordering.
- **Generated, not a trigger.** The column cannot fall out of sync with the row, and [ADR-0007](0007-upsert-fills-blanks-and-never-overwrites.md)'s incremental fills update it automatically — a wine that gains a region next week becomes findable by region next week, with no reindexing step to forget.

Trigram indexes cover what full-text cannot: `similarity(producer, $1)` finds *Catena* from `Katena`. The query uses full-text first and falls back to trigram similarity above a threshold.

All of it is parameterized — `websearch_to_tsquery('simple', $1)`, `similarity(name, $1)`. **No branch of `wine_search` builds SQL by string concatenation**, including the optional structured filters, which are composed as a fixed set of `AND` clauses with placeholders rather than assembled from caller-supplied fragments.

`limit` is clamped server-side to 50 (`business-docs/wiki/shared/mvp-spec.md:185`) before it reaches the query.

## Consequences

- Search is indexed and stays indexed as the catalogue grows, and ranking is deterministic — the same requirement [ADR-0004](0004-a-deterministic-rule-based-engine.md) places on the engine.
- A misspelled producer off a blurry label still finds the wine, which is the workflow the whole project is built around.
- The injection surface is closed by construction rather than by review, and the rule is short enough to check in a diff: if a query in `src/db/queries/wines.ts` contains an interpolated value, it is a bug.
- **Requires `pg_trgm`.** One extension, available on Neon, created in the migration.
- The stored `tsvector` costs disk and a little write time per upsert. On a catalogue of this size that is not a consideration; it is noted so nobody rediscovers it as a surprise.
- `to_tsvector` over `tasting_notes` is another reason that column is length-bounded ([ADR-0020](0020-bounds-are-enforced-in-the-database-too.md)).
- This ADR decides **matching**, not **normalization**. Whether `grapes`, `region` and `country` are normalized on write is still open in [[wine-catalog-decisions]]; search is case-insensitive regardless, but the structured `region` filter is not, and that gap remains.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| `ILIKE '%query%'` | Unindexable, unrankable, and defeated by a single transposed letter. The obvious choice and the wrong one. |
| Full-text alone | No tolerance for the misspellings this input is guaranteed to contain. |
| Trigram alone | Ranks badly across multiple fields and has no notion of which field matched. |
| `'english'` text search configuration | Stems a multilingual proper-noun corpus into nonsense. |
| A trigger-maintained `tsvector` | Can drift; one write path that forgets to fire it produces a silently unfindable wine. |
| Embeddings / pgvector | Explicitly out of scope for the MVP (`business-docs/wiki/shared/mvp-spec.md:52`) and non-deterministic in ranking. Named as post-MVP work. |

## Where this is enforced

`src/db/schema.sql` (the generated column and its indexes) and `src/db/queries/wines.ts` (`wine_search`). Cite as `ADR-0021` above the search query. See [[security]] and [[wine-catalog-api]].
