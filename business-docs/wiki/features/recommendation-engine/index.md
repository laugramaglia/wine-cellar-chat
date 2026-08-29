---
feature: recommendation-engine
page: index
status: stub
source_of_truth: wiki
code_refs:
  - README.md:235
  - README.md:278
updated: 2026-08-29
---

# Recommendation engine

The engine answers one question — *what should I drink* — for a user who asked it in
their own words through an MCP client. It takes a free-text occasion and food, some
optional hard constraints, and the caller's stored palate profile, and returns a ranked
list of wines with a score and an explanation for every entry. It starts at the
`wine_recommend` tool call and ends at the returned list; it does not fetch, enrich, or
write anything.

Two stages, in this order: **hard filters**, then a **weighted score** (`README.md:280`).
A wine that fails a filter is absent from the result entirely; a wine that survives is
ranked, never rejected, by the score.

> **Unverified.** Nothing on this page has been checked against a running program. There
> is no engine code in this repository — see [[divergences]]. Every claim traces to
> `README.md`, which is a specification, not an implementation.

## At a glance

| | |
| --- | --- |
| Entry points | the `wine_recommend` MCP tool (`README.md:237`), callable by `admin`, `member` and `guest` under the `recommend` permission (`README.md:126`) |
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
| `two-stage-pipeline` | Scoring is hard filters first, then a weighted score. Filters remove; the score only orders. | `filters → score` | `README.md:280` |
| `component-range-0-1` | Every scoring component yields a value in `0..1`. | `0..1` | `README.md:290` |
| `weight-food-pairing` | Food pairing weight. | `0.30` | `README.md:294` |
| `weight-palate-fit` | Palate fit weight. | `0.25` | `README.md:295` |
| `weight-personal-history` | Personal history weight. | `0.20` | `README.md:296` |
| `weight-preference-match` | Preference match weight. | `0.15` | `README.md:297` |
| `weight-budget-fit` | Budget fit weight. | `0.05` | `README.md:298` |
| `weight-drink-window-urgency` | Drink-window urgency weight. Cellar candidates only. | `0.05` | `README.md:299` |
| `weights-sum-to-one` | The six stated weights sum to exactly 1.00 before any renormalization. | `1.00` | derived from `README.md:294-299` |
| `renormalize-on-missing-component` | An unknown component is dropped and the remaining weights are renormalized. Missing data never lowers a score. | drop + renormalize | `README.md:304-305` |
| `deterministic-no-llm` | Same input, same output. No LLM inside the engine. | deterministic | `README.md:303` |
| `every-point-has-a-reason` | A component that cannot be explained in a sentence is not scored. | contract | `README.md:306` |
| `at-least-one-reason` | Every returned recommendation carries at least one non-empty `reasons` entry. | `len(reasons) >= 1` | `README.md:407` |
| `weights-in-one-config` | Weights live in one config object, tunable without touching the logic. | one object | `README.md:307` |
| `source-default-both` | `source` defaults to `both` when the request omits it. | `"both"` | `README.md:249` |
| `use-prefs-default-true` | `use_prefs` defaults to `true`; stored `user_prefs` apply unless the caller opts out. | `true` | `README.md:250` |
| `source-cellar-requires-stock` | Under `source: "cellar"` a wine must have `quantity > 0` and `status = in_cellar`. | `quantity > 0 AND status = in_cellar` | `README.md:285` |
| `request-beats-dislikes` | A grape or region in `prefs.dislikes` is filtered out **unless** the request explicitly asks for it, in which case the request wins. | request wins | `README.md:287-288` |
| `avoid-is-absolute` | Anything in `prefs.avoid` is filtered out. No stated override. | hard filter | `README.md:286` |
| `budget-inside-band-is-one` | A price inside the budget band scores `1.0`, decaying outside it. | `1.0` inside | `README.md:298` |
| `incomplete-wine-is-recommendable` | A wine with only `{ name, producer }` must still be recommendable. | required | `README.md:408` |

## Not real yet

**None of this exists.** There is no `src/` directory in the repository. The engine is
planned as three files — `src/engine/recommend.ts` (filters + scoring),
`src/engine/weights.ts` (tunable config), `src/engine/pairings.ts` (built-in food→style
table) — listed in the code-shape sketch at `README.md:365-368`. Those paths are named
here as *plans*; they are deliberately absent from `code_refs` because they do not exist.

Specifically absent, and worth naming because a reader will otherwise assume it:

| Thing | State |
| --- | --- |
| The built-in food→style pairing table | Described by three examples only (`README.md:294`). Never enumerated. It is not a table anyone can implement from the spec. |
| The 5-point palate distance metric | The scale is named (`README.md:88`); the numeric distance between adjacent points is not. Palate fit is 25% of the score and rests on it. |
| Reason-string generation | The contract requires the strings (`README.md:306`); nothing says how they are produced. |
| Tie-breaking | Undefined. Two wines with an equal score have no specified order, which contradicts determinism (`README.md:303`) unless the sort is stable over a defined key. |
| A wine with zero usable components | Undefined. Renormalizing over an empty weight set divides by zero. See [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md). |
