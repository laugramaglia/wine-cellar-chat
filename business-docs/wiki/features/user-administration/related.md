---
feature: user-administration
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# User administration — related

## Features

| Feature | Relationship |
| --- | --- |
| [[authentication-index]] | **Enforces this feature's decisions.** Suspension and soft deletion have no effect of their own — they bite at step 3 of the per-request flow, `status != active` → `401` (`business-docs/wiki/shared/mvp-spec.md:345`). Also owns the bootstrap that creates the first admin (`business-docs/wiki/shared/mvp-spec.md:327-331`). |
| [[authorization-index]] | Owns the permission model. `admin:users` gates all four tools here (`business-docs/wiki/shared/mvp-spec.md:141`); `user_update` changing a `role` is what makes a permission set change. This feature sets the input to that model and does not define it. |
| [[token-administration-index]] | Overlaps at `user_create` + `issue_token: true`, which mints a key inside an account-creation call (`business-docs/wiki/shared/mvp-spec.md:222-224`). Everything else about tokens — `token_create`, `token_list`, `token_revoke`, scopes, expiry — is `admin:tokens`, a separate permission (`business-docs/wiki/shared/mvp-spec.md:142`). `user_delete` revokes tokens; `user_list` reports a count. |
| [[wine-catalog-index]] | Receives the asymmetry: contributed wines survive a hard delete (`business-docs/wiki/shared/mvp-spec.md:236`), so `wines.created_by` can point at a removed user. |
| [[cellar-index]] | A hard delete drops the user's cellar items (`business-docs/wiki/shared/mvp-spec.md:235`). |
| [[reviews-index]] | A hard delete drops the user's reviews (`business-docs/wiki/shared/mvp-spec.md:235`), which changes the aggregate rating `wine_get` reports (`business-docs/wiki/shared/mvp-spec.md:189`). |
| [[preferences-index]] | `user_prefs` is keyed on `user_id` (`business-docs/wiki/shared/mvp-spec.md:79`). **Not mentioned** in either delete depth — an omission, not a decision. |
| [[recommendation-engine-index]] | Reads prefs, cellar and review history, all keyed on the account this feature creates and removes. |

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[security]] | The props-only rule and its sole exception: `admin:*` tools are the only ones that take a `user_id`, and they gate on the permission first (`business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:352`). |
| [[audit-logging]] | User created and role changed are written to `audit_log` (`business-docs/wiki/shared/mvp-spec.md:359-361`). Suspension and deletion are not listed. |
| [[mcp-protocol]] | Tool visibility, `tools/list` filtering, and the shape of an MCP error. |
| [[error-codes]] | No code is specified for a permission denial or for a guard rejection. |
| [[data-types]] | `role` and `status` enums (`business-docs/wiki/shared/mvp-spec.md:71-73`). |
| [[glossary]] | admin, member, guest, account, suspension, soft vs hard delete. |
| [[divergences]] | The `deleted` status contradiction, and the standing "nothing is implemented" divergence. |

## Code shared with other features

None exists yet. The planned layout (`business-docs/wiki/shared/mvp-spec.md:367-386`) puts `src/db/queries/users.ts` and `src/tools/admin/user_*.ts` here, alongside `token_*.ts` owned by [[token-administration-index]]; `src/permissions.ts` and `src/auth.ts` are owned by [[authorization-index]] and [[authentication-index]] respectively and are read, never written, by this feature.
