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
| [[authentication-index]] | **Enforces this feature's decisions.** Suspension and soft deletion have no effect of their own — they bite at step 3 of the per-request flow, `status != active` → `401` (`README.md:331`). Also owns the bootstrap that creates the first admin (`README.md:313-317`). |
| [[authorization-index]] | Owns the permission model. `admin:users` gates all four tools here (`README.md:127`); `user_update` changing a `role` is what makes a permission set change. This feature sets the input to that model and does not define it. |
| [[token-administration-index]] | Overlaps at `user_create` + `issue_token: true`, which mints a key inside an account-creation call (`README.md:208-210`). Everything else about tokens — `token_create`, `token_list`, `token_revoke`, scopes, expiry — is `admin:tokens`, a separate permission (`README.md:128`). `user_delete` revokes tokens; `user_list` reports a count. |
| [[wine-catalog-index]] | Receives the asymmetry: contributed wines survive a hard delete (`README.md:222`), so `wines.created_by` can point at a removed user. |
| [[cellar-index]] | A hard delete drops the user's cellar items (`README.md:221`). |
| [[reviews-index]] | A hard delete drops the user's reviews (`README.md:221`), which changes the aggregate rating `wine_get` reports (`README.md:175`). |
| [[preferences-index]] | `user_prefs` is keyed on `user_id` (`README.md:65`). **Not mentioned** in either delete depth — an omission, not a decision. |
| [[recommendation-engine-index]] | Reads prefs, cellar and review history, all keyed on the account this feature creates and removes. |

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[security]] | The props-only rule and its sole exception: `admin:*` tools are the only ones that take a `user_id`, and they gate on the permission first (`README.md:154-156`, `README.md:338`). |
| [[audit-logging]] | User created and role changed are written to `audit_log` (`README.md:345-347`). Suspension and deletion are not listed. |
| [[mcp-protocol]] | Tool visibility, `tools/list` filtering, and the shape of an MCP error. |
| [[error-codes]] | No code is specified for a permission denial or for a guard rejection. |
| [[data-types]] | `role` and `status` enums (`README.md:57-59`). |
| [[glossary]] | admin, member, guest, account, suspension, soft vs hard delete. |
| [[divergences]] | The `deleted` status contradiction, and the standing "nothing is implemented" divergence. |

## Code shared with other features

None exists yet. The planned layout (`README.md:353-372`) puts `src/db/queries/users.ts` and `src/tools/admin/user_*.ts` here, alongside `token_*.ts` owned by [[token-administration-index]]; `src/permissions.ts` and `src/auth.ts` are owned by [[authorization-index]] and [[authentication-index]] respectively and are read, never written, by this feature.
