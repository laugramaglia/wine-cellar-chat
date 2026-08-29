---
feature: user-administration
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - README.md:139
  - README.md:216
updated: 2026-08-29
---

# User administration — errors

Shared catalogue: [[error-codes]]. Transport-level rejections belong to [[authentication-index]]; permission denial belongs to [[authorization-index]]. Listed here because they are what an admin actually hits.

| Condition | Code / exception | What the caller sees | Recovery |
| --- | --- | --- | --- |
| Missing or malformed `Authorization` header | `401` at the Worker edge | Connection refused; no tool list, nothing (`README.md:329`, `README.md:145`) | Supply a valid token. |
| Unknown, revoked, or expired token | `401` at the Worker edge | as above (`README.md:330`) | Reissue via [[token-administration-index]]. |
| Caller's own user is not `active` | `401` at the Worker edge | as above (`README.md:331`) | An admin reinstates them. A suspended admin cannot unsuspend themselves. |
| Caller lacks `admin:users` | MCP error | `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` (`README.md:139-140`) | None available to the caller. Explicit and boring **so the agent reports it instead of retrying in a loop** (`README.md:140-141`). Tested at `README.md:411`. |
| Admin demotes or suspends **themselves** | guard rejection; **code and message unspecified** | rejected, no state change (`README.md:216-217`) | Have another admin do it. |
| Target is the **last active admin** (demote / suspend / delete) | guard rejection; **code and message unspecified** | rejected, no state change (`README.md:217-218`) | Promote another user to `admin` first, then retry. |
| `user_update` on a nonexistent user | **unspecified** | unknown | — |
| `user_create` with a duplicate `email` | **unspecified** — uniqueness is never stated | unknown; a raw constraint violation if the column happens to be unique | — |
| Invalid `role` or `status` value | schema rejection, presumably by the tool's zod schema (`README.md:363`) | an MCP validation error | Send a valid enum member. |
| `status: deleted` sent to `user_update` | **unspecified** | unknown — see below | — |

## The `deleted` status contradiction

`user_update` is documented as changing `status` to `active | suspended` (`README.md:215`), and the table enum agrees (`README.md:59`). But `user_delete` writes `deleted` (`README.md:221`). Three questions have no answer in the specification, and each is a different error surface:

| Question | Consequence if guessed wrong |
| --- | --- |
| Is `deleted` a valid `user_update` input? | If yes, deletion has a second path that skips token revocation — a soft-deleted user whose tokens still authenticate against a `status` the auth check happens to reject. Survivable only because step 3 is a negation (`README.md:331`). |
| Does the database enum include `deleted`? | If not, `user_delete` fails at runtime with a constraint violation, and delete is simply broken. |
| Can a `deleted` user be reinstated to `active`? | Nothing forbids it; nothing describes it. Their tokens were revoked, so they would need new ones. |

Recorded in [[divergences]]. This must be settled before `schema.sql` is written.

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `last_used_at` update | Any failure of the best-effort `ctx.waitUntil` write (`README.md:341`) | Nothing. `user_list`'s "last activity" column (`README.md:213`) can under-report, and an admin may judge an account idle when it is not. |
| `audit_log` write | Unstated whether a failed audit write fails the operation or is ignored | Unstated. If ignored, an unlogged admin action; if not, a logging outage blocks administration. See [[audit-logging]]. |
| Deletion and suspension | Not swallowed — **never recorded at all.** Only "user created" and "role changed" are listed as audited (`README.md:345-347`) | An admin reading `audit_log` sees who was created and promoted, but not who was suspended or deleted. |

## Retries

Nothing in this feature is described as retried. Permission denials are deliberately shaped to stop an agent retrying (`README.md:140-141`). No rate limiting is specified anywhere ([[security]]), so a client that ignores that shaping is unthrottled.
