---
adr: 0007
title: wine_upsert fills blanks and never overwrites
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
supersedes:
superseded_by:
source: business-docs/wiki/shared/mvp-spec.md:174
---

# ADR-0007 — `wine_upsert` fills blanks and never overwrites

**Decision.** `wine_upsert` merges by filling null fields only. It never replaces a non-null value unless the caller passes `overwrite: true`.

## Context

Wines are built up over time by an agent: two fields from a blurry photo today, grapes and region next week. The catalogue is also **shared across all users** (`business-docs/wiki/shared/mvp-spec.md:61`), so one user's careless call can degrade data another user entered.

The agent supplying the fields is a language model, which will sometimes confidently produce a wrong region.

## Decision

Fill blanks, never clobber. `overwrite: true` is the explicit escape hatch. The response reports `created: bool` and `fields_filled: string[]` so the caller learns what actually changed.

The definition of done tests it directly: calling `wine_upsert` again with more fields fills blanks and clobbers nothing (`business-docs/wiki/shared/mvp-spec.md:419`).

## Consequences

- Repeated calls are safe, which is what makes "collect more data over time" viable.
- The agent gets a truthful diff back rather than having to guess whether it helped.
- Wrong data, once stored, is sticky — correcting it requires knowing about `overwrite: true`.
- No field-level provenance: after two calls nothing records which caller supplied which field. `created_by` names only the wine's creator.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Last write wins | In a shared catalogue with LLM-supplied fields, this is data loss on a timer. |
| Always require `overwrite` to be explicit per field | More faithful, more API surface; the blanket flag is enough for the MVP. |
| Per-user overlays on shared wines | Solves it properly and is far more than the MVP needs. |

## Where this is enforced

`src/tools/wine_upsert.ts`, `src/db/queries/wines.ts` (planned). Cite as `ADR-0007`.
