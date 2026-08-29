---
feature: preferences
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - README.md:263
updated: 2026-08-29
---

# Preferences — copy

**This page is thin, and that is correct.** A headless MCP server has no UI strings: the
MCP client is the UI (`README.md:39`), and how a profile is described to the user is the
connected agent's wording, not this project's. There is no localization system, no string
table, and nothing planned in `README.md:353-372` that would hold one.

Only two kinds of string leave this server with business weight, and neither is owned
here.

| Key | Source text | Placeholders | Where it appears |
| --- | --- | --- | --- |
| *(engine reason)* | `"$28 is inside your $0–40 budget"` | price, `budget_min`, `budget_max` | `reasons[]` of a `wine_recommend` result (`README.md:266`) — owned by [[recommendation-engine-index]] |
| *(engine penalty)* | `"Higher tannin than your usual preference"` | — | `penalties[]` of a `wine_recommend` result (`README.md:270`) — owned by [[recommendation-engine-index]] |
| *(permission rejection)* | `Permission denied: '<tool>' requires '<permission>'; your role is '<role>'.` | tool, permission, role | any denied `prefs_set` (`README.md:139-140`) — owned by [[authorization-index]] |

## Copy that asserts a rule

Both engine strings above assert something about the *stored profile* and are therefore
this feature's problem when they are wrong.

| String | Claim | Enforced? |
| --- | --- | --- |
| `"$28 is inside your $0–40 budget"` | that `budget_min`/`budget_max` are dollars | **Copy only.** No currency is stored or stated anywhere (`README.md:65`). The `$` is asserted by an example sentence. |
| `"Higher tannin than your usual preference"` | that a stored `tannin` target exists and was compared | Depends on `tannin` being set. `tannin` is `null` for most whites on the wine side (`README.md:89`); what the string says when the *wine* has no tannin value is unspecified. |

`reasons` is a contract, not decoration (`README.md:273`) — every point of score maps to
a reason string, [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md).
So a preference that influences a score **must** be expressible as a sentence. Any field
this feature stores that cannot be phrased as a reason cannot legally be scored.

## Not localized

Everything. There is no localization layer and none is planned for the MVP. Every string
listed above is English, hard-coded in the server. For a product whose entire surface is
an LLM client that speaks the user's language, this is worth naming: the agent will
translate on the fly, and the translation is outside anyone's control.

## Unused keys

None — there is no string table. The nearest equivalent is the `notes` field: free text
the user supplies which nothing in the specification ever reads (`README.md:66`). It
implies a behaviour that does not exist.
