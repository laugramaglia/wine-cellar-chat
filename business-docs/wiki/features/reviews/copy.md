---
feature: reviews
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - README.md:264
  - README.md:139
updated: 2026-08-29
---

# Reviews — copy

This page is thin, and deliberately so. There is no UI to hold strings (see [[reviews-screens]]); the MCP client renders everything (`README.md:39`). Only three kinds of text in this feature carry business weight, and none of them lives in a string table.

| Key | Source text | Placeholders | Where it appears |
| --- | --- | --- | --- |
| engine reason, personal history | `Malbec matches a grape you rate highly (avg 92 over 4 reviews)` | grape, mean rating, review count | `wine_recommend` result `reasons[]` (`README.md:264`) |
| permission denied | `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` | tool, permission, role | MCP error on `review_write` for a `guest` (`README.md:139-141`) |
| tool description | not written yet | — | `tools/list`, read by the agent before it calls (`README.md:132`) |

## Copy that asserts a rule

| String | Claim | Enforced or copy? |
| --- | --- | --- |
| `avg 92 over 4 reviews` | This caller has written exactly 4 reviews touching that grape, averaging 92 | **Must be enforced.** [ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md) makes `reasons` a contract, so a wrong count is a broken contract, not a typo. The averaging rule is undefined — see [[reviews-states]]. |
| `your role is 'member'` | The caller's role, quoted back | Enforced — resolved from the token at `README.md:331-332` |
| Aggregate rating in `wine_get` | A number describing **all users**, not the caller (`README.md:175`) | Enforced by the query. The **label** is the risk: unlabelled, an agent will report a stranger's average as the user's own opinion. |

That last row is the one worth acting on. The per-caller / global distinction (`README.md:174-175`) exists only in the field naming, and the field names are not specified.

## Not localized

Nothing is localized. All specified strings — reason strings, error messages, enum values — are English literals, and the enums are lowercase strings by rule (`README.md:84-88`). No localization system is in scope for the MVP.

## Unused keys

None. There is no string table to hold an unused key. When the tool files under `src/tools/` (`README.md:363`) are written, their descriptions and zod schema messages become this page's real inventory.
