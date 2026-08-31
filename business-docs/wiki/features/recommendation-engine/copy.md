---
feature: recommendation-engine
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:277
  - business-docs/wiki/shared/mvp-spec.md:287
updated: 2026-08-29
---

# Recommendation engine — copy

The user-visible strings of this feature **are** the `reasons` and `penalties` arrays.
There is no other copy: no labels, no buttons, no empty states, because there is no UI
([[recommendation-engine-screens]]). Every sentence the engine writes is a factual claim
about the user's own data that they can check and disagree with — which is the stated point
of the whole thing (`business-docs/wiki/shared/mvp-spec.md:287-288`).

That makes this page unusually load-bearing for a copy page. These strings are not
decoration to be reworded by a designer; they are the explanation contract,
[ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md).

## The specified strings

Every string below is an **example from the specification**, not a defined template. The
spec gives exactly five, all inside one illustrative result (`business-docs/wiki/shared/mvp-spec.md:277-284`).

| Key | Source text | Placeholders | Component |
| --- | --- | --- | --- |
| `reason.personal-history.grape` | `Malbec matches a grape you rate highly (avg 92 over 4 reviews)` | grape name, mean rating, review count | Personal history, 0.20 (`business-docs/wiki/shared/mvp-spec.md:278`) |
| `reason.food-pairing.listed` | `Food pairing: lamb is listed in this wine's pairings` | requested food | Food pairing, 0.30 (`business-docs/wiki/shared/mvp-spec.md:279`) |
| `reason.budget.inside-band` | `$28 is inside your $0–40 budget` | price, band min, band max | Budget fit, 0.05 (`business-docs/wiki/shared/mvp-spec.md:280`) |
| `reason.drink-window.closing` | `Drink window closes in 5 months` | months remaining | Drink-window urgency, 0.05 (`business-docs/wiki/shared/mvp-spec.md:281`) |
| `penalty.palate.tannin-high` | `Higher tannin than your usual preference` | — | Palate fit, 0.25 (`business-docs/wiki/shared/mvp-spec.md:283`) |

Two of the six components — **palate fit** as a positive contribution, and **preference
match** — have no example string at all. Nothing states what they say when they contribute.

## Copy that asserts a rule

Every one of these makes a checkable factual claim. Each row states whether the claim is
enforced by anything.

| String | The claim it makes | Enforced? |
| --- | --- | --- |
| `avg 92 over 4 reviews` | An arithmetic mean of exactly 4 of the caller's reviews is 92 | **Copy only.** No definition of the aggregate is given: mean or median, this wine or the grape across producers, the caller's reviews only or all users'. `wine_get` returns "aggregate rating across all users" (`business-docs/wiki/shared/mvp-spec.md:190`) while personal history is explicitly the caller's own (`business-docs/wiki/shared/mvp-spec.md:310`) — the string must not silently mix them. |
| `a grape you rate highly` | The grape is above some threshold | **Copy only.** `business-docs/wiki/shared/mvp-spec.md:310` says "a grape you rate 90+ pulls hard", which reads as a threshold, but 90 is stated as an illustration of magnitude, not as a boundary. The string says "highly"; nothing defines it. |
| `lamb is listed in this wine's pairings` | `"lamb"` appears in the wine's `food_pairings` array | **Partly enforced** — this exact claim is checkable against the column (`business-docs/wiki/shared/mvp-spec.md:86`). But food pairing also scores via the built-in table (`business-docs/wiki/shared/mvp-spec.md:308`), and there is no example string for *that* path. A match by table must not claim the wine "lists" the food. |
| `$28 is inside your $0–40 budget` | The wine's price is within `prefs.budget_min`..`budget_max` | **Enforced by the rule** — inside the band scores `1.0` (`business-docs/wiki/shared/mvp-spec.md:312`). The `$` and the `0–40` render `budget_min`/`budget_max` (`business-docs/wiki/shared/mvp-spec.md:79`); the currency is never specified anywhere in the spec. |
| `Drink window closes in 5 months` | `drink_until` is ~5 months away | **Enforced by data** — `drink_until` is a real column (`business-docs/wiki/shared/mvp-spec.md:91`). But this string can only be true for a cellar item; emitting it for a catalogue-only entry would be a lie, and nothing guards it besides the component being cellar-only (`business-docs/wiki/shared/mvp-spec.md:313`). |
| `Higher tannin than your usual preference` | The wine's `tannin` exceeds `prefs.tannin` | **Copy only.** "Higher" implies an ordering over the 5-point scale, and the distance metric on that scale is undefined. Also note `tannin` is `null` for most whites (`business-docs/wiki/shared/mvp-spec.md:103`) — a null must produce *no* string, not "higher". |

## The hard guarantee

> Every recommendation carries at least one non-empty `reasons` entry (`business-docs/wiki/shared/mvp-spec.md:421`).

This is a definition-of-done checkbox, so it is the one copy rule that is testable today.
It has a sharp edge: a wine with zero usable scoring components has nothing to say about
itself, and would return an empty `reasons` array. Either such a wine cannot be returned,
or the guarantee needs a floor string — the spec picks neither. See
[[recommendation-engine-states]].

## Not localized

Nothing is. All five example strings are English, embedded in the result payload, with
`$` hard-coded as the currency symbol (`business-docs/wiki/shared/mvp-spec.md:280`). No localization system is
mentioned anywhere in [[mvp-spec]], and no `locale` argument exists on any tool.

For an MCP server this is less obviously wrong than it looks — the calling agent can
translate — but it is a decision nobody has made explicitly. Two consequences worth
recording: an agent asked to answer in Spanish will paraphrase these claims, and a
paraphrase of `avg 92 over 4 reviews` is a re-statement of a number we asserted. And a
non-USD user is told their €28 bottle costs `$28`.

## Unused keys

None — there is no string table. Which is itself the finding: the strings are specified
only as examples inside a sample payload, so there is nothing to be unused and nothing to
review. See below.

## Open questions

| Gap | Consequence |
| --- | --- |
| **How `reasons` strings are generated is entirely unspecified.** Templates? Interpolated literals in each component? A shared catalogue? | Reason strings are the contract ([ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md)) but have no home. Scattered literals mean no single place to review the claims the product makes. Recorded in [[divergences]]. |
| No strings exist for positive palate fit (0.25) or preference match (0.15). | 40% of the score weight has no specified explanation, while ADR-0005 requires one. |
| No string for a pairing matched via the built-in table rather than `food_pairings`. | The only pairing example claims the wine "lists" the food, which would be false. |
| No stated maximum number of `reasons`, and no ordering. | A six-component wine could emit six or more sentences in an arbitrary order for the agent to relay. |
| Currency is never specified. | `avg_price`, `purchase_price`, `budget_min`/`budget_max` are bare numbers (`business-docs/wiki/shared/mvp-spec.md:79`, `business-docs/wiki/shared/mvp-spec.md:86`, `business-docs/wiki/shared/mvp-spec.md:90`) rendered with `$`. |
