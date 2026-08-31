---
feature: recommendation-engine
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:292
  - business-docs/wiki/shared/mvp-spec.md:296
  - business-docs/wiki/shared/mvp-spec.md:304
updated: 2026-08-29
---

# Recommendation engine — flow

## Happy path

1. The user asks their agent something like *"what goes with lamb tonight, under $40, from
   what I have?"* (`business-docs/wiki/shared/mvp-spec.md:27`). The agent maps that onto a `wine_recommend` call.
2. The Worker resolves the caller from the bearer token and checks the `recommend`
   permission (`business-docs/wiki/shared/mvp-spec.md:140`) — see [[authorization-index]]. All three roles hold it.
3. The engine assembles the candidate set from `source` — `cellar`, `catalog` or `both`,
   defaulting to `both` (`business-docs/wiki/shared/mvp-spec.md:263`).
4. Unless `use_prefs: false`, the caller's stored `user_prefs` row is loaded and applied
   (`business-docs/wiki/shared/mvp-spec.md:264`). See [[preferences-index]].
5. **Stage one — hard filters.** Each candidate is tested against the filter list below. A
   wine that fails any one of them is not in the result at all (`business-docs/wiki/shared/mvp-spec.md:296`).
6. **Stage two — weighted score.** Each survivor is scored on six components, each in
   `0..1`, summed against their weights and normalized (`business-docs/wiki/shared/mvp-spec.md:304`).
7. Components with no usable data are dropped and the remaining weights renormalized
   (`business-docs/wiki/shared/mvp-spec.md:318-319`, [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md)).
8. Every contributing component emits a `reasons` string; anything that pulled the score
   down emits a `penalties` string (`business-docs/wiki/shared/mvp-spec.md:277-284`,
   [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md)).
9. The list is returned ranked by score, truncated to `limit`, each entry carrying `wine`,
   `score`, `in_cellar`, `quantity`, `reasons`, `penalties` (`business-docs/wiki/shared/mvp-spec.md:271-285`).

## Stage one — hard filters

Order is not specified and does not affect the outcome: these are conjunctive. All must
pass.

| # | Filter | Condition | Source |
| --- | --- | --- | --- |
| 1 | Explicit request constraints | `wine_type`, `price_max`, `price_min`, `region`, `exclude_wine_ids` | `business-docs/wiki/shared/mvp-spec.md:298` |
| 2 | Cellar source | under `source: "cellar"`, `quantity > 0` **and** `status = in_cellar` | `business-docs/wiki/shared/mvp-spec.md:299` |
| 3 | Avoid list | anything in `prefs.avoid` — allergens, "no oak", "no sulfites added" | `business-docs/wiki/shared/mvp-spec.md:300`, `business-docs/wiki/shared/mvp-spec.md:82` |
| 4 | Dislikes | anything in `prefs.dislikes.grapes` or `prefs.dislikes.regions` | `business-docs/wiki/shared/mvp-spec.md:301` |

### Precedence: the request beats stored dislikes

Filter 4 has one stated override, and it is the only precedence rule in the engine:

> a wine matching `prefs.dislikes.grapes` / `.regions` is filtered out **unless the request
> explicitly asks for it, in which case the request wins** (`business-docs/wiki/shared/mvp-spec.md:301-302`).

Stated precisely:

| Situation | Outcome |
| --- | --- |
| `dislikes.grapes` contains `malbec`, request omits `grapes` | Malbecs filtered out |
| `dislikes.grapes` contains `malbec`, request has `grapes: ["malbec"]` | Malbecs **kept** — the request wins |
| `dislikes.regions` contains `Mendoza`, request has `region: "Mendoza"` | Mendoza wines **kept** |
| `avoid` contains `oak`, request asks for an oaked style | **Undefined.** No override is stated for `avoid`; it reads as absolute (`business-docs/wiki/shared/mvp-spec.md:300`), which is defensible since `avoid` carries allergens. |

The `grapes` request field is described as a *soft preference* (`business-docs/wiki/shared/mvp-spec.md:260`) and also
feeds the `preference-match` component at weight 0.15 (`business-docs/wiki/shared/mvp-spec.md:311`). So the same field
is soft for scoring and hard-overriding for the dislikes filter. That is deliberate and
worth stating, because it is not obvious from either line alone.

## Stage two — weighted score

| Component | Weight | Input | Source |
| --- | --- | --- | --- |
| Food pairing | 0.30 | request `food` vs. the wine's `food_pairings`, plus a built-in food→style table | `business-docs/wiki/shared/mvp-spec.md:308` |
| Palate fit | 0.25 | `prefs` sweetness/body/tannin/acidity vs. the wine's, distance on the 5-point scale | `business-docs/wiki/shared/mvp-spec.md:309` |
| Personal history | 0.20 | the caller's past ratings of this wine, its grape, region, producer — a grape rated 90+ pulls hard | `business-docs/wiki/shared/mvp-spec.md:310` |
| Preference match | 0.15 | overlap with `prefs.likes` and with the request's soft `grapes` | `business-docs/wiki/shared/mvp-spec.md:311` |
| Budget fit | 0.05 | inside the band scores `1.0`, decaying outside it | `business-docs/wiki/shared/mvp-spec.md:312` |
| Drink-window urgency | 0.05 | cellar only — bottles closing their window are nudged up | `business-docs/wiki/shared/mvp-spec.md:313` |

