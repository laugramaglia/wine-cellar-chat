---
feature: authorization
page: index
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:110
  - business-docs/wiki/shared/mvp-spec.md:124
  - business-docs/wiki/shared/mvp-spec.md:144
updated: 2026-08-29
---

# Authorization

Every MCP tool on this server declares one required permission. Authorization decides whether the caller holds it. It answers exactly one question, once per tool call: *may this caller run this tool?* — and it answers it twice, in two places, on purpose.

It starts after [[authentication-index]] has resolved a caller to `{ userId, role, tokenId }` and ends the moment a handler either does its work or returns a denial. It never decides *what data* a caller sees within a tool: that is structural, not permission-based ([[security]], `business-docs/wiki/shared/mvp-spec.md:350`).

## At a glance

| | |
| --- | --- |
| Entry points | every `tools/list` request (filtering) and every `tools/call` request (execution check) — `business-docs/wiki/shared/mvp-spec.md:144-151` |
| Owns | the three roles; the eleven permissions and the full tool→permission→role matrix; the conjunction rule `role AND token-scopes`; "a token can only ever narrow, never widen"; two-layer enforcement; the `TOOL_PERMISSIONS` completeness guarantee |
| Does not own | token issuance and scope assignment ([[token-administration-index]]); the per-request auth flow and `401` handling ([[authentication-index]]); `users.role` as stored data ([[user-administration-index]]) |
| Status | stub — specified in `business-docs/wiki/shared/mvp-spec.md:110-165`, no code exists |

## Pages

- [[authorization-flow]] — the happy path
- [[authorization-screens]] — screens and their IDs (there are none)
- [[authorization-states]] — permission resolution as a computation
- [[authorization-errors]] — error catalogue
- [[authorization-copy]] — the denial message, which is a contract
- [[authorization-validations]] — what is checked, and what is not
- [[authorization-api]] — how the check wraps every other feature's tools
- [[authorization-decisions]] — the ADRs that apply
- [[authorization-related]] — neighbours and shared concerns

## Roles

Three fixed roles, stored as `users.role` (`business-docs/wiki/shared/mvp-spec.md:71-72`), no custom roles in the MVP (`business-docs/wiki/shared/mvp-spec.md:435`).

| Role | Can | Where |
| --- | --- | --- |
| `admin` | everything a member can, **plus** create/suspend users, issue and revoke API keys, and edit anyone's role | `business-docs/wiki/shared/mvp-spec.md:120` |
| `member` | full use of their own cellar, reviews, prefs; read and write the shared wine catalog | `business-docs/wiki/shared/mvp-spec.md:121` |
| `guest` | read-only: search the catalog, read wines, read their own prefs. No writes, no cellar mutations. | `business-docs/wiki/shared/mvp-spec.md:122` |

## The permission matrix

Reproduced from `business-docs/wiki/shared/mvp-spec.md:130-142`. Eleven permissions; each tool declares exactly one.

| Permission | Tools | admin | member | guest |
| --- | --- | :-: | :-: | :-: |
| `catalog:read` | `wine_search`, `wine_get` | ✅ | ✅ | ✅ |
| `catalog:write` | `wine_upsert` | ✅ | ✅ | — |
| `cellar:read` | `cellar_list` | ✅ | ✅ | — |
| `cellar:write` | `cellar_add`, `cellar_update` | ✅ | ✅ | — |
| `review:read` | `review_list` | ✅ | ✅ | ✅ |
| `review:write` | `review_write` | ✅ | ✅ | — |
| `prefs:read` | `prefs_get` | ✅ | ✅ | ✅ |
| `prefs:write` | `prefs_set` | ✅ | ✅ | — |
| `recommend` | `wine_recommend` | ✅ | ✅ | ✅ |
| `admin:users` | `user_create`, `user_list`, `user_update`, `user_delete` | ✅ | — | — |
| `admin:tokens` | `token_create`, `token_list`, `token_revoke` | ✅ | — | — |

Read the columns, not the rows, to see the roles: `admin` holds all eleven; `member` holds the nine non-`admin:*`; `guest` holds four — `catalog:read`, `review:read`, `prefs:read`, `recommend`.

### The guest row does not quite cohere

`guest` holds `review:read` (`business-docs/wiki/shared/mvp-spec.md:136`) and `prefs:read` (`business-docs/wiki/shared/mvp-spec.md:138`) but neither corresponding write permission. Combine that with the structural rule — a caller only ever touches their own data (`business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:350`) — and two of a guest's four permissions are close to meaningless:

