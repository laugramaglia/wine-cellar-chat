---
feature: recommendation-engine
page: states
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:304
  - business-docs/wiki/shared/mvp-spec.md:318
updated: 2026-08-29
---

# Recommendation engine — states

This feature holds no persistent state and no UI state. What follows is the **per-candidate
scoring state** that exists for the duration of one `wine_recommend` call, plus the
lifecycle each candidate wine moves through.

## Candidate lifecycle

| State | Meaning | Leaves the pipeline? |
| --- | --- | --- |
| `candidate` | In the set selected by `source` (`business-docs/wiki/shared/mvp-spec.md:263`) | no |
| `filtered_out` | Failed a hard filter — absent from the result entirely (`business-docs/wiki/shared/mvp-spec.md:296`) | yes, terminal |
| `scored` | Survived filters, has a score in `0..1` and at least one reason | no |
| `ranked` | Ordered by score and inside `limit` | no |
| `truncated` | Scored, but below the `limit` cut | yes, terminal |
| `returned` | In the response array (`business-docs/wiki/shared/mvp-spec.md:271-285`) | yes, terminal |

`filtered_out` and `truncated` are indistinguishable to the caller: both are simply
absent. Nothing in the response says *why* a wine is missing, only why a present one is
present. That asymmetry is a real product consequence of
[ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) — reasons
explain inclusion, never exclusion.

## Transitions

| From | Event | To | Guard |
| --- | --- | --- | --- |
| `candidate` | fails any hard filter | `filtered_out` | any of the four filters in [[recommendation-engine-flow]] |
| `candidate` | `source: "cellar"` and no stock | `filtered_out` | `quantity > 0 AND status = in_cellar` fails (`business-docs/wiki/shared/mvp-spec.md:299`) |
| `candidate` | in `prefs.dislikes`, request silent | `filtered_out` | `business-docs/wiki/shared/mvp-spec.md:301` |
| `candidate` | in `prefs.dislikes`, request asks for it | `scored` | request wins (`business-docs/wiki/shared/mvp-spec.md:302`) |
| `candidate` | passes all filters | `scored` | weighted sum over available components (`business-docs/wiki/shared/mvp-spec.md:304`) |
| `scored` | sort by score, apply `limit` | `ranked` \| `truncated` | tie-break undefined |
| `ranked` | serialize | `returned` | must carry ≥ 1 reason (`business-docs/wiki/shared/mvp-spec.md:421`) |

## Scoring state per candidate

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `food_pairing` | `0..1` \| absent | Request `food` vs. `food_pairings` plus the built-in table (`business-docs/wiki/shared/mvp-spec.md:308`) | absent when the request has no `food` or the wine has no `food_pairings` |
| `palate_fit` | `0..1` \| absent | Distance on the 5-point scale between `prefs` and the wine (`business-docs/wiki/shared/mvp-spec.md:309`) | absent when `use_prefs: false`, no prefs row, or the wine's palate fields are null |
| `personal_history` | `0..1` \| absent | Caller's ratings of the wine, grape, region, producer (`business-docs/wiki/shared/mvp-spec.md:310`) | absent when the caller has no relevant reviews |
| `preference_match` | `0..1` \| absent | Overlap with `prefs.likes` and the request's soft `grapes` (`business-docs/wiki/shared/mvp-spec.md:311`) | absent when neither is present |
| `budget_fit` | `0..1` \| absent | `1.0` inside the band, decaying outside (`business-docs/wiki/shared/mvp-spec.md:312`) | absent when the wine has no `avg_price` or there is no band |
| `drink_window_urgency` | `0..1` \| absent | Cellar bottles closing their window nudge up (`business-docs/wiki/shared/mvp-spec.md:313`) | absent for catalogue-only candidates and for cellar items with no `drink_until` |
| `score` | `0..1` | Weighted sum of the present components, renormalized (`business-docs/wiki/shared/mvp-spec.md:304`, `business-docs/wiki/shared/mvp-spec.md:318-319`) | — |
| `reasons` | `string[]` | One per contributing component (`business-docs/wiki/shared/mvp-spec.md:277-282`) | never empty (`business-docs/wiki/shared/mvp-spec.md:421`) |
| `penalties` | `string[]` | Stated downward pulls (`business-docs/wiki/shared/mvp-spec.md:283`) | may be empty |
| `in_cellar` | `bool` | Whether the caller owns it (`business-docs/wiki/shared/mvp-spec.md:274`) | — |
| `quantity` | `int` | Bottles held (`business-docs/wiki/shared/mvp-spec.md:275`) | — |

**Absent is not zero.** That distinction is the whole of
[ADR-0006](../../decisions/0006-missing-data-never-penalizes.md), and it is the single
easiest thing to get wrong in an implementation: a numeric field defaulted to `0` rather
than left unset silently reverses the decision.

## Resolution order

### Score

```
present = { c : c.value is not absent }
score   = Σ (weight[c] × value[c]) / Σ weight[c]     for c in present
```

The denominator is **the sum of the weights of the present components**, not `1.0` and not
the count of components. Getting the denominator wrong is the classic version of this bug:
dividing by 6, or by 1.0, reintroduces exactly the penalty
[ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) removes.

`Σ weight[c] = 0` when nothing is present. Undefined — see below.

### Dislikes

```
if wine matches prefs.dislikes.grapes|regions:
    if request explicitly named that grape or region:  keep     # business-docs/wiki/shared/mvp-spec.md:302
    else:                                              filter   # business-docs/wiki/shared/mvp-spec.md:301
```

### `source`

| `source` | Candidate set | Drink-window component |
| --- | --- | --- |
| `"cellar"` | owned, `quantity > 0`, `status = in_cellar` | available |
| `"catalog"` | the shared `wines` table | absent, renormalized away |
| `"both"` (default) | union | available for the cellar-backed entries only |

## Lifetime

Per request, in memory, discarded when the tool call returns. Nothing survives it: no
cache, no session, no Durable Object state. `McpAgent` is a Durable Object
(`business-docs/wiki/shared/mvp-spec.md:389`), so a durable place to keep state exists — the engine deliberately uses
none of it, which is what makes `deterministic-no-llm` observable rather than merely
claimed.

## Undefined states

| State | Problem |
| --- | --- |
| Zero present components | `Σ weight[c] = 0`. The formula divides by zero, and the entry could carry no reasons, violating `business-docs/wiki/shared/mvp-spec.md:421`. Neither an error nor a fallback score is specified. |
| Equal scores | No tie-break key is given. Any implicit one is an unexplained ordering influence, which [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) forbids. |
| The same wine in both cellar and catalogue under `source: "both"` | Whether it is deduplicated is unspecified. |
