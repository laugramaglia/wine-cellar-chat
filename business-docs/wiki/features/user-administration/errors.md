---
feature: user-administration
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:153
  - business-docs/wiki/shared/mvp-spec.md:230
updated: 2026-08-29
---

# User administration — errors

Shared catalogue: [[error-codes]]. Transport-level rejections belong to [[authentication-index]]; permission denial belongs to [[authorization-index]]. Listed here because they are what an admin actually hits.

| Condition | Code / exception | What the caller sees | Recovery |
| --- | --- | --- | --- |
| Missing or malformed `Authorization` header | `401` at the Worker edge | Connection refused; no tool list, nothing (`business-docs/wiki/shared/mvp-spec.md:343`, `business-docs/wiki/shared/mvp-spec.md:159`) | Supply a valid token. |
| Unknown, revoked, or expired token | `401` at the Worker edge | as above (`business-docs/wiki/shared/mvp-spec.md:344`) | Reissue via [[token-administration-index]]. |
| Caller's own user is not `active` | `401` at the Worker edge | as above (`business-docs/wiki/shared/mvp-spec.md:345`) | An admin reinstates them. A suspended admin cannot unsuspend themselves. |
| Caller lacks `admin:users` | MCP error | `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` (`business-docs/wiki/shared/mvp-spec.md:153-154`) | None available to the caller. Explicit and boring **so the agent reports it instead of retrying in a loop** (`business-docs/wiki/shared/mvp-spec.md:154-155`). Tested at `business-docs/wiki/shared/mvp-spec.md:425`. |
| Admin demotes or suspends **themselves** | guard rejection; **code and message unspecified** | rejected, no state change (`business-docs/wiki/shared/mvp-spec.md:230-231`) | Have another admin do it. |
| Target is the **last active admin** (demote / suspend / delete) | guard rejection; **code and message unspecified** | rejected, no state change (`business-docs/wiki/shared/mvp-spec.md:231-232`) | Promote another user to `admin` first, then retry. |
| `user_update` on a nonexistent user | **unspecified** | unknown | — |
| `user_create` with a duplicate `email` | rejected: `email` is unique among non-`deleted` accounts, case-insensitively ([ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md)) | the handler must catch `users_email_live_uniq` and report it as a named error, not as a raw constraint violation | Use a different address, or reuse the one freed by a soft-deleted account. |
| Invalid `role` or `status` value | schema rejection by the tool's zod schema, and a type error at the column if anything reaches the database ([ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md)) | an MCP validation error | Send a valid enum member. |
| `status: deleted` sent to `user_update` | **unspecified.** The value is now storable ([ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md)), which makes it a live question rather than an impossible one — see below | unknown | — |

## The `deleted` status contradiction, partly resolved

`user_update` is documented as changing `status` to `active | suspended` (`business-docs/wiki/shared/mvp-spec.md:229`), and the table enum agrees (`business-docs/wiki/shared/mvp-spec.md:73`). But `user_delete` writes `deleted` (`business-docs/wiki/shared/mvp-spec.md:235`).

[ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) answers the second question below — the enum contains `deleted`, so delete is not broken — and leaves the other two open as **handler** questions rather than schema ones:

| Question | Consequence if guessed wrong |
| --- | --- |
| Is `deleted` a valid `user_update` input? | If yes, deletion has a second path that skips token revocation — a soft-deleted user whose tokens still authenticate against a `status` the auth check happens to reject. Survivable only because step 3 is a negation (`business-docs/wiki/shared/mvp-spec.md:345`). |
| ~~Does the database enum include `deleted`?~~ | **Answered: yes** ([ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md)). |
| Can a `deleted` user be reinstated to `active`? | Nothing forbids it; nothing describes it. Their tokens were revoked, so they would need new ones. |

Recorded in [[divergences]]. The schema question is settled; the two handler questions are not, and `user_update`'s zod schema is where they get answered — it should accept `active | suspended` only unless someone decides otherwise.

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `last_used_at` update | Any failure of the best-effort `ctx.waitUntil` write (`business-docs/wiki/shared/mvp-spec.md:355`) | Nothing. `user_list`'s "last activity" column (`business-docs/wiki/shared/mvp-spec.md:227`) can under-report, and an admin may judge an account idle when it is not. |
| `audit_log` write | Unstated whether a failed audit write fails the operation or is ignored | Unstated. If ignored, an unlogged admin action; if not, a logging outage blocks administration. See [[audit-logging]]. |
| Deletion and suspension | Not swallowed — **never recorded at all.** Only "user created" and "role changed" are listed as audited (`business-docs/wiki/shared/mvp-spec.md:359-361`) | An admin reading `audit_log` sees who was created and promoted, but not who was suspended or deleted. |

## Retries

Nothing in this feature is described as retried. Permission denials are deliberately shaped to stop an agent retrying (`business-docs/wiki/shared/mvp-spec.md:154-155`). No rate limiting is specified anywhere ([[security]]), so a client that ignores that shaping is unthrottled.
