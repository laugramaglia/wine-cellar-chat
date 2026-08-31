---
adr: 0015
title: Closed enumerations are database types, and the palate scale is one type
status: accepted
date: 2026-08-29
affects:
  - authorization
  - user-administration
  - wine-catalog
  - cellar
  - preferences
  - recommendation-engine
supersedes:
superseded_by:
source: human decision — schema design, 2026-08-29; resolves the gap at business-docs/wiki/shared/mvp-spec.md:71-104
---

# ADR-0015 — Closed enumerations are database types, and the palate scale is one type

**Decision.** Every closed enumeration in [[data-types]] is declared as a Postgres `ENUM` type, and `body`, `tannin` and `acidity` share a single type named `intensity`.

## Context

[[mvp-spec]] gives its enumerations as SQL comments (`business-docs/wiki/shared/mvp-spec.md:71-72`, `business-docs/wiki/shared/mvp-spec.md:98-104`). A comment constrains nothing. The most sensitive column in the system is `users.role`, and a value outside the enum there has no defined behaviour anywhere — the gap is recorded in [[authorization-decisions]] and [[divergences]].

The palate scale has a second problem. `body`, `tannin` and `acidity` are three columns over one 5-point ordered scale, and "palate fit" (weight 0.25) is defined as a *distance along that scale* (`business-docs/wiki/shared/mvp-spec.md:307`). Three independently declared `text` columns give the database no notion that the values are ordered, so every comparison has to be reimplemented in application code, and nothing stops `medium_plus` in one column and `Medium+` in another.

## Decision

Declare `user_role`, `user_status`, `wine_type`, `sweetness`, `cellar_status` and `audit_action` as enum types. Declare **one** type, `intensity`, with values `low | medium_minus | medium | medium_plus | high`, and use it for all three of `body`, `tannin` and `acidity` on both `wines` and `user_prefs`.

Declaration order is significant and is the scale's order: `intensity` values compare with `<` and `>` in SQL, and that ordering is the scale the engine measures distance along.

A `text` column with a `CHECK` constraint is not an acceptable substitute for these, because the point is to have one named domain shared across tables rather than a constraint repeated per column.

## Consequences

- An out-of-enum `role`, `status` or `wine_type` is now impossible to store, not merely undocumented.
- `ORDER BY body` and `body >= 'medium'` work in SQL, so palate-fit distance can be computed in the query rather than in TypeScript.
- Using one type for three columns makes it a type error to invent a fourth scale position for tannin alone.
- **Adding a value now requires a migration.** `ALTER TYPE … ADD VALUE` is cheap but it is a deploy, not a config change. This is the intended cost: these enumerations are closed by design, and one that needs frequent extension was misclassified.
- `tannin` stays nullable. A null is an absent measurement, never a scale position — see [ADR-0006](0006-missing-data-never-penalizes.md), which is what makes the absence safe.
- Enum values arrive from the wire as lowercase strings and need no mapping layer, because the type's labels *are* the wire values.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| `text` + `CHECK` per column | Repeats the value list at every column, gives no ordering, and drifts silently when one copy is updated. |
| A lookup table with a foreign key | Correct for an open vocabulary; here it buys a join per column for a list that must not change without a decision. |
| Validate in Zod only | Leaves the database accepting anything a migration, a script, or `psql` writes. `users.role` deserves better than one layer. |
| Three separate types for body/tannin/acidity | Loses the one property the engine needs: that they are the same scale, so a distance on one means the same as a distance on another. |
| Integers 1–5 for the palate scale | Ordering comes free, but the wire format is specified as lowercase strings and the mapping would have to live somewhere. Enum ordering gives both. |

## Where this is enforced

`src/db/schema.sql` — the `CREATE TYPE` block. Cite as `ADR-0015`. The TypeScript unions in `src/permissions.ts` and each tool's Zod schema must be kept identical to it; see [[data-types]].
