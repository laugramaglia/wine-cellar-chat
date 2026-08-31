---
feature: recommendation-engine
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:153
  - business-docs/wiki/shared/mvp-spec.md:343
updated: 2026-08-29
---

# Recommendation engine — errors

Shared catalogue: [[error-codes]].

The engine itself specifies **no errors of its own.** Everything below is either inherited
from the request pipeline or is a gap. That is worth saying plainly rather than leaving the
table thin and letting a reader assume it was an oversight in the wiki: it is an omission
in the specification.

| Condition | Code / exception | What the user sees | Recovery |
| --- | --- | --- | --- |
| Missing or malformed `Authorization` header | `401` at the Worker edge (`business-docs/wiki/shared/mvp-spec.md:343`) | Connection refused; no tool list at all (`business-docs/wiki/shared/mvp-spec.md:159`) | Supply a valid token. [[authentication-index]] |
| Unknown, revoked, or expired token | `401` (`business-docs/wiki/shared/mvp-spec.md:344`) | as above | Have an admin issue a new key ([[token-administration-index]]) |
| Token's user is `status = suspended` | `401` (`business-docs/wiki/shared/mvp-spec.md:345`, `business-docs/wiki/shared/mvp-spec.md:158`) | as above | Admin reactivates the account |
| Caller lacks `recommend` | MCP error, `Permission denied: 'wine_recommend' requires 'recommend'; your role is '<role>'.` (pattern from `business-docs/wiki/shared/mvp-spec.md:153-154`) | An explicit refusal the agent reports rather than retrying | Cannot occur through role alone — all three roles hold `recommend` (`business-docs/wiki/shared/mvp-spec.md:140`). Only a narrowed token `scopes` list can cause it (`business-docs/wiki/shared/mvp-spec.md:127-128`). |
| No wine survives the hard filters | **Not an error.** An empty ranked list. | The agent says nothing matched | Relax `price_max`, `wine_type`, `region`, or switch `source` to `catalog` |
| Invalid input value (e.g. `wine_type: "purple"`) | Zod schema rejection at the tool boundary (`business-docs/wiki/shared/mvp-spec.md:377`) | A schema error from the MCP layer | Correct the argument. See [[recommendation-engine-validations]]. |
| Database unreachable | **Unspecified.** No behaviour is stated for a Neon HTTP failure. | Unspecified | — |

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| Any dropped scoring component | The fact that a component was unavailable | A score computed over fewer components, presented on the same `0..1` scale as a fully-informed one. Deliberate ([ADR-0006](../../decisions/0006-missing-data-never-penalizes.md)) — but the *degradation itself* is invisible: no field says how many components contributed. |
| A hard filter removing a wine | Which filter removed it, and that it existed | Absence. The user cannot tell "you own nothing that matches" from "your `avoid` list removed it". |
| `last_used_at` update | Any failure, by design — best-effort via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`) | Nothing. Belongs to [[authentication-index]]. |
| An empty pairing-table lookup | That `food` was unmatched | Food pairing (weight 0.30) silently drops out and the other components are renormalized upward. A request whose entire point was *"what goes with lamb"* can return a confident-looking list in which food played no part. |

That last row is the one to watch. It is a legitimate consequence of two individually
correct decisions — drop unknown components, and keep a small built-in pairing table — and
it produces the engine's worst failure mode: an answer that looks responsive to the
question and is not. A `reasons` array with no pairing sentence in it is the only signal,
which is another argument for reasons being the contract
([ADR-0005](../../decisions/0005-every-point-of-score-maps-to-a-reason.md)).

## Retries

Nothing is retried. The engine is a single synchronous read inside one tool call. Retry, if
any, is the MCP client's business.

Deliberately not retried: nothing, because nothing is retried at all. Deliberately **not**
loop-inducing: permission rejections are explicit and boring precisely so the agent reports
them instead of retrying (`business-docs/wiki/shared/mvp-spec.md:153-155`).

## Open questions

| Gap | Where it should be answered |
| --- | --- |
| No MCP error code is specified for a permission denial — only message text. | [[authorization-index]], already in [[divergences]] |
| No stated behaviour when the Neon HTTP call fails mid-scoring. | Shared concern; nothing in [[mvp-spec]] covers database failure for any tool. |
| Whether an over-constrained request returns `[]` or an error. | Read here as `[]`; the spec never says. |
| Whether a candidate with zero usable components is skipped, errored, or scored. | See [[recommendation-engine-states]]. |
