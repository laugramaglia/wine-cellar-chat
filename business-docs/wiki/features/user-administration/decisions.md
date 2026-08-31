---
feature: user-administration
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# User administration — decisions

ADRs that constrain this feature. The ADR is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md) | The first admin is seeded by a script, not created through a tool. | **The reason the last-admin guard matters so much.** Because there is deliberately no privileged escape hatch in the tool surface, zero active admins means recovery requires database credentials and an operator. The guard at `business-docs/wiki/shared/mvp-spec.md:231-232` is the only thing standing between a careless `user_update` and that. |
| [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) | Only the SHA-256 hash is stored; plaintext is returned exactly once. | `user_create` with `issue_token: true` is one of only two places the plaintext exists (`business-docs/wiki/shared/mvp-spec.md:225`). That response is unusually sensitive and unrepeatable — a lost token is reissued, never recovered. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | Permission enforcement has two layers, and only one is the boundary. | These four tools are the highest-value targets on the server. Hiding them from a member's `tools/list` is an affordance (`business-docs/wiki/shared/mvp-spec.md:424`); every handler re-checking `admin:users` is the security boundary (`business-docs/wiki/shared/mvp-spec.md:425`). |
| [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md) | A tool without a declared permission is a compile error. | Adding a fifth account tool without an `admin:users` entry in `TOOL_PERMISSIONS` cannot compile, so it cannot ship as an unguarded hole (`business-docs/wiki/shared/mvp-spec.md:161-162`, `business-docs/wiki/shared/mvp-spec.md:428`). |
| [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) | Static bearer tokens, not OAuth 2.1, for the MVP. | Accounts have no password and no login. An account is only reachable through a token an admin issued, which is why account creation and key issuance collapse into one call. |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | No OpenAPI document for an MCP surface. | The four tool schemas live in [[user-administration-api]] and nowhere else. |
| [ADR-0017](../../decisions/0017-deletion-is-a-status-and-email-is-unique-among-the-living.md) | `deleted` is a third `user.status`, and `email` is unique only among non-deleted accounts | Resolves the specification's one genuine self-contradiction and closes three questions at once. Soft delete keeps the row so `wines.created_by`, `reviews` and `audit_log` keep resolving; a released address means **email is not a stable identifier for a person across time** — `users.id` is. `user_prefs` now cascades on both delete depths, closing an omission that read as an oversight |
| [ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md) | Closed enumerations are Postgres enum types | `user_role` and `user_status` become impossible to violate from any write path, including `scripts/bootstrap-admin.ts` and a manual `psql` session. Adding a role is now a migration, which for a permission model is the correct amount of friction |
| [ADR-0020](../../decisions/0020-bounds-are-enforced-in-the-database-too.md) | Stated bounds are `CHECK` constraints as well as Zod schemas | `email` gains a format check and `name` a length bound at the column, so an account created by the bootstrap script is validated the same way as one created through `user_create` |

## Open questions

Decisions this feature still needs. Recorded as questions rather than invented as ADRs.

| Question | Blocked on |
| --- | --- |
| Is the last-active-admin count transactional? | Two concurrent suspensions could each see the other as active and both commit, leaving zero admins. See [[user-administration-validations]]. |
| Is re-running `scripts/bootstrap-admin.ts` safe? | Flagged as open by [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md) itself. A second run that mints another admin is a silent privilege grant. |
| Are suspension and deletion audited? | Only "user created" and "role changed" are listed (`business-docs/wiki/shared/mvp-spec.md:359-361`). The destructive acts are absent. [[audit-logging]] |
| Is a hard delete reversible, and is it confirmable? | Unstated. It drops a user's cellar and reviews irreversibly as far as anything here says. |
| Should reinstating a suspended user restore every token they had? | It does, because suspension never touches token rows (`business-docs/wiki/shared/mvp-spec.md:230`, `business-docs/wiki/shared/mvp-spec.md:345`). Nothing says that is intended. [[security]] |
| What error does `user_update` return for a nonexistent user? | Unstated. |
