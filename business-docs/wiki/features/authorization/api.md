---
feature: authorization
page: api
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:144
  - business-docs/wiki/shared/mvp-spec.md:166
updated: 2026-08-29
---

# Authorization — API

**This feature exposes no MCP tools of its own.** There is no `permissions_list`, no `whoami`, no way for a caller to ask what they are allowed to do. Authorization is a wrapper around every *other* feature's tools, and its only observable output is which tools appear in `tools/list` and which calls are refused.

There is also **no OpenAPI document** — the surface is MCP over Streamable HTTP at `/mcp`, not REST ([ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md), `business-docs/wiki/shared/mvp-spec.md:39`). See [[mcp-protocol]].

| Method + path | OpenAPI tag | Handler | Called from |
| --- | --- | --- | --- |
| — | — | — | this feature exposes nothing |

## The two MCP methods it intercepts

| MCP method | What authorization does | Where |
| --- | --- | --- |
| `tools/list` | filters the returned tools to those whose declared permission is in `props.permissions` | `src/mcp.ts` (planned, `business-docs/wiki/shared/mvp-spec.md:370`) |
| `tools/call` | the handler re-checks its declared permission before doing any work | every file under `src/tools/` (planned, `business-docs/wiki/shared/mvp-spec.md:377-378`) |

Both are described at `business-docs/wiki/shared/mvp-spec.md:144-151`. Only the second is a security boundary — [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md).

## Every tool it gates

Sixteen tools across five features, each declaring exactly one permission (`business-docs/wiki/shared/mvp-spec.md:126`, `business-docs/wiki/shared/mvp-spec.md:130-142`). This table is the join between the matrix in [[authorization-index]] and the tools defined at `business-docs/wiki/shared/mvp-spec.md:166-247`.

| Tool | Required permission | Owned by |
| --- | --- | --- |
| `wine_search` | `catalog:read` | [[wine-catalog-index]] |
| `wine_get` | `catalog:read` | [[wine-catalog-index]] |
| `wine_upsert` | `catalog:write` | [[wine-catalog-index]] |
| `cellar_list` | `cellar:read` | [[cellar-index]] |
| `cellar_add` | `cellar:write` | [[cellar-index]] |
| `cellar_update` | `cellar:write` | [[cellar-index]] |
| `review_list` | `review:read` | [[reviews-index]] |
| `review_write` | `review:write` | [[reviews-index]] |
| `prefs_get` | `prefs:read` | [[preferences-index]] |
| `prefs_set` | `prefs:write` | [[preferences-index]] |
| `wine_recommend` | `recommend` | [[recommendation-engine-index]] |
| `user_create` | `admin:users` | [[user-administration-index]] |
| `user_list` | `admin:users` | [[user-administration-index]] |
| `user_update` | `admin:users` | [[user-administration-index]] |
| `user_delete` | `admin:users` | [[user-administration-index]] |
| `token_create` | `admin:tokens` | [[token-administration-index]] |
| `token_list` | `admin:tokens` | [[token-administration-index]] |
| `token_revoke` | `admin:tokens` | [[token-administration-index]] |

Eighteen rows for sixteen tool *names* — `wine_search`/`wine_get` and the `admin:*` groups share permissions. **The mapping is exhaustive by construction**: `TOOL_PERMISSIONS` is one record over the tool-name union, so a tool missing from this table would not compile (`business-docs/wiki/shared/mvp-spec.md:161-162`, `business-docs/wiki/shared/mvp-spec.md:428`, [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md)).

## Request rules that matter here

| Rule | Detail |
| --- | --- |
| `Authorization: Bearer <token>` | the only header authorization depends on, and it is consumed by [[authentication-index]] before this feature runs (`business-docs/wiki/shared/mvp-spec.md:343`, `business-docs/wiki/shared/mvp-spec.md:399`) |
| No `user_id` parameter | apart from the `admin:*` tools, no tool takes one — you cannot read or write another account's data whatever your role (`business-docs/wiki/shared/mvp-spec.md:168-170`) |
| `admin:*` tools gate first | they accept a `user_id`, and they check `admin:users` / `admin:tokens` **before** honouring it (`business-docs/wiki/shared/mvp-spec.md:351-353`) |
| `token_create` `scopes` | must be a subset of that user's permissions (`business-docs/wiki/shared/mvp-spec.md:238-239`). Enforcement is [[token-administration-index]]'s; the rule is this feature's. See [[authorization-validations]] |

## Response rules that matter here

| Rule | Detail |
| --- | --- |
| A filtered `tools/list` is indistinguishable from a small server | Nothing in the response says tools were removed (`business-docs/wiki/shared/mvp-spec.md:147-148`). Deliberate |
| A denial names tool, permission, and role | `business-docs/wiki/shared/mvp-spec.md:153-155`; wording in [[authorization-copy]] |
| No error code is specified for a denial | Only the message text exists. See [[authorization-errors]] and [[error-codes]] |
| Denials are not audited | `audit_log` records admin actions taken, not attempts refused (`business-docs/wiki/shared/mvp-spec.md:359-361`). See [[audit-logging]] |

## Planned

Nothing in this feature is implemented — `src/permissions.ts`, named at `business-docs/wiki/shared/mvp-spec.md:372` as the home of the `Permission` union, `ROLE_PERMISSIONS`, `TOOL_PERMISSIONS` and `can()`, does not exist, and neither does any tool for it to gate. See [[divergences]].

Named as post-MVP at `business-docs/wiki/shared/mvp-spec.md:435-437`, and **not** to be documented as capabilities that exist:

- custom roles and per-user permission grants instead of the three fixed roles
- MCP *resources* exposing the cellar as browsable context — these would need their own permission model, and none is specified
- MCP *prompts* for "sommelier mode" — same
- OAuth 2.1, which would replace token `scopes` with OAuth scopes ([ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md))
