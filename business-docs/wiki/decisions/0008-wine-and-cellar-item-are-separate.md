---
adr: 0008
title: A wine and a cellar item are separate entities
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
  - cellar
supersedes:
superseded_by:
source: README.md:45
---

# ADR-0008 — A wine and a cellar item are separate entities

**Decision.** `wines` holds abstract bottlings shared by everyone. `cellar_items` holds bottles a specific user owns. They are different tables and different concepts.

## Context

The engine must answer two different questions: *"recommend me a Malbec"*, which ranges over everything known, and *"what should I open tonight"*, which ranges only over bottles actually in the house (`README.md:51`).

Collapsing the two would mean either a per-user catalogue — so nobody benefits from anyone else's data entry — or ownership fields on a shared row, which cannot represent two people owning the same wine.

## Decision

Two tables. `cellar_items.wine_id` references the shared bottling; quantity, price paid, location, and drink window live on the item.

## Consequences

- `wine_recommend` takes `source: "cellar" | "catalog" | "both"` and the split makes that a filter rather than a different code path.
- Catalogue data entry is shared work — one user describing a wine helps all of them.
- Ownership is a join, so search results need an `owned` flag and `quantity` computed per caller (`README.md:175`).
- Sharpens [[ADR-0007]]: because the catalogue is shared, careless writes hurt other people, which is why the merge is conservative.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| One table with an owner | Cannot express two users owning the same wine, and duplicates catalogue data per user. |
| Per-user catalogues | Every user re-enters every wine. No shared benefit. |

## Where this is enforced

`src/db/schema.sql` (planned). Cite as `ADR-0008`.
