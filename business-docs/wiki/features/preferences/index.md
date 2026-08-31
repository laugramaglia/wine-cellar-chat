---
feature: preferences
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:79
  - business-docs/wiki/shared/mvp-spec.md:212
updated: 2026-08-29
---

# Preferences

One user, one palate profile. `user_prefs.user_id` is the **primary key**
(`business-docs/wiki/shared/mvp-spec.md:79`), so a user cannot have two profiles, and every client that authenticates
as that user reads and writes the same row. That single line of schema is the whole
cross-client story: *"every client sees the same cellar and the same preferences, because
identity lives in the database, not in the client"* (`business-docs/wiki/shared/mvp-spec.md:20-23`), and
`prefs_set` is called out as *"what makes the same profile show up in Claude and in
Gemini"* (`business-docs/wiki/shared/mvp-spec.md:217`). Claude Desktop, Gemini, Cursor and a phone agent hold four
different tokens; the tokens resolve to one `user_id`, and `user_id` resolves to one row.

This feature owns that row, the two tools that read and write it (`prefs_get`,
`prefs_set`), and the merge semantics of writing it. It does not own how the
recommendation engine consumes it — but it owns the **contract** the engine relies on,
which is documented here and in [[preferences-states]].

> **Unverified.** Nothing on this page has been checked against a running program. This
> repository contains no source code — only [[mvp-spec]], a specification. Every claim
> traces to a line of that file. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | the `prefs_get` and `prefs_set` MCP tools (`business-docs/wiki/shared/mvp-spec.md:214-217`) |
| Owns | the `user_prefs` row and its fields; one-profile-per-user; `prefs_set` merge vs `replace`; what each field *means* as a contract to the engine |
| Does not own | how the fields are applied to candidate wines ([[recommendation-engine-index]]); the wine fields compared against ([[wine-catalog-index]]); token→user resolution ([[authentication-index]]); the `prefs:read` / `prefs:write` permissions ([[authorization-index]]) |
| Status | stub — specified, not built |
| `prefs-default-to-empty-shapes` | `likes`, `dislikes` and `avoid` are `NOT NULL` with their documented empty shapes as defaults, so a user who has never written preferences reads back the same shape as everyone else. | `{grapes:[],regions:[],styles:[]}` / `[]` | [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) |
| `prefs-palate-shares-the-wine-type` | A stored palate preference and a wine's attribute are the same Postgres `intensity` type — the precondition for measuring palate fit as a distance rather than as string equality. | `intensity` | [ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md) |
| `budget-order-checked` | `budget_min <= budget_max` is a `CHECK`. Both are `numeric`, never binary floats, so a budget comparison is exact. No currency is recorded anywhere. | `numeric(10,2)` | [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) |

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
| `one-profile-per-user` | `user_prefs.user_id` is the primary key. Exactly one profile per user; there is no second row to create. | `user_id (PK)` | `business-docs/wiki/shared/mvp-spec.md:79` |
| `profile-is-cross-client` | The profile is keyed on the user, never on the token or the client, so every client of that user reads and writes the same row. | user-keyed | `business-docs/wiki/shared/mvp-spec.md:20-23`, `business-docs/wiki/shared/mvp-spec.md:217` |
| `two-tokens-one-profile` | Definition of done: two tokens for the same user, from two different clients, see one cellar and one prefs profile. | acceptance test | `business-docs/wiki/shared/mvp-spec.md:416` |
| `prefs-fields` | The stored profile is `likes`, `dislikes`, `budget_min`, `budget_max`, `sweetness`, `body`, `tannin`, `acidity`, `avoid`, `notes`, `updated_at`. | 10 fields + timestamp | `business-docs/wiki/shared/mvp-spec.md:79-80` |
| `likes-dislikes-shape` | `likes` and `dislikes` are jsonb of the shape `{ grapes: [], regions: [], styles: [] }`. | `{grapes,regions,styles}` | `business-docs/wiki/shared/mvp-spec.md:81` |
| `avoid-is-freeform` | `avoid` is jsonb holding allergens and phrases such as `"no oak"`, `"no sulfites added"`. | free-form list | `business-docs/wiki/shared/mvp-spec.md:82` |
| `palate-fields-are-targets` | `sweetness` / `body` / `tannin` / `acidity` are the user's *target* values on the same enums a wine carries, not filters. | shared enums | `business-docs/wiki/shared/mvp-spec.md:80`, `business-docs/wiki/shared/mvp-spec.md:101-102` |
| `merge-is-the-default` | `prefs_set` applies a partial update by merging into the existing row. | merge | `business-docs/wiki/shared/mvp-spec.md:216` |
| `replace-overwrites` | `replace: true` on `prefs_set` overwrites the profile instead of merging. | `replace: true` | `business-docs/wiki/shared/mvp-spec.md:216` |
| `avoid-is-a-hard-filter` | Anything in `prefs.avoid` removes a wine from the result set entirely. It is not a penalty. | hard filter | `business-docs/wiki/shared/mvp-spec.md:300` |
| `dislikes-are-hard-filters` | `dislikes.grapes` and `dislikes.regions` are hard filters. | hard filter | `business-docs/wiki/shared/mvp-spec.md:301` |
| `request-beats-dislikes` | A disliked grape or region is filtered out **unless** the request explicitly asks for it — then the request wins. | request wins | `business-docs/wiki/shared/mvp-spec.md:301-302` |
| `likes-are-soft` | `likes` feeds the Preference-match score component; it never filters. | weight `0.15` | `business-docs/wiki/shared/mvp-spec.md:311` |
| `palate-fit-weight` | Palate fit — the four target fields vs the wine's, by distance on the 5-point scale — is weighted `0.25`. | `0.25` | `business-docs/wiki/shared/mvp-spec.md:309` |
| `budget-fit-weight` | `budget_min` / `budget_max` feed budget fit, weighted `0.05`; inside the band scores `1.0`. | `0.05` | `business-docs/wiki/shared/mvp-spec.md:312` |
| `use-prefs-default-true` | `wine_recommend` applies the stored profile unless the caller passes `use_prefs: false`. Default `true`. | `true` | `business-docs/wiki/shared/mvp-spec.md:264` |
| `prefs-read-permission` | `prefs_get` requires `prefs:read`, held by `admin`, `member` and `guest`. | all roles | `business-docs/wiki/shared/mvp-spec.md:138` |
| `prefs-write-permission` | `prefs_set` requires `prefs:write`, held by `admin` and `member`. A guest cannot write prefs. | not guest | `business-docs/wiki/shared/mvp-spec.md:139` |
| `no-user-id-parameter` | Neither prefs tool takes a `user_id`; the user comes from the bearer token via `props`. You cannot read or write another account's profile. | token-resolved | `business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:350-351` |

