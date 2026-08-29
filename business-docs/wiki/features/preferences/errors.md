---
feature: preferences
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - README.md:139
  - README.md:143
updated: 2026-08-29
---

# Preferences — errors

Shared catalogue: [[error-codes]].

No error is specific to this feature. Everything below is inherited from the auth and
authorization layers, and is listed here because it is what a caller of `prefs_get` /
`prefs_set` will actually hit.

> **Unverified.** Specification only; no handler exists. Message strings are quoted from
> `README.md` and are the specification's own examples, not observed output.

| Condition | Code / exception | What the caller sees | Recovery |
| --- | --- | --- | --- |
| Missing or malformed `Authorization` header | `401` at the Worker edge | connection refused, no tool list at all (`README.md:145`, `README.md:329`) | supply a valid token |
| Unknown, revoked or expired token | `401` | same — nothing reaches a tool (`README.md:330`) | issue a new token ([[token-administration-index]]) |
| Token's user is `status = suspended` | `401` | same (`README.md:144-145`) | an admin reactivates the account |
| `guest` calls `prefs_set` | MCP error, permission denied | `Permission denied: 'prefs_set' requires 'prefs:write'; your role is 'guest'.` — by the shape at `README.md:139-140` | ask an admin to raise the role; do not retry |
| A token scoped without `prefs:write` calls `prefs_set` | MCP error, permission denied | same shape; a token can only narrow its user's role (`README.md:113-114`) | use a token that carries the scope |
| Invalid enum for `sweetness` / `body` / `tannin` / `acidity` | **unspecified** — a zod input schema is planned (`README.md:363`) | unspecified | see [[preferences-validations]] |
| `prefs_get` with no stored row | **unspecified** | unspecified — empty object, nulls, or an error; nothing says which | — |

Rejections are deliberately explicit and boring *"so the agent reports it instead of
retrying in a loop"* (`README.md:139-141`). That is a product rule about agent behaviour,
not a formatting preference: a vague error makes a model retry.

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `avoid` matching | Any `avoid` entry that names an attribute no wine field records — `"no oak"`, allergens, additives (`README.md:68` vs `README.md:70-73`) | The filter passes every wine. **The user believes an allergen is excluded and is shown wines that may contain it.** No error, no warning. This is the highest-severity item in the feature; see [[preferences-index]]. |
| Unnormalized `dislikes` | `"Malbec"` vs `"malbec"` vs `"Malbec (Argentina)"` against `wines.grapes text[]` (`README.md:71`) | A vetoed wine is recommended anyway, silently. |
| Missing prefs fields | Any unset scoring input | The component is dropped and weights renormalized by design — [ADR-0006](../../decisions/0006-missing-data-never-penalizes.md). Correct, but it means an unwritten profile is indistinguishable from a written one that matched nothing. |
| `notes` | The field is stored and never read by anything in the specification | The user writes a preference in prose and it has no effect at all. |

The first two rows belong in [[divergences]]: they are cases where the specification
promises a filter the data model cannot deliver.

## Retries

Nothing here is retried. Both tools are single database operations; a permission
rejection is explicitly designed *not* to be retried (`README.md:141`). The only
best-effort write anywhere near this path is `last_used_at` via `ctx.waitUntil`
(`README.md:341`), which is [[authentication-index]]'s and fails silently by design.
