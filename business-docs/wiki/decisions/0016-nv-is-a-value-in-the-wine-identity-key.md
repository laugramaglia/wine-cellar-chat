---
adr: 0016
title: A non-vintage wine has no vintage, and the identity key treats that as a value
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
supersedes:
superseded_by:
source: human decision — schema design, 2026-08-29; closes the open question in business-docs/wiki/features/wine-catalog/decisions.md
---

# ADR-0016 — A non-vintage wine has no vintage, and the identity key treats that as a value

**Decision.** `wines.vintage` stays nullable, `null` continues to mean non-vintage, and the natural key is a unique index declared `NULLS NOT DISTINCT` so that two NV bottlings of the same wine collide.

## Context

[[mvp-spec]] declares `UNIQUE (lower(producer), lower(name), vintage)` (`business-docs/wiki/shared/mvp-spec.md:88`) and separately declares `vintage (nullable = NV)` (`business-docs/wiki/shared/mvp-spec.md:86`). In Postgres, under the default `NULLS DISTINCT`, a null never equals a null — so those two lines together mean the constraint **does not constrain non-vintage wines at all**:

- every NV upsert inserts a new row, because the `vintage = $3` lookup can never match an existing NV row;
- duplicates accumulate with no error, silently, in the one table shared by every user;
- the duplicates then split reviews, cellar holdings and aggregate ratings across rows that are the same wine.

Champagne, sherry, most port, and a great many everyday blends are NV. This is not an edge case, and [ADR-0007](0007-upsert-fills-blanks-and-never-overwrites.md) — fill blanks, never overwrite — is built on the assumption that the second call finds the first call's row.

## Decision

```sql
CREATE UNIQUE INDEX wines_identity_uniq
  ON wines (lower(producer), lower(name), vintage) NULLS NOT DISTINCT;
```

`NULLS NOT DISTINCT` (Postgres 15+) makes two null vintages collide, so the constraint means what `business-docs/wiki/shared/mvp-spec.md:88` always intended. `vintage` remains genuinely nullable and no sentinel value exists anywhere in the system.

The matching query `wine_upsert` runs without a `wine_id` must use `IS NOT DISTINCT FROM` on `vintage` rather than `=`, so that lookup and constraint agree. A lookup that uses `=` will miss the row the index would refuse to duplicate — and produce a constraint violation instead of a merge.

The index also covers a null `producer`, which is legal: a wine may be nothing but `{ name }` (`business-docs/wiki/shared/mvp-spec.md:105`). Two rows named "Malbec" with no producer are therefore the same wine as far as the catalogue is concerned. That is the correct reading — an unidentified bottling is not distinguishable — but it means the first agent to add a producer to that row wins it.

## Consequences

- The photo-first workflow works for NV wines: two calls a week apart merge instead of duplicating.
- No sentinel vintage (`0`, `-1`, `9999`) leaks into filters, sort order, or a `vintage_min/max` range in `wine_search`.
- **Requires Postgres 15 or newer.** Neon is well past this; a self-hosted target on 14 would break the migration outright rather than silently.
- Every code path that looks up a wine by its natural key must use `IS NOT DISTINCT FROM`. A plain `=` is the trap this ADR exists to prevent, and it fails at insert time rather than at read time, which is at least loud.
- Rows already duplicated by a pre-existing `NULLS DISTINCT` index cannot be deduplicated by this change; the index will refuse to build until they are merged. There is currently no data, so the cost is zero now and non-zero forever after.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Sentinel vintage (`0` for NV) | Makes the key work, and then every range filter, sort and display has to remember the lie. It leaks into `wine_search`'s `vintage_min/max` on day one. |
| Unique index on `COALESCE(vintage, -1)` | Same lie, hidden one layer deeper, and it makes the index unusable for ordinary `vintage` predicates. |
| Application-level dedupe before insert | Not a constraint. Two concurrent agents both check, both miss, both insert. Exactly the race a shared catalogue invites. |
| Leave it as specified and accept NV duplicates | Splits reviews and holdings across rows that are the same wine, which corrupts the "avg 92 over 4 reviews" reason string the engine is built to produce. |
| Make `vintage` `NOT NULL` and require a placeholder from the caller | Forces the agent to assert something the label does not say. Violates "every field except `name` is optional". |

## Where this is enforced

`src/db/schema.sql` (the index) and `src/db/queries/wines.ts` (the `IS NOT DISTINCT FROM` lookup in the `wine_upsert` path). Cite as `ADR-0016` at both. See [[wine-catalog-index]] and [ADR-0007](0007-upsert-fills-blanks-and-never-overwrites.md).
