---
feature: preferences
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Preferences — decisions

ADRs that constrain this feature. The ADR itself is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) | Static bearer tokens per client, OAuth 2.1 as the upgrade path | The cross-client promise — one profile in Claude, Gemini and everything else — is only true because several tokens resolve to one `user_id` (`README.md:6-9`, `README.md:332-333`). One token per client (`README.md:323`) is what makes "the same profile everywhere" observable rather than trivial. |
| [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md) | Hard filters plus a weighted sum; no LLM inside the engine | Preferences are *data*, not prompts. Every field this feature stores must be mechanically comparable to a wine field. It is why `avoid` being free-form natural language is a defect and not a feature. |
| [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md) | An unknown scoring component is dropped and the remaining weights renormalized | Most of the profile is optional and most users will fill in little of it. Without this rule a sparse profile would systematically distort scores; with it, an empty profile is simply neutral. |
| [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) | If a point of score cannot be explained, it is not scored | A preference that cannot be phrased in a sentence cannot legally influence a recommendation. It bounds what this feature may store and expect to matter. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | Visibility filtering *and* an in-handler re-check | `prefs_set` is hidden from a `guest` and must still reject one (`README.md:124-125`, `README.md:130-137`). |
| [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) | `wine_upsert` fills blanks and never overwrites without `overwrite: true` | Cited as a **contrast**, not a constraint. `prefs_set` merges by default and clobbers on `replace: true` (`README.md:202`) — a different default and a different keyword for the same shape of operation. |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | No OpenAPI document for an MCP surface | The `prefs_get` / `prefs_set` contracts live in [[preferences-api]] and nowhere else. |

## Open questions

Each of these is a decision this feature still needs. They are recorded as questions
because inventing an ADR to fill the table would be worse than leaving the gap visible.

| Question | Why it is blocked | Consequence of leaving it |
| --- | --- | --- |
| **How does `avoid` match a wine?** `"no oak"` and allergens are hard filters (`README.md:286`), but no `wines` column records oak, allergens or additives (`README.md:70-73`). | Needs either a schema change or a retreat from "hard filter". | The filter silently passes everything. A user who listed an allergen believes they are protected. Highest-severity open item in the feature. |
| **What is the vocabulary for `likes` / `dislikes` / `avoid`?** | Free-form jsonb (`README.md:67-68`) with no normalization rule against `wines.grapes text[]` (`README.md:71`). | Case and phrasing decide whether a veto works. Dislikes *filter*, so a miss is user-visible and wrong. |
| **What does merging nested jsonb do?** Append to `likes.grapes`, or replace it? | `README.md:202` says "merge" and stops. | Two materially different behaviours behind one call. |
| **Which wins if a grape is in both `likes` and `dislikes`?** | No stated rule. | Filter-then-score implies the dislike wins; that is inference. |
| **What currency are `budget_min` / `budget_max`?** | Never stated; `"$28 is inside your $0–40 budget"` (`README.md:266`) is a sample sentence, not a spec. `wines.avg_price` is equally unlabelled. | Silent cross-currency comparison. |
| **What happens when a user has no prefs row?** Every user starts in that state (`README.md:207`). | `prefs_get`'s response and the engine's behaviour are both undefined. | The most common state in a new deployment is the least specified. |
| **Is `dislikes.styles` read at all?** | Present in the shape (`README.md:67`), absent from the filter list (`README.md:287`). | Stored, apparently ignored. |