The six weights sum to `1.00`.

### Renormalization

An unknown component is **dropped**, not scored zero, and the remaining weights are
renormalized so they again sum to 1 (`business-docs/wiki/shared/mvp-spec.md:318-319`). Worked through: a wine with no
`food_pairings` and no known palate fields is scored on personal history, preference
match, budget and drink window only — weights `0.20 / 0.15 / 0.05 / 0.05`, summing to
`0.45`, each divided by `0.45` to give `0.444 / 0.333 / 0.111 / 0.111`.

The consequence, which nothing in the specification acknowledges: **scores are not
comparable across wines with different known-field sets.** A `0.82` from two components is
not the same claim as a `0.82` from six, yet they are ranked against each other in one
list. Recorded in [[divergences]] and in
[ADR-0006](../../decisions/0006-missing-data-never-penalizes.md).

## Preconditions

- A valid, non-revoked, non-expired bearer token whose user is `active` (`business-docs/wiki/shared/mvp-spec.md:343-345`).
- The `recommend` permission (`business-docs/wiki/shared/mvp-spec.md:140`).
- Nothing else. There need not be any wines, any cellar items, any reviews, or a
  `user_prefs` row: `use_prefs` merely has nothing to apply, and every prefs-dependent
  component drops out under the renormalization rule.

## Postconditions

- Nothing is persisted. `wine_recommend` is a pure read; it writes no row and mutates no
  state. The only side effect anywhere on the request is the best-effort `last_used_at`
  touch on the token (`business-docs/wiki/shared/mvp-spec.md:355`), which belongs to [[authentication-index]].
- The result is not cached, journaled, or fed back into preferences. Asking twice with the
  same input returns the same list (`business-docs/wiki/shared/mvp-spec.md:317`), which is the determinism rule, not a
  cache.

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| `source: "cellar"` | request asks for it | Candidates limited to owned, in-stock bottles (`business-docs/wiki/shared/mvp-spec.md:299`). Drink-window urgency can contribute. |
| `source: "catalog"` | request asks for it | The whole shared catalogue. Drink-window urgency is inapplicable and drops out (`business-docs/wiki/shared/mvp-spec.md:313`). |
| `source: "both"` | default (`business-docs/wiki/shared/mvp-spec.md:263`) | Both sets. Entries carry `in_cellar` and `quantity` so the agent can tell them apart (`business-docs/wiki/shared/mvp-spec.md:274-275`). Whether a wine present in both appears once or twice is unspecified. |
| `use_prefs: false` | caller opts out | Palate fit and preference match lose their `prefs` input, and the `avoid` / `dislikes` filters have nothing to apply. **Unstated:** whether `use_prefs: false` also disables those two hard filters. Read literally it does — the filters are defined over `prefs` — but the spec never says it. |
| No survivor passes the filters | over-constrained request | An empty list. Nothing in the spec says this is an error, so it is a normal empty result — see [[recommendation-engine-errors]]. |
| Two wines score equally | common with few components | **Undefined.** See below. |

## Timing and automatic behaviour

There is none. No timers, no retries, no debounce, no background refresh, no
auto-invalidation. The engine runs synchronously inside one tool call and returns.
`limit` defaults to `5` in the example request (`business-docs/wiki/shared/mvp-spec.md:265`); no maximum is stated,
unlike `wine_search`, which caps at 50 (`business-docs/wiki/shared/mvp-spec.md:185`).

## What is deliberately not here

| Not done | Why |
| --- | --- |
| No LLM or embedding step inside the engine | [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md). The caller is already a model; a second guess about a first guess cannot be argued with. |
| No "wines like this one" semantic search | Explicitly post-MVP (`business-docs/wiki/shared/mvp-spec.md:50`, `business-docs/wiki/shared/mvp-spec.md:434`). |
| No external price or rating lookup | Out of scope (`business-docs/wiki/shared/mvp-spec.md:51`). `avg_price` is whatever the catalogue holds. |
| No penalty for missing data | [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md). |
| No silent scoring influence | [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) forbids any ordering influence that cannot be named in a reason string. This is what makes undefined tie-breaking a real problem rather than a detail. |

## Open questions in this flow

| Gap | Why it matters |
| --- | --- |
| The 5-point scale `low` / `medium_minus` / `medium` / `medium_plus` / `high` (`business-docs/wiki/shared/mvp-spec.md:102`) has no defined numeric distance between adjacent points. | Palate fit is weight 0.25. Two reasonable implementations — linear `0,0.25,0.5,0.75,1` versus anything else — give different rankings. |
| The built-in food→style table is given as three examples and an ellipsis (`business-docs/wiki/shared/mvp-spec.md:308`). | Food pairing is the heaviest component at 0.30 and its largest input is undocumented. |
| Tie-breaking between equal scores is unspecified. | Determinism (`business-docs/wiki/shared/mvp-spec.md:317`) requires *some* total order. Any implicit one — insertion order, `id`, `created_at` — is an ordering influence with no reason string, which [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) forbids. |
| A wine with **zero** usable components. | Renormalization divides by a weight sum of `0`. And it could carry no `reasons`, breaking `business-docs/wiki/shared/mvp-spec.md:421`. |
| Whether `use_prefs: false` disables the `avoid` and `dislikes` hard filters. | An allergen filter silently switched off by a scoring flag would be a safety bug. |
