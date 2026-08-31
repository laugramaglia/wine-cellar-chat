---
feature: recommendation-engine
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:249
  - business-docs/wiki/shared/mvp-spec.md:292
updated: 2026-08-29
---

# Recommendation engine

The engine answers one question — *what should I drink* — for a user who asked it in
their own words through an MCP client. It takes a free-text occasion and food, some
optional hard constraints, and the caller's stored palate profile, and returns a ranked
list of wines with a score and an explanation for every entry. It starts at the
`wine_recommend` tool call and ends at the returned list; it does not fetch, enrich, or
write anything.

Two stages, in this order: **hard filters**, then a **weighted score** (`business-docs/wiki/shared/mvp-spec.md:294`).
A wine that fails a filter is absent from the result entirely; a wine that survives is
ranked, never rejected, by the score.

> **Unverified.** Nothing on this page has been checked against a running program. There
> is no engine code in this repository — see [[divergences]]. Every claim traces to
> [[mvp-spec]], which is a specification, not an implementation.

## At a glance

| | |
| --- | --- |
| Entry points | the `wine_recommend` MCP tool (`business-docs/wiki/shared/mvp-spec.md:251`), callable by `admin`, `member` and `guest` under the `recommend` permission (`business-docs/wiki/shared/mvp-spec.md:140`) |
| Owns | the two-stage pipeline, the six weighted components and their weights, the renormalization rule, the `reasons` / `penalties` contract, the `source` selector, request-beats-dislikes precedence |
| Does not own | wine fields ([[wine-catalog-index]]), stored preferences ([[preferences-index]]), rating history ([[reviews-index]]), ownership and quantity ([[cellar-index]]), permission enforcement ([[authorization-index]]) |
| Status | stub — specified, not built |

## Pages

- [[recommendation-engine-flow]] — the two stages, in order
- [[recommendation-engine-screens]] — there are none; the MCP client is the UI
- [[recommendation-engine-states]] — the scoring state per candidate wine
- [[recommendation-engine-errors]] — error catalogue
- [[recommendation-engine-copy]] — the `reasons` and `penalties` strings
- [[recommendation-engine-validations]] — input validation
- [[recommendation-engine-api]] — the `wine_recommend` tool contract
- [[recommendation-engine-decisions]] — the ADRs that apply
- [[recommendation-engine-related]] — neighbours and shared concerns

## Rules

