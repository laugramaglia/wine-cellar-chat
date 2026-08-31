---
feature: preferences
page: states
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:79
  - business-docs/wiki/shared/mvp-spec.md:300
updated: 2026-08-29
---

# Preferences — states

The state is one database row, `user_prefs`, keyed on `user_id` (`business-docs/wiki/shared/mvp-spec.md:79`). There
is no in-memory state machine, no draft, no session copy — a client reads the row or
writes the row.

> **Unverified.** Specification only. No schema file and no code exist in this repository.

## State shape

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `user_id` | PK | the owning user; the only key | required |
| `likes` | `jsonb` | `{ grapes: [], regions: [], styles: [] }` — soft, scored (`business-docs/wiki/shared/mvp-spec.md:81`, `business-docs/wiki/shared/mvp-spec.md:311`) | unspecified |
| `dislikes` | `jsonb` | same shape; `.grapes` and `.regions` are hard filters (`business-docs/wiki/shared/mvp-spec.md:301`) | unspecified |
| `budget_min` | number | lower bound of the budget band (`business-docs/wiki/shared/mvp-spec.md:79`) | unspecified |
| `budget_max` | number | upper bound; `"$28 is inside your $0–40 budget"` is the only currency hint anywhere (`business-docs/wiki/shared/mvp-spec.md:280`) | unspecified |
| `sweetness` | enum | target: `bone_dry \| dry \| off_dry \| medium_sweet \| sweet` (`business-docs/wiki/shared/mvp-spec.md:101`) | unspecified |
| `body` | enum | target: `low \| medium_minus \| medium \| medium_plus \| high` (`business-docs/wiki/shared/mvp-spec.md:102`) | unspecified |
| `tannin` | enum | same 5-point scale; `null` for most whites on the wine side (`business-docs/wiki/shared/mvp-spec.md:102-103`) | unspecified |
| `acidity` | enum | same 5-point scale (`business-docs/wiki/shared/mvp-spec.md:102`) | unspecified |
| `avoid` | `jsonb` | allergens, `"no oak"`, `"no sulfites added"` — hard filter (`business-docs/wiki/shared/mvp-spec.md:82`, `business-docs/wiki/shared/mvp-spec.md:300`) | unspecified |
| `notes` | text | free text. **Nothing in the specification reads it.** | unspecified |
| `updated_at` | timestamp | last write (`business-docs/wiki/shared/mvp-spec.md:80`) | set on write |

Every field except `user_id` is optional in practice: a user is created by `user_create`
with no prefs at all (`business-docs/wiki/shared/mvp-spec.md:221`), and a missing scoring input must not penalize
anything — [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md).

## Row states

| State | How it is reached | What `prefs_get` returns | What the engine does |
| --- | --- | --- | --- |
| **No row** | a newly created user who has never called `prefs_set` (`business-docs/wiki/shared/mvp-spec.md:221`) | **undefined** | **undefined** — presumably every prefs-driven filter and component is simply absent |
| **Partial** | a merge that set some fields (`business-docs/wiki/shared/mvp-spec.md:216`) | the row | applies the fields present; drops and renormalizes the rest (`business-docs/wiki/shared/mvp-spec.md:318-319`) |
| **Full** | all fields set | the row | applies everything |

The **No row** state is a real specification gap, not an editorial one: it is the state
every user starts in.

## Transitions

| From | Event | To | Guard |
| --- | --- | --- | --- |
| no row | `prefs_set` (any) | partial or full | caller holds `prefs:write` (`business-docs/wiki/shared/mvp-spec.md:139`) |
| partial | `prefs_set` without `replace` | partial or full, merged | `prefs:write` |
| partial / full | `prefs_set` with `replace: true` | exactly what was sent | `prefs:write` (`business-docs/wiki/shared/mvp-spec.md:216`) |
| any | `prefs_get` | unchanged | caller holds `prefs:read` (`business-docs/wiki/shared/mvp-spec.md:138`) |
| any | user suspended or deleted | the row is unreachable, not cleared | `hard: true` deletion drops cellar items and reviews; prefs are not mentioned (`business-docs/wiki/shared/mvp-spec.md:234-236`) |

Merging a nested `jsonb` field is **not specified** — whether `{likes: {grapes: [...]}}`
appends to or replaces the existing array changes the outcome materially. See
[[preferences-index]].

## Resolution order

This is the rule most likely to be got wrong, so it is written as an ordered list. For
one candidate wine, under `use_prefs: true`:

1. **`use_prefs: false`?** Then stop — no part of the stored profile applies
   (`business-docs/wiki/shared/mvp-spec.md:264`). Default is `true`.
2. **`avoid` matches?** The wine is removed from the result set entirely
   (`business-docs/wiki/shared/mvp-spec.md:300`). No stated override, by the request or by anything else.
3. **`dislikes.grapes` or `dislikes.regions` matches?** The wine is removed —
   **unless the request explicitly asked for that grape or region, in which case the
   request wins** and the wine survives (`business-docs/wiki/shared/mvp-spec.md:301-302`). The stored dislike is not
   modified; the override is per-request.
4. **Surviving wines are scored**, never rejected. `likes` contributes `0.15`, palate
   targets `0.25`, budget band `0.05` (`business-docs/wiki/shared/mvp-spec.md:309-312`).
5. **A field the user never set** is a missing component: dropped, and the remaining
   weights renormalized (`business-docs/wiki/shared/mvp-spec.md:318-319`).

Filters remove, scores order. A wine cannot be filtered out by a low score, and it cannot
be rescued by a high one.

## Unresolved precedence

| Question | Status |
| --- | --- |
| Grape in both `likes` and `dislikes` | Unspecified. Step 3 runs before step 4, which *implies* the dislike wins, but nothing says so. |
| `dislikes.styles` | Named in the shape (`business-docs/wiki/shared/mvp-spec.md:81`), absent from the filter list (`business-docs/wiki/shared/mvp-spec.md:301`). Stored and, as far as the spec goes, never read. |
| Request `price_max` vs stored `budget_max` | The request price bounds are hard filters (`business-docs/wiki/shared/mvp-spec.md:298`); the stored budget is a `0.05` score component (`business-docs/wiki/shared/mvp-spec.md:312`). They are different mechanisms, not a conflict — but nothing says the stored budget is *not* also a filter. |
| `avoid` matching mechanism | No wine field records oak, allergens or additives (`business-docs/wiki/shared/mvp-spec.md:84-87`). See [[preferences-index]]. |

## Lifetime

The row lives in Postgres (`business-docs/wiki/shared/mvp-spec.md:42`) for the life of the user. It outlives every
token, every client and every session — that is the point. Nothing caches it: the
`McpAgent` Durable Object carries `{ userId, role, tokenId, permissions }` as `props`
(`business-docs/wiki/shared/mvp-spec.md:347`), not preferences.