## The asymmetry worth knowing

`likes` and `dislikes` look like a matched pair. They are not.

| Field | Stage | Effect | Overridable by the request | Weight |
| --- | --- | --- | --- | --- |
| `avoid` | hard filter | wine removed from the result | no stated override | — |
| `dislikes.grapes` / `.regions` | hard filter | wine removed from the result | **yes** (`business-docs/wiki/shared/mvp-spec.md:302`) | — |
| `dislikes.styles` | unspecified | the filter names only `.grapes` / `.regions` | — | — |
| `likes` (all three keys) | weighted score | wine ranked higher | n/a | `0.15` |
| `sweetness` / `body` / `tannin` / `acidity` | weighted score | distance to the wine's value | n/a | `0.25` |
| `budget_min` / `budget_max` | weighted score | inside the band scores `1.0` | request `price_min/max` are separate hard filters (`business-docs/wiki/shared/mvp-spec.md:298`) | `0.05` |

A dislike is a veto; a like is a nudge worth 15% of the score. Stating a preference and
stating its negation therefore have effects that differ by an order of magnitude, and a
user who says *"I don't like Chardonnay"* will never be shown one, while a user who says
*"I like Malbec"* will still be shown plenty of everything else.

## Not real yet

**None of this exists.** There is no `src/` directory in this repository. The spec sketch
names `src/db/queries/prefs.ts` and a `src/tools/` file per tool (`business-docs/wiki/shared/mvp-spec.md:376-378`);
those are plans, and are deliberately absent from `code_refs`.

Beyond the missing code, these parts of the *specification* are absent, and each one is
load-bearing:

| Gap | Why it matters |
| --- | --- |
| No vocabulary or normalization for `likes` / `dislikes` / `avoid` | They are free-form jsonb. `"malbec"`, `"Malbec"` and `"Malbec (Argentina)"` have no stated matching rule against `wines.grapes text[]` (`business-docs/wiki/shared/mvp-spec.md:85`). Because dislikes **filter**, a normalization miss silently shows a user a wine they vetoed. |
| No matching mechanism for `avoid` at all | See the section below. This may be unimplementable as specified. |
| Merge semantics on nested jsonb undefined | `prefs_set` "merges" (`business-docs/wiki/shared/mvp-spec.md:216`), but merging `{likes: {grapes: ["syrah"]}}` could append to the existing grapes array or replace it. The two behaviours are materially different and neither is stated. |
| No conflict rule for a grape in both `likes` and `dislikes` | One filters, one scores. Filter-then-score implies the dislike wins, but that is inference, not specification. |
| `budget_min` / `budget_max` have no currency | The example recommendation says `"$28 is inside your $0–40 budget"` (`business-docs/wiki/shared/mvp-spec.md:280`) — the only hint, and it is prose in a sample. `wines.avg_price` (`business-docs/wiki/shared/mvp-spec.md:86`) is equally unlabelled. |
| No stated behaviour when the user has no prefs row | Every field is optional and every user is created without one (`business-docs/wiki/shared/mvp-spec.md:221`). What `prefs_get` returns and what the engine does are both undefined. |
| No history, no per-client override | The row has `updated_at` only. Nothing records who or which client last wrote it, and prefs writes are not in the `audit_log` (`business-docs/wiki/shared/mvp-spec.md:360`, admin actions only). |

## `avoid` is specified as a hard filter against data that does not exist

This is the sharpest finding in the feature, and it deserves being stated flatly.

`avoid` holds phrases like `"no oak"` and `"no sulfites added"` (`business-docs/wiki/shared/mvp-spec.md:82`), and
anything in it removes a wine from the results (`business-docs/wiki/shared/mvp-spec.md:300`). But the `wines` table
(`business-docs/wiki/shared/mvp-spec.md:84-87`) records: `name`, `producer`, `vintage`, `country`, `region`,
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