| Permission | What a guest can actually reach | Coherent? |
| --- | --- | --- |
| `catalog:read` | the shared wine catalog, which other users populate | yes |
| `recommend` | `wine_recommend`, over the shared catalog | yes — though with `source: "cellar"` it can only ever return nothing, since a guest has no cellar |
| `prefs:read` | their own `user_prefs` row, which they cannot write and no tool writes for them | **no** — it can only ever be empty |
| `review:read` | `review_list` — reviews by wine, **or** the caller's own recent reviews (`business-docs/wiki/shared/mvp-spec.md:209-210`) | **partly** — the by-wine mode reads other users' reviews and is genuinely useful; the own-reviews mode is always empty |

`review_list`'s by-wine mode is the resolution for `review:read`: it is not scoped to the caller, so a guest reading other people's tastings is exactly what the permission is for. `prefs:read` has no such reading — `prefs_get` returns "the caller's stored palate profile" (`business-docs/wiki/shared/mvp-spec.md:214`) and nothing else. The role description at `business-docs/wiki/shared/mvp-spec.md:122` names it explicitly ("read their own prefs"), so it is deliberate, but the capability is inert until a guest is promoted.

Two readings survive: `prefs:read` is forward-looking (a guest promoted to member keeps a profile), or it is an oversight. Unresolvable from the specification — recorded in [[divergences]].

## Rules

Indexed machine-readable form: `business-docs/rules/authorization.json`.

