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
| [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md) | The first admin is seeded by a script, not created through a tool. | **The reason the last-admin guard matters so much.** Because there is deliberately no privileged escape hatch in the tool surface, zero active admins means recovery requires database credentials and an operator. The guard at `README.md:217-218` is the only thing standing between a careless `user_update` and that. |
| [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) | Only the SHA-256 hash is stored; plaintext is returned exactly once. | `user_create` with `issue_token: true` is one of only two places the plaintext exists (`README.md:211`). That response is unusually sensitive and unrepeatable — a lost token is reissued, never recovered. |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | Permission enforcement has two layers, and only one is the boundary. | These four tools are the highest-value targets on the server. Hiding them from a member's `tools/list` is an affordance (`README.md:410`); every handler re-checking `admin:users` is the security boundary (`README.md:411`). |
| [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md) | A tool without a declared permission is a compile error. | Adding a fifth account tool without an `admin:users` entry in `TOOL_PERMISSIONS` cannot compile, so it cannot ship as an unguarded hole (`README.md:147-148`, `README.md:414`). |
| [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) | Static bearer tokens, not OAuth 2.1, for the MVP. | Accounts have no password and no login. An account is only reachable through a token an admin issued, which is why account creation and key issuance collapse into one call. |
| [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) | No OpenAPI document for an MCP surface. | The four tool schemas live in [[user-administration-api]] and nowhere else. |

## Open questions

Decisions this feature still needs. Recorded as questions rather than invented as ADRs.

| Question | Blocked on |
| --- | --- |
| Is `deleted` a real `user.status` value? `README.md:59` and `README.md:215` say the enum is `active \| suspended`; `README.md:221` writes `deleted`. | A human decision. It must land before `schema.sql` exists. [[divergences]] |
| Is `email` unique? Is it validated as an email at all? | Never stated anywhere. |
| Can a soft-deleted user's `email` be reused? | Depends on the answer above. |
| Is the last-active-admin count transactional? | Two concurrent suspensions could each see the other as active and both commit, leaving zero admins. See [[user-administration-validations]]. |
| Is re-running `scripts/bootstrap-admin.ts` safe? | Flagged as open by [ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md) itself. A second run that mints another admin is a silent privilege grant. |
| Are suspension and deletion audited? | Only "user created" and "role changed" are listed (`README.md:345-347`). The destructive acts are absent. [[audit-logging]] |
| Is a hard delete reversible, and is it confirmable? | Unstated. It drops a user's cellar and reviews irreversibly as far as anything here says. |
| Should reinstating a suspended user restore every token they had? | It does, because suspension never touches token rows (`README.md:216`, `README.md:331`). Nothing says that is intended. [[security]] |
| What error does `user_update` return for a nonexistent user? | Unstated. |
