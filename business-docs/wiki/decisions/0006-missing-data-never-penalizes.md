---
adr: 0006
title: Missing data never penalizes a wine
status: accepted
date: 2026-08-29
affects:
  - recommendation-engine
  - wine-catalog
supersedes:
superseded_by:
source: README.md:306
---

# ADR-0006 — Missing data never penalizes a wine

**Decision.** An unknown scoring component is dropped and the remaining weights are renormalized. A half-filled wine competes on what is known about it.

## Context

Every field of a wine except `name` is optional (`README.md:91`), because the intended entry path is a photo of a label read by an agent that may extract two fields. If absent data scored zero, a newly-photographed bottle would rank below every fully-described one forever, and the catalogue would punish the exact workflow the product is built around.

## Decision

Drop unknown components; renormalize the rest. A wine with only `{ name, producer }` must still be storable, findable, and recommendable (`README.md:409`).

## Consequences

- The photo → `wine_upsert` → `cellar_add` path works from day one with minimal data.
- Rewards filling data in later without punishing not having done so yet.
- Scores are not comparable across wines with different known-field sets — a 0.82 from two components is not a 0.82 from six. Nothing in the specification acknowledges this, and it should be stated wherever scores are surfaced.
- A wine with *no* usable component is a degenerate case the specification does not address.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Score missing data as 0 | Buries every newly-added wine; breaks the core workflow. |
| Score missing data as 0.5 | Invents a fact. A wine is not "medium-bodied" because nobody said. |
| Filter out incomplete wines | Directly contradicts the definition of done (`README.md:409`). |

## Where this is enforced

`src/engine/recommend.ts` (planned). Cite as `ADR-0006`.
