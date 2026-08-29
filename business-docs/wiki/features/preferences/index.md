---
feature: preferences
page: index
status: stub
source_of_truth: wiki
code_refs:
  - README.md:65
  - README.md:198
updated: 2026-08-29
---

# Preferences

One user, one palate profile. `user_prefs.user_id` is the **primary key**
(`README.md:65`), so a user cannot have two profiles, and every client that authenticates
as that user reads and writes the same row. That single line of schema is the whole
cross-client story: *"every client sees the same cellar and the same preferences, because
identity lives in the database, not in the client"* (`README.md:6-9`), and
`prefs_set` is called out as *"what makes the same profile show up in Claude and in
Gemini"* (`README.md:203`). Claude Desktop, Gemini, Cursor and a phone agent hold four
different tokens; the tokens resolve to one `user_id`, and `user_id` resolves to one row.

This feature owns that row, the two tools that read and write it (`prefs_get`,
`prefs_set`), and the merge semantics of writing it. It does not own how the
recommendation engine consumes it — but it owns the **contract** the engine relies on,
which is documented here and in [[preferences-states]].

> **Unverified.** Nothing on this page has been checked against a running program. This
> repository contains no source code — only `README.md`, a specification. Every claim
> traces to a line of that file. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | the `prefs_get` and `prefs_set` MCP tools (`README.md:200-203`) |
| Owns | the `user_prefs` row and its fields; one-profile-per-user; `prefs_set` merge vs `replace`; what each field *means* as a contract to the engine |
| Does not own | how the fields are applied to candidate wines ([[recommendation-engine-index]]); the wine fields compared against ([[wine-catalog-index]]); token→user resolution ([[authentication-index]]); the `prefs:read` / `prefs:write` permissions ([[authorization-index]]) |
| Status | stub — specified, not built |

## Pages

- [[preferences-flow]] — reading, writing and applying the profile
- [[preferences-screens]] — there are none; the MCP client is the UI
- [[preferences-states]] — the row's fields, and the precedence rules over them
- [[preferences-errors]] — error catalogue
- [[preferences-copy]] — user-visible strings (there are almost none)
- [[preferences-validations]] — what is checked on the way in
- [[preferences-api]] — the `prefs_get` / `prefs_set` tool contracts
- [[preferences-decisions]] — the ADRs that apply
- [[preferences-related]] — neighbours and shared concerns

## Rules