| id | Rule | Value | Where |
| --- | --- | --- | --- |
| `roles-are-three-fixed` | Exactly three roles exist; no custom roles or per-user grants in the MVP. | `admin \| member \| guest` | `business-docs/wiki/shared/mvp-spec.md:72`, `business-docs/wiki/shared/mvp-spec.md:435` |
| `every-tool-declares-one-permission` | Each tool declares one required permission — not zero, not a set. | one | `business-docs/wiki/shared/mvp-spec.md:126` |
| `permission-held-is-a-conjunction` | A caller holds a permission if their role grants it **and**, when the token has explicit `scopes`, the token grants it too. | `role ∧ (scopes ?? all)` | `business-docs/wiki/shared/mvp-spec.md:126-127` |
| `null-scopes-inherit-role-in-full` | `api_tokens.scopes = null` means the token inherits the user's role in full. | `null ⇒ everything` | `business-docs/wiki/shared/mvp-spec.md:77-78`, `business-docs/wiki/shared/mvp-spec.md:346` |
| `token-narrows-never-widens` | A token can only ever narrow what its user's role allows, never widen it. | — | `business-docs/wiki/shared/mvp-spec.md:128` |
| `enforcement-layer-visibility` | `tools/list` returns only the tools the caller is permitted to call. | — | `business-docs/wiki/shared/mvp-spec.md:146-148` |
| `enforcement-layer-execution` | Every handler re-checks the permission before doing any work; this is the security boundary. | — | `business-docs/wiki/shared/mvp-spec.md:149-151` |
| `no-tool-relies-on-being-hidden` | A tool must never rely on having been hidden. | — | `business-docs/wiki/shared/mvp-spec.md:150-151` |
| `denial-is-explicit-and-boring` | A denial names the tool, the required permission, and the caller's role, so the agent reports instead of retrying. | `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` | `business-docs/wiki/shared/mvp-spec.md:153-155` |
| `auth-precedes-authorization` | Unknown, revoked, or expired tokens, and tokens whose user is `suspended`, get `401` at the edge before any permission check. | `401` | `business-docs/wiki/shared/mvp-spec.md:157-159` |
| `tool-permissions-is-exhaustive` | The tool→permission map is one `TOOL_PERMISSIONS` record; adding a tool without a permission is a type error, not a hole. | compile error | `business-docs/wiki/shared/mvp-spec.md:161-162`, `business-docs/wiki/shared/mvp-spec.md:428` |
| `guest-holds-four-permissions` | `guest` holds `catalog:read`, `review:read`, `prefs:read`, `recommend` and nothing else. | 4 of 11 | `business-docs/wiki/shared/mvp-spec.md:132-142` |
| `permission-resolution` | Effective permissions are the role's set intersected with the token's scopes, or the role's set in full when `scopes` is null. | `permissions = role_permissions(user.role) ∩ (token.scopes ?? everything)` | `business-docs/wiki/shared/mvp-spec.md:346` |
| `permission-catalog-read` | `catalog:read` gates `wine_search` and `wine_get`; held by admin, member and guest. | `admin, member, guest` | `business-docs/wiki/shared/mvp-spec.md:132` |
| `permission-catalog-write` | `catalog:write` gates `wine_upsert`; held by admin and member, not guest. | `admin, member` | `business-docs/wiki/shared/mvp-spec.md:133` |
| `permission-cellar-read` | `cellar:read` gates `cellar_list`; held by admin and member, not guest. | `admin, member` | `business-docs/wiki/shared/mvp-spec.md:134` |
| `permission-cellar-write` | `cellar:write` gates `cellar_add` and `cellar_update`; held by admin and member, not guest. | `admin, member` | `business-docs/wiki/shared/mvp-spec.md:135` |
| `permission-review-read` | `review:read` gates `review_list`; held by admin, member and guest. | `admin, member, guest` | `business-docs/wiki/shared/mvp-spec.md:136` |
| `permission-review-write` | `review:write` gates `review_write`; held by admin and member, not guest. | `admin, member` | `business-docs/wiki/shared/mvp-spec.md:137` |
| `permission-prefs-read` | `prefs:read` gates `prefs_get`; held by admin, member and guest. | `admin, member, guest` | `business-docs/wiki/shared/mvp-spec.md:138` |
| `permission-prefs-write` | `prefs:write` gates `prefs_set`; held by admin and member, not guest. | `admin, member` | `business-docs/wiki/shared/mvp-spec.md:139` |
| `permission-recommend` | `recommend` gates `wine_recommend`; held by admin, member and guest. | `admin, member, guest` | `business-docs/wiki/shared/mvp-spec.md:140` |
| `permission-admin-users` | `admin:users` gates `user_create`, `user_list`, `user_update` and `user_delete`; held by admin only. | `admin` | `business-docs/wiki/shared/mvp-spec.md:141` |
| `permission-admin-tokens` | `admin:tokens` gates `token_create`, `token_list` and `token_revoke`; held by admin only. | `admin` | `business-docs/wiki/shared/mvp-spec.md:142` |
| `role-outside-enum-unstorable` | `users.role` is a Postgres enum type, so a value outside the three roles cannot be stored by any write path. The previously undefined behaviour at the most sensitive column in the system is now unreachable. | enum type | [ADR-0015](../../decisions/0015-closed-enumerations-are-database-types.md) |
| `empty-scopes-cannot-exist` | `null` is the only spelling of inherit-the-role-in-full. An empty `scopes` array, which reads to a human as grant-nothing, cannot be stored at all. | `null` or non-empty | [ADR-0018](../../decisions/0018-token-identity-is-constrained-in-the-database.md) |
| `oauth-grant-narrowed-three-times` | An OAuth grant is `role_permissions(role)` ∩ the identifying token's scopes ∩ the scopes the client requested, so a grant can never exceed the token that authorized it. | three-way intersection | [ADR-0022](../../decisions/0022-oauth-alongside-bearer-tokens.md) |

## Not real yet

**Nothing in this feature is implemented.** `src/permissions.ts` — named in `business-docs/wiki/shared/mvp-spec.md:372` as the home of the `Permission` union, `ROLE_PERMISSIONS`, `TOOL_PERMISSIONS` and `can()` — does not exist. Neither does any tool for the check to wrap. Every claim above is traced to the specification, not to a running program. See [[divergences]].

Additionally not specified at all (details in [[authorization-validations]]):

| Gap | Consequence |
| --- | --- |
| No MCP error **code** for a permission denial, only the message text (`business-docs/wiki/shared/mvp-spec.md:153`). | Clients must match on prose. |
| Nothing states what happens when a token's `scopes` contains a permission its user's role does not grant. | Silent security ambiguity — see [[authorization-validations]]. |
| `ROLE_PERMISSIONS` has no completeness guarantee; only `TOOL_PERMISSIONS` does ([ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md)). | A new `Permission` can exist assigned to no role. |
| Nothing states whether an admin's own permissions can be narrowed by scopes. | The matrix implies yes; it is never said. |
| No behaviour stated for a `users.role` value outside the enum. | Undefined at the most sensitive point in the system. |
