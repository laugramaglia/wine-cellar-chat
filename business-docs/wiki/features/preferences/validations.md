---
feature: preferences
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:377
updated: 2026-08-29
---

# Preferences — validations

There is no client. The MCP client is the UI (`business-docs/wiki/shared/mvp-spec.md:53`), so **every rule below is
server-side or it does not exist**. The plan is one file per tool with a zod input schema
and a handler (`business-docs/wiki/shared/mvp-spec.md:377`); no schema is written yet, so the table records what the
specification implies, and the section after it records what it never says.

> **Unverified.** No zod schema, no handler, no migration exists in this repository.

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| caller identity | Taken from `props`, never from tool input — no `user_id` parameter exists on either tool | structural, by the tool signature (`business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:350-351`) | n/a — there is no field to reject |
| `prefs_set` | Requires `prefs:write`; re-checked in the handler even though the tool is hidden from a `guest` | permission layer, both stages (`business-docs/wiki/shared/mvp-spec.md:139`, `business-docs/wiki/shared/mvp-spec.md:144-151`) | `Permission denied: 'prefs_set' requires 'prefs:write'; your role is 'guest'.` (`business-docs/wiki/shared/mvp-spec.md:153-154`) |
| `prefs_get` | Requires `prefs:read` | permission layer | same shape |
| `sweetness` | one of `bone_dry \| dry \| off_dry \| medium_sweet \| sweet`, lowercase | planned zod schema (`business-docs/wiki/shared/mvp-spec.md:98-101`, `business-docs/wiki/shared/mvp-spec.md:377`) | unspecified |
| `body`, `tannin`, `acidity` | one of `low \| medium_minus \| medium \| medium_plus \| high`, lowercase | planned zod schema (`business-docs/wiki/shared/mvp-spec.md:102`) | unspecified |
| `likes`, `dislikes` | shape `{ grapes: [], regions: [], styles: [] }` | planned zod schema (`business-docs/wiki/shared/mvp-spec.md:81`) | unspecified |
| `replace` | boolean; absent means merge | planned zod schema (`business-docs/wiki/shared/mvp-spec.md:216`) | unspecified |

## Client vs server

| Rule | Client | Server |
| --- | --- | --- |
| enum membership | — | planned (zod) |
| permission | tool hidden from `tools/list` — a UX affordance only | **the security boundary**; re-checked in the handler (`business-docs/wiki/shared/mvp-spec.md:146-151`) |
| ownership of the row | — | structural: the row is keyed on `props.userId` (`business-docs/wiki/shared/mvp-spec.md:350-351`) |

The `tools/list` filter is deliberately *not* trusted: *"A tool must never rely on having
been hidden"* (`business-docs/wiki/shared/mvp-spec.md:151`) — [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md).

## Not validated

Each of these is an input that reaches storage — and in three cases reaches a **hard
filter** — with no stated check at all.

| Input | What is unchecked | Consequence |
| --- | --- | --- |
| `likes` / `dislikes` array members | Free-form strings. No vocabulary, no case rule, no normalization against `wines.grapes text[]` (`business-docs/wiki/shared/mvp-spec.md:85`) | `"Malbec"` and `"malbec"` may be different vetoes. Because dislikes filter (`business-docs/wiki/shared/mvp-spec.md:301`), a miss shows a wine the user rejected. |
| `avoid` entries | Free-form natural language: `"no oak"`, `"no sulfites added"`, allergens (`business-docs/wiki/shared/mvp-spec.md:82`) | No wine field records any of these (`business-docs/wiki/shared/mvp-spec.md:84-87`). The hard filter at `business-docs/wiki/shared/mvp-spec.md:300` has nothing to match against. |
| `budget_min` vs `budget_max` | No stated ordering constraint | `budget_min > budget_max` is an empty band; the `0.05` budget component's behaviour is undefined (`business-docs/wiki/shared/mvp-spec.md:312`) |
| `budget_min` / `budget_max` currency | No unit is stored or stated | A user in euros and a catalogue in dollars compare silently. See [[preferences-index]]. |
| `budget_min` / `budget_max` sign and type | No stated non-negativity or numeric bound | — |
| `notes` | No length bound, no content rule | Free text nothing reads. |
| a grape in both `likes` and `dislikes` | No conflict rule | Undefined; the filter probably wins, but only by inference from `business-docs/wiki/shared/mvp-spec.md:294`. |
| nested-`jsonb` merge input | Undefined semantics (append vs replace) for `prefs_set` merge (`business-docs/wiki/shared/mvp-spec.md:216`) | The same call has two plausible, materially different outcomes. |

The first two rows are the ones to fix first: they are the only unvalidated inputs in this
feature that can **remove** a wine from a result, or fail to.
