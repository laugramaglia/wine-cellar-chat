---
adr: 0020
title: Bounds are enforced in the database as well as in the tool schema
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
  - cellar
  - reviews
  - preferences
  - user-administration
supersedes:
superseded_by:
source: human decision — schema design, 2026-08-29; resolves the unassigned-enforcement gaps in business-docs/wiki/shared/divergences.md
---

# ADR-0020 — Bounds are enforced in the database as well as in the tool schema

**Decision.** Every stated bound — `rating` 1–100, `quantity >= 0`, `drink_from <= drink_until`, a maximum length on every free-text column — is a `CHECK` constraint in the database *in addition to* the tool's Zod schema. Neither layer is allowed to be the only one.

## Context

[[mvp-spec]] states bounds without ever saying who enforces them. `rating` is given as 1–100 twice (`business-docs/wiki/shared/mvp-spec.md:94`, `business-docs/wiki/shared/mvp-spec.md:206`) and assigned to neither layer — the gap is recorded verbatim in [[data-types]] and [[divergences]]. Other bounds are simply absent: no `drink_from <= drink_until` ordering, no behaviour when `cellar_update` takes `quantity` below zero, and **no length bound on any string** — notably `tasting_notes`, which is unbounded agent-written text on a row every user shares.

The last one is the sharpest. Writers here are language models. A model that loops, or that helpfully pastes an entire wikipedia article into `tasting_notes`, writes a row that every subsequent `wine_get` and every recommendation loads into somebody else's context window. There is no user in the loop to notice.

The tempting answer is "Zod validates it". Zod validates what arrives through a tool call. It does not validate `scripts/bootstrap-admin.ts`, a migration, a repair script, a future second entry point, or the `psql` session someone opens to fix something at 3am.

## Decision

Bounds live in both layers, deliberately and redundantly:

| Bound | Column |
| --- | --- |
| `rating BETWEEN 1 AND 100` | `reviews.rating` (`smallint`) |
| `quantity >= 0` | `cellar_items.quantity` |
| `drink_from <= drink_until` when both present | `cellar_items` |
| `budget_min <= budget_max` when both present | `user_prefs` |
| `abv BETWEEN 0 AND 100`, `avg_price >= 0`, `purchase_price >= 0` | `wines`, `cellar_items` |
| `vintage BETWEEN 1800 AND 2100` | `wines` |
| length limits: 300 name/producer, 200 region/location/occasion, 4000 notes, 8000 `tasting_notes` and `body_text`, 64 token label | every free-text column |
| jsonb shape: `likes`/`dislikes` are objects, `avoid` is an array | `user_prefs` |

Numbers that represent money or measurement are `numeric`, never `float`. `avg_price` and `purchase_price` are `numeric(10,2)`; `abv` is `numeric(4,2)`. Budget filtering compares user-supplied numbers against these, and binary floating point makes `28.00 <= 28` a question rather than a fact.

Text array columns (`grapes`, `style_tags`, `food_pairings`) default to `'{}'` and are `NOT NULL`, so there is exactly one empty representation for the fill-blanks merge of [ADR-0007](0007-upsert-fills-blanks-and-never-overwrites.md) to test and for the engine's overlap operators to meet. The same applies to `user_prefs.likes`, `dislikes` and `avoid`, which default to their empty shapes — which also settles what a user with no stored preferences looks like: the same shape as everyone else, empty.

The Zod schema stays, and it is the layer that produces a **good error message**. The database is the layer that guarantees the invariant. Where they disagree, the database is right and the Zod schema is the bug.

## Consequences

- A rating of 0 or 101 cannot exist in the table, whatever wrote it. Aggregate ratings — shown to users as fact in `reasons` strings — have a guaranteed range.
- One model writing 400KB of tasting notes fails on its own row instead of degrading every future read of that wine.
- **The two layers can drift**, and the constraint that fires second gives the worse error. This is accepted: a Zod bound that is looser than the `CHECK` surfaces as a database error to an agent, which is ugly but safe. The reverse — a looser database — is invisible, which is why the database bound is the one that must exist.
- Every bound is one more thing to change in two places. The list above is short and closed on purpose; open-ended validation belongs in Zod alone.
- Bounds are **not** a substitute for the deliberate silences. This ADR does not decide whether one user may review a wine twice — no unique constraint is added on `(user_id, wine_id)` — because that changes what "avg 92 over 4 reviews" counts and is a product question, not a schema one. It stays open in [[reviews-index]].

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Zod only | Covers exactly one entry point. Bootstrap scripts, migrations and manual repairs write to the same tables and bypass it entirely. |
| Database only | Gives an agent a Postgres error string instead of a usable message, and moves validation off the tool contract where the client can read it. |
| No length bounds, trust the model | The writers are language models and the reader is another model's context window. Unbounded free text on a shared row is a denial-of-service with no attacker required. |
| `float8` for prices | Rounding surprises in budget filtering, on a comparison the user reads back as "$28 is inside your $0–40 budget". |
| Nullable arrays and jsonb | Two empty representations, so every merge and every overlap test needs a null guard, and one of them will be missed. |

## Where this is enforced

`src/db/schema.sql` (the `CHECK` constraints and column types) and each tool's Zod schema under `src/tools/`. Cite as `ADR-0020` where a Zod bound mirrors a database one. See [[data-types]].
