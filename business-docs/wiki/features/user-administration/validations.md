---
feature: user-administration
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:221
  - business-docs/wiki/shared/mvp-spec.md:230
updated: 2026-08-29
---

# User administration — validations

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| `user_create.name` | Required. | tool input schema (`business-docs/wiki/shared/mvp-spec.md:221`) | schema error |
| `user_create.email` | Required. Format and uniqueness **unstated**. | — | — |
| `user_create.role` | One of `admin \| member \| guest`; defaults to `member`. | tool input schema (`business-docs/wiki/shared/mvp-spec.md:222`, `business-docs/wiki/shared/mvp-spec.md:72`) | schema error |
| `user_create.issue_token` | Boolean. `token_label` is meaningful only with it; whether `token_label` is *required* when true is unstated. | tool input schema (`business-docs/wiki/shared/mvp-spec.md:222`) | — |
| `user_update.role` | One of `admin \| member \| guest`. | tool input schema | schema error |
| `user_update.status` | Documented as `active \| suspended` (`business-docs/wiki/shared/mvp-spec.md:229`) — but `deleted` exists (`business-docs/wiki/shared/mvp-spec.md:235`). See [[divergences]]. | tool input schema | schema error |
| `user_update` target | Must exist. **No stated behaviour for a nonexistent user.** | — | — |
| `user_delete.hard` | Boolean, default false (soft delete) (`business-docs/wiki/shared/mvp-spec.md:234-235`). | tool input schema | — |
| Caller permission | Holds `admin:users`, re-checked in the handler before any work. | handler ([ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md), `business-docs/wiki/shared/mvp-spec.md:149-151`) | `Permission denied: …` (`business-docs/wiki/shared/mvp-spec.md:153`) |

## The guards — enforced rules, not advice

Both from `business-docs/wiki/shared/mvp-spec.md:230-232`. These are business rules with a recovery cost, not input hygiene: see [[user-administration-states]] for why a server with zero active admins can only be repaired with database credentials ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)).

| id | Rule | Applies to | Predicate |
| --- | --- | --- | --- |
| `guard-no-self-demote` | An admin cannot demote themselves. | `user_update` | reject when `target_id == props.userId` and `role != 'admin'` |
| `guard-no-self-suspend` | An admin cannot suspend themselves. | `user_update` | reject when `target_id == props.userId` and `status != 'active'` |
| `guard-last-active-admin` | The last remaining **active** admin cannot be demoted, suspended, or deleted. | `user_update`, `user_delete` | reject when target is `admin` and `status = 'active'` and no other admin has `status = 'active'` |

Notes that the specification does not make, but that any implementation must decide:

- The count is over **active** admins only (`business-docs/wiki/shared/mvp-spec.md:231`). A suspended admin is not a survivor. So suspending admin A can succeed and then suspending admin B be blocked — legality depends on ordering, and the specification never explores it.
- Nothing says the count is taken in the same transaction as the write. Two concurrent suspensions could each observe the other as active and both commit, defeating the guard. **A `SELECT … FOR UPDATE` or an equivalent serialization is required and is not specified.**
- `guard-last-active-admin` covers demotion, suspension and deletion. It says nothing about `hard: true` specifically — read it as covering both delete depths, since the consequence is strictly worse.
- Nothing says whether these guards are checked before or after the target is confirmed to exist, which decides which error a bad `target_id` produces.

## Client vs server

| Rule | Client | Server |
| --- | --- | --- |
| Every rule on this page | none — the MCP client is an agent that may send anything | **all of them** |

There is no client-side validation in this architecture, and that is correct: the "client" is an LLM composing tool calls. Nothing may be assumed about its input. Equally, visibility filtering of `tools/list` is **not** validation — a hidden tool must still reject ([ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md), `business-docs/wiki/shared/mvp-spec.md:151`).

## Not validated

| Input | Consequence |
| --- | --- |
| `email` — no stated format check, no stated uniqueness constraint | Two accounts can share an address; a typo is invisible. `email` is the only human-legible identity in `user_list` (`business-docs/wiki/shared/mvp-spec.md:227`). |
| Reuse of a soft-deleted user's `email` | Undecidable while uniqueness is unstated. If unique and rows are kept forever, an address is burned by one soft delete. |
| `name` beyond presence | No length or content bound. |
| `user_update` on a nonexistent target | Unspecified. |
| Re-running `scripts/bootstrap-admin.ts` | Unspecified whether it is idempotent or refuses when an admin exists — flagged as an open question by [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md). A second run that mints a second admin is a silent privilege grant. |
| Whether hard delete is confirmable, reversible, or audited | Unspecified on all three counts. It is the most destructive operation in the system and has no stated safeguard beyond the last-admin guard. |