Indexed machine-readable form: `business-docs/rules/preferences.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `one-profile-per-user` | `user_prefs.user_id` is the primary key. Exactly one profile per user; there is no second row to create. | `user_id (PK)` | `README.md:65` |
| `profile-is-cross-client` | The profile is keyed on the user, never on the token or the client, so every client of that user reads and writes the same row. | user-keyed | `README.md:6-9`, `README.md:203` |
| `two-tokens-one-profile` | Definition of done: two tokens for the same user, from two different clients, see one cellar and one prefs profile. | acceptance test | `README.md:402` |
| `prefs-fields` | The stored profile is `likes`, `dislikes`, `budget_min`, `budget_max`, `sweetness`, `body`, `tannin`, `acidity`, `avoid`, `notes`, `updated_at`. | 10 fields + timestamp | `README.md:65-66` |
| `likes-dislikes-shape` | `likes` and `dislikes` are jsonb of the shape `{ grapes: [], regions: [], styles: [] }`. | `{grapes,regions,styles}` | `README.md:67` |
| `avoid-is-freeform` | `avoid` is jsonb holding allergens and phrases such as `"no oak"`, `"no sulfites added"`. | free-form list | `README.md:68` |
| `palate-fields-are-targets` | `sweetness` / `body` / `tannin` / `acidity` are the user's *target* values on the same enums a wine carries, not filters. | shared enums | `README.md:66`, `README.md:87-88` |
| `merge-is-the-default` | `prefs_set` applies a partial update by merging into the existing row. | merge | `README.md:202` |
| `replace-overwrites` | `replace: true` on `prefs_set` overwrites the profile instead of merging. | `replace: true` | `README.md:202` |
| `avoid-is-a-hard-filter` | Anything in `prefs.avoid` removes a wine from the result set entirely. It is not a penalty. | hard filter | `README.md:286` |
| `dislikes-are-hard-filters` | `dislikes.grapes` and `dislikes.regions` are hard filters. | hard filter | `README.md:287` |
| `request-beats-dislikes` | A disliked grape or region is filtered out **unless** the request explicitly asks for it — then the request wins. | request wins | `README.md:287-288` |
| `likes-are-soft` | `likes` feeds the Preference-match score component; it never filters. | weight `0.15` | `README.md:297` |
| `palate-fit-weight` | Palate fit — the four target fields vs the wine's, by distance on the 5-point scale — is weighted `0.25`. | `0.25` | `README.md:295` |
| `budget-fit-weight` | `budget_min` / `budget_max` feed budget fit, weighted `0.05`; inside the band scores `1.0`. | `0.05` | `README.md:298` |
| `use-prefs-default-true` | `wine_recommend` applies the stored profile unless the caller passes `use_prefs: false`. Default `true`. | `true` | `README.md:250` |
| `prefs-read-permission` | `prefs_get` requires `prefs:read`, held by `admin`, `member` and `guest`. | all roles | `README.md:124` |
| `prefs-write-permission` | `prefs_set` requires `prefs:write`, held by `admin` and `member`. A guest cannot write prefs. | not guest | `README.md:125` |
| `no-user-id-parameter` | Neither prefs tool takes a `user_id`; the user comes from the bearer token via `props`. You cannot read or write another account's profile. | token-resolved | `README.md:154-156`, `README.md:336-337` |

## The asymmetry worth knowing

`likes` and `dislikes` look like a matched pair. They are not.

| Field | Stage | Effect | Overridable by the request | Weight |
| --- | --- | --- | --- | --- |
| `avoid` | hard filter | wine removed from the result | no stated override | — |
| `dislikes.grapes` / `.regions` | hard filter | wine removed from the result | **yes** (`README.md:288`) | — |
| `dislikes.styles` | unspecified | the filter names only `.grapes` / `.regions` | — | — |
| `likes` (all three keys) | weighted score | wine ranked higher | n/a | `0.15` |
| `sweetness` / `body` / `tannin` / `acidity` | weighted score | distance to the wine's value | n/a | `0.25` |
| `budget_min` / `budget_max` | weighted score | inside the band scores `1.0` | request `price_min/max` are separate hard filters (`README.md:284`) | `0.05` |

A dislike is a veto; a like is a nudge worth 15% of the score. Stating a preference and
stating its negation therefore have effects that differ by an order of magnitude, and a
user who says *"I don't like Chardonnay"* will never be shown one, while a user who says
*"I like Malbec"* will still be shown plenty of everything else.

## Not real yet

**None of this exists.** There is no `src/` directory in this repository. The spec sketch
names `src/db/queries/prefs.ts` and a `src/tools/` file per tool (`README.md:362-364`);
those are plans, and are deliberately absent from `code_refs`.

Beyond the missing code, these parts of the *specification* are absent, and each one is
load-bearing:

| Gap | Why it matters |
| --- | --- |
| No vocabulary or normalization for `likes` / `dislikes` / `avoid` | They are free-form jsonb. `"malbec"`, `"Malbec"` and `"Malbec (Argentina)"` have no stated matching rule against `wines.grapes text[]` (`README.md:71`). Because dislikes **filter**, a normalization miss silently shows a user a wine they vetoed. |
| No matching mechanism for `avoid` at all | See the section below. This may be unimplementable as specified. |
| Merge semantics on nested jsonb undefined | `prefs_set` "merges" (`README.md:202`), but merging `{likes: {grapes: ["syrah"]}}` could append to the existing grapes array or replace it. The two behaviours are materially different and neither is stated. |
| No conflict rule for a grape in both `likes` and `dislikes` | One filters, one scores. Filter-then-score implies the dislike wins, but that is inference, not specification. |
| `budget_min` / `budget_max` have no currency | The example recommendation says `"$28 is inside your $0–40 budget"` (`README.md:266`) — the only hint, and it is prose in a sample. `wines.avg_price` (`README.md:72`) is equally unlabelled. |
| No stated behaviour when the user has no prefs row | Every field is optional and every user is created without one (`README.md:207`). What `prefs_get` returns and what the engine does are both undefined. |
| No history, no per-client override | The row has `updated_at` only. Nothing records who or which client last wrote it, and prefs writes are not in the `audit_log` (`README.md:346`, admin actions only). |

## `avoid` is specified as a hard filter against data that does not exist

This is the sharpest finding in the feature, and it deserves being stated flatly.

`avoid` holds phrases like `"no oak"` and `"no sulfites added"` (`README.md:68`), and
anything in it removes a wine from the results (`README.md:286`). But the `wines` table
(`README.md:70-73`) records: `name`, `producer`, `vintage`, `country`, `region`,
`subregion`, `wine_type`, `grapes`, `abv`, `sweetness`, `body`, `tannin`, `acidity`,
`avg_price`, `style_tags`, `food_pairings`, `tasting_notes`. **No oak treatment field. No
allergen field. No additives field.**

So a hard filter is specified against information the schema cannot hold. The only
candidates are `style_tags text[]` and free-text `tasting_notes`, and matching a natural
language phrase against either is neither specified nor deterministic — which collides
with [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md). A filter that
cannot see the attribute it filters on will silently pass every wine, and the user who
listed an allergen will believe they are protected. Until this is resolved, treat
`avoid` as **stored but not enforceable**. Belongs in [[divergences]].
