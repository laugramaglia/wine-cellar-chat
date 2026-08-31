---
feature: user-administration
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:219
updated: 2026-08-29
---

# User administration

Creating, listing, updating and removing accounts. An admin runs it through four MCP tools — `user_create`, `user_list`, `user_update`, `user_delete` — all behind the `admin:users` permission (`business-docs/wiki/shared/mvp-spec.md:141`). It starts after the first admin exists ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)) and ends at the account row; what a token can *do* once issued is not this feature's business.

> **Nothing here is implemented.** The source for every claim on these pages is [[mvp-spec]], a specification for a Cloudflare Workers MCP server that does not yet exist. See [[divergences]].

## At a glance

| | |
| --- | --- |
| Entry points | An admin's MCP client calls `user_create` / `user_list` / `user_update` / `user_delete` (`business-docs/wiki/shared/mvp-spec.md:219-236`). There is no UI. |
| Owns | the account lifecycle; the four `admin:users` tools; **the two guards** that keep the server recoverable |
| Does not own | the permission model ([[authorization-index]]), token mechanics ([[token-administration-index]]), the per-request auth flow ([[authentication-index]]) |
| Status | stub — specified, not built |

## Pages

- [[user-administration-flow]] — the happy path
- [[user-administration-screens]] — screens (there are none)
- [[user-administration-states]] — the account state machine and the guards
- [[user-administration-errors]] — error catalogue
- [[user-administration-copy]] — user-visible strings
- [[user-administration-validations]] — input rules and the enforced guards
- [[user-administration-api]] — the four tool schemas
- [[user-administration-decisions]] — the ADRs that apply
- [[user-administration-related]] — neighbours and shared concerns

## Rules

Indexed machine-readable form: `business-docs/rules/user-administration.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `admin-users-permission` | All four account tools require one permission. | `admin:users`, admin role only | `business-docs/wiki/shared/mvp-spec.md:141` |
| `user-create-default-role` | `role` defaults when not supplied. | `member` | `business-docs/wiki/shared/mvp-spec.md:222` |
| `user-create-issues-first-token` | `issue_token: true` with a `token_label` creates the account and returns its first key in the same call. | one call | `business-docs/wiki/shared/mvp-spec.md:222-224` |
| `plaintext-token-returned-once` | The plaintext token appears in the `user_create` response and nowhere, ever, again. | exactly once | `business-docs/wiki/shared/mvp-spec.md:225`, [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) |
| `user-update-fields` | `user_update` changes `role` or `status` and nothing else. | `role`, `status` | `business-docs/wiki/shared/mvp-spec.md:229` |
| `suspension-kills-tokens` | Suspending a user makes every one of their tokens fail at the next request. | next request | `business-docs/wiki/shared/mvp-spec.md:230`, `business-docs/wiki/shared/mvp-spec.md:427` |
| `guard-no-self-demote` | An admin cannot demote or suspend themselves. | hard guard | `business-docs/wiki/shared/mvp-spec.md:230-231` |
| `guard-last-active-admin` | The last remaining active admin cannot be demoted, suspended, or deleted. | hard guard | `business-docs/wiki/shared/mvp-spec.md:231-232` |
| `delete-is-soft-by-default` | `user_delete` sets `status = deleted` and revokes the tokens. | soft | `business-docs/wiki/shared/mvp-spec.md:234-235` |
| `hard-delete-drops-owned-data` | `hard: true` additionally drops the user's cellar items and reviews. | `hard: true` | `business-docs/wiki/shared/mvp-spec.md:235` |
| `contributed-wines-survive` | Wines the user contributed stay in the shared catalogue, at any delete depth. | always kept | `business-docs/wiki/shared/mvp-spec.md:236` |
| `admin-actions-audited` | User created and role changed are written to `audit_log`. | 2 of 4 tools | `business-docs/wiki/shared/mvp-spec.md:359-361` |
| `deleted-is-a-user-status` | `user.status` is one of three values; soft delete sets `deleted` and keeps the row, so foreign keys from wines, reviews and the audit log keep resolving. | `active \| suspended \| deleted` | [ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) |
| `email-unique-among-living` | `email` is `citext`, format-checked, and unique only across accounts whose status is not `deleted` — a soft-deleted account releases its address. | unique where `status <> 'deleted'` | [ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) |
| `email-is-not-a-stable-identity` | Because a soft-deleted address can be reused, `email` does not identify a person across time. `users.id` does, and `audit_log` stores the id. | `users.id` | [ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) |
| `user-prefs-cascade-on-delete` | `user_prefs` cascades on both soft and hard delete. The specification omitted it from both depths. | `ON DELETE CASCADE` | [ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) |
| `role-and-status-are-database-types` | `user_role` and `user_status` are Postgres enum types, so an out-of-enum value cannot be stored by any write path — including `scripts/bootstrap-admin.ts` and a manual session. | enum types | [ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md) |

## The guards are the point

Two lines of specification (`business-docs/wiki/shared/mvp-spec.md:230-232`) are the most load-bearing content in this feature:

1. An admin cannot demote or suspend **themselves**.
2. The **last remaining active admin** cannot be demoted, suspended, or deleted.

Without them, one careless `user_update` leaves a server with no active admin. Nobody can then create one, because `user_create` requires `admin:users` and no live account holds it. The only remaining path is `scripts/bootstrap-admin.ts` with direct production database credentials ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)) — assuming that script is idempotent, which nothing states. The guards are what stand between a single tool call and needing database credentials to recover the server.

Enforcement detail: [[user-administration-states]] (as transition guards), [[user-administration-validations]] (as enforced rules).

## Not real yet

- **No code exists.** No `src/tools/admin/user_*.ts`, no `src/db/queries/users.ts`, no `users` table. The file layout at `business-docs/wiki/shared/mvp-spec.md:367-386` is a plan.
- `scripts/bootstrap-admin.ts` — the only way the first admin appears — is likewise planned, not written.
- The `deleted` status is set by `user_delete` but is **not in the stated enum** (`business-docs/wiki/shared/mvp-spec.md:73`, `business-docs/wiki/shared/mvp-spec.md:229` vs `business-docs/wiki/shared/mvp-spec.md:235`). A genuine contradiction inside the specification; see [[divergences]].
- Nothing anywhere states whether `email` is unique, or validated as an email at all.
- Only "user created" and "role changed" are listed as audited (`business-docs/wiki/shared/mvp-spec.md:359-361`). Suspension and deletion — the destructive acts — are not.