Indexed machine-readable form: `business-docs/rules/recommendation-engine.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `two-stage-pipeline` | Scoring is hard filters first, then a weighted score. Filters remove; the score only orders. | `filters → score` | `business-docs/wiki/shared/mvp-spec.md:294` |
| `component-range-0-1` | Every scoring component yields a value in `0..1`. | `0..1` | `business-docs/wiki/shared/mvp-spec.md:304` |
| `weight-food-pairing` | Food pairing weight. | `0.30` | `business-docs/wiki/shared/mvp-spec.md:308` |
| `weight-palate-fit` | Palate fit weight. | `0.25` | `business-docs/wiki/shared/mvp-spec.md:309` |
| `weight-personal-history` | Personal history weight. | `0.20` | `business-docs/wiki/shared/mvp-spec.md:310` |
| `weight-preference-match` | Preference match weight. | `0.15` | `business-docs/wiki/shared/mvp-spec.md:311` |
| `weight-budget-fit` | Budget fit weight. | `0.05` | `business-docs/wiki/shared/mvp-spec.md:312` |
| `weight-drink-window-urgency` | Drink-window urgency weight. Cellar candidates only. | `0.05` | `business-docs/wiki/shared/mvp-spec.md:313` |
| `weights-sum-to-one` | The six stated weights sum to exactly 1.00 before any renormalization. | `1.00` | derived from `business-docs/wiki/shared/mvp-spec.md:308-313` |
| `renormalize-on-missing-component` | An unknown component is dropped and the remaining weights are renormalized. Missing data never lowers a score. | drop + renormalize | `business-docs/wiki/shared/mvp-spec.md:318-319` |
| `deterministic-no-llm` | Same input, same output. No LLM inside the engine. | deterministic | `business-docs/wiki/shared/mvp-spec.md:317` |
| `every-point-has-a-reason` | A component that cannot be explained in a sentence is not scored. | contract | `business-docs/wiki/shared/mvp-spec.md:320` |
| `at-least-one-reason` | Every returned recommendation carries at least one non-empty `reasons` entry. | `len(reasons) >= 1` | `business-docs/wiki/shared/mvp-spec.md:421` |
| `weights-in-one-config` | Weights live in one config object, tunable without touching the logic. | one object | `business-docs/wiki/shared/mvp-spec.md:321` |
| `source-default-both` | `source` defaults to `both` when the request omits it. | `"both"` | `business-docs/wiki/shared/mvp-spec.md:263` |
| `use-prefs-default-true` | `use_prefs` defaults to `true`; stored `user_prefs` apply unless the caller opts out. | `true` | `business-docs/wiki/shared/mvp-spec.md:264` |
| `source-cellar-requires-stock` | Under `source: "cellar"` a wine must have `quantity > 0` and `status = in_cellar`. | `quantity > 0 AND status = in_cellar` | `business-docs/wiki/shared/mvp-spec.md:299` |
| `request-beats-dislikes` | A grape or region in `prefs.dislikes` is filtered out **unless** the request explicitly asks for it, in which case the request wins. | request wins | `business-docs/wiki/shared/mvp-spec.md:301-302` |
| `avoid-is-absolute` | Anything in `prefs.avoid` is filtered out. No stated override. | hard filter | `business-docs/wiki/shared/mvp-spec.md:300` |
| `budget-inside-band-is-one` | A price inside the budget band scores `1.0`, decaying outside it. | `1.0` inside | `business-docs/wiki/shared/mvp-spec.md:312` |
| `incomplete-wine-is-recommendable` | A wine with only `{ name, producer }` must still be recommendable. | required | `business-docs/wiki/shared/mvp-spec.md:422` |
| `palate-scale-is-one-ordered-type` | `body`, `tannin` and `acidity` share one Postgres `intensity` type whose declaration order is the scale's order, so palate fit can compare and order in SQL. This supplies the **order**; the numeric distance between adjacent points is still undecided. | `low < medium_minus < medium < medium_plus < high` | [ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md) |
| `candidate-retrieval-is-deterministic` | Candidate retrieval ranks by `ts_rank` over a stored weighted `tsvector`, extending the engine's determinism requirement to the step that feeds it candidates. | `ts_rank` | [ADR-0021](../../decisions/0021-wine-search-is-full-text-plus-trigram.md), [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md) |

## Not real yet

**None of this exists.** There is no `src/` directory in the repository. The engine is
planned as three files — `src/engine/recommend.ts` (filters + scoring),
`src/engine/weights.ts` (tunable config), `src/engine/pairings.ts` (built-in food→style
table) — listed in the code-shape sketch at `business-docs/wiki/shared/mvp-spec.md:379-382`. Those paths are named
here as *plans*; they are deliberately absent from `code_refs` because they do not exist.

Specifically absent, and worth naming because a reader will otherwise assume it:

| Thing | State |
| --- | --- |
| The built-in food→style pairing table | Described by three examples only (`business-docs/wiki/shared/mvp-spec.md:308`). Never enumerated. It is not a table anyone can implement from the spec. |
| The 5-point palate distance metric | The scale is named (`business-docs/wiki/shared/mvp-spec.md:102`); the numeric distance between adjacent points is not. Palate fit is 25% of the score and rests on it. |
| Reason-string generation | The contract requires the strings (`business-docs/wiki/shared/mvp-spec.md:320`); nothing says how they are produced. |
| Tie-breaking | Undefined. Two wines with an equal score have no specified order, which contradicts determinism (`business-docs/wiki/shared/mvp-spec.md:317`) unless the sort is stable over a defined key. |
| A wine with zero usable components | Undefined. Renormalizing over an empty weight set divides by zero. See [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md). |
