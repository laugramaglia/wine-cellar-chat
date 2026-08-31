---
feature: authorization
page: states
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:341
  - business-docs/wiki/shared/mvp-spec.md:124
updated: 2026-08-29
---

# Authorization — states

Authorization has no state machine. It has **one computation**, run once per request, whose result is carried on `props` for the life of that request.

## The computation

```
permissions = role_permissions(user.role) ∩ (token.scopes ?? everything)
```

`business-docs/wiki/shared/mvp-spec.md:346`, step 4 of the per-request flow. Read it left to right:

| Term | Meaning | Where |
| --- | --- | --- |
| `role_permissions(user.role)` | the role's column in the matrix — `ROLE_PERMISSIONS` in code | `business-docs/wiki/shared/mvp-spec.md:130-142`, `business-docs/wiki/shared/mvp-spec.md:372` |
| `token.scopes` | `api_tokens.scopes text[]`, **nullable** | `business-docs/wiki/shared/mvp-spec.md:74` |
| `?? everything` | `null` scopes means inherit the user's role in full | `business-docs/wiki/shared/mvp-spec.md:77-78` |
| `∩` | intersection — so the token can only ever *narrow*, never widen | `business-docs/wiki/shared/mvp-spec.md:128` |

The intersection is what makes the narrowing rule structural rather than a validation. Even if `scopes` names `admin:users` for a member, the intersection with the member column drops it. The rule holds by construction — **but nothing says whether that is the intended handling or an error.** See [[authorization-validations]].

## State shape — `props`

Passed on the `McpAgent` (`business-docs/wiki/shared/mvp-spec.md:347`).

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `userId` | id | the resolved calling user; the sole source of "who am I" for every handler (`business-docs/wiki/shared/mvp-spec.md:350`) | none — always present |
| `role` | `admin \| member \| guest` | the account's role, carried for the denial message (`business-docs/wiki/shared/mvp-spec.md:155`) | none |
| `tokenId` | id | which client is calling; `label` distinguishes `claude-desktop` from `gemini` (`business-docs/wiki/shared/mvp-spec.md:76`) | none |
| `permissions` | set of `Permission` | the effective set — the output of the computation above | none |

`permissions` is the only field authorization reads. The other three exist for other features: `userId` for the structural ownership rule ([[security]]), `role` for the denial string, `tokenId` for `last_used_at` and revocation ([[token-administration-index]]).

## Effective sets by role, with no token scopes

With `scopes = null`, the effective set is exactly the role's column (`business-docs/wiki/shared/mvp-spec.md:132-142`).

| Role | Effective permissions | Count |
| --- | --- | --- |
| `admin` | all eleven | 11 |
| `member` | `catalog:read`, `catalog:write`, `cellar:read`, `cellar:write`, `review:read`, `review:write`, `prefs:read`, `prefs:write`, `recommend` | 9 |
| `guest` | `catalog:read`, `review:read`, `prefs:read`, `recommend` | 4 |

## Transitions

There are none within a request. The set is computed at step 4 and never recomputed (`business-docs/wiki/shared/mvp-spec.md:346`). What changes it is data, between requests:

| From | Event | To | Guard |
| --- | --- | --- | --- |
| any set | `user_update` changes `role` | the new role's column, intersected with scopes | next request only; an admin cannot demote themselves, and the last active admin cannot be demoted (`business-docs/wiki/shared/mvp-spec.md:230-232`) |
| any set | `token_create` with `scopes` | the intersection of role and those scopes, for that token only | scopes must be a subset of that user's permissions (`business-docs/wiki/shared/mvp-spec.md:238-239`) |
| any set | `token_revoke` | no set at all — `401` before authorization runs | takes effect immediately (`business-docs/wiki/shared/mvp-spec.md:247`) |
| any set | `user_update` to `status = suspended` | no set at all — `401` at the edge | every one of that user's tokens, at the next request (`business-docs/wiki/shared/mvp-spec.md:230-231`, `business-docs/wiki/shared/mvp-spec.md:427`) |

Every one of these is an authorization *input* changing. The owner of each is [[user-administration-index]] or [[token-administration-index]], not this feature.

## Resolution order

The check itself is a single set membership, not an if/else chain. The **order of gates around it** is the rule, and it matters:

1. Edge authentication — unknown, revoked, expired token, or `status != active` → `401` (`business-docs/wiki/shared/mvp-spec.md:157-159`). Nothing below runs.
2. Permission check — `TOOL_PERMISSIONS[tool] ∈ props.permissions`, else denial (`business-docs/wiki/shared/mvp-spec.md:149-150`).
3. Handler work, reading the user from `props` (`business-docs/wiki/shared/mvp-spec.md:350`).
4. For `admin:*` tools only: a `user_id` from tool input is honoured — and only after step 2 has passed (`business-docs/wiki/shared/mvp-spec.md:351-353`).

An unauthenticated caller therefore never receives a permission denial, and an unpermitted caller never reaches a `user_id` parameter.

### What a missing value means

| Missing value | Resolves to | Consequence |
| --- | --- | --- |
| `token.scopes IS NULL` | `everything` | the token has the user's full role — this is the default and the common case (`business-docs/wiki/shared/mvp-spec.md:77-78`) |
| `token.scopes = '{}'` (empty array, non-null) | intersection with the empty set — **no permissions at all** | not stated anywhere; an empty array is a valid `text[]` and would produce a token that can call nothing. Undocumented, see [[authorization-validations]] |
| a `Permission` in no role's column | held by nobody | possible: `ROLE_PERMISSIONS` has no completeness guarantee, unlike `TOOL_PERMISSIONS` ([ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md)) |
| `user.role` not in the enum | **undefined** | nothing in the specification says whether this denies, throws, or defaults |

## Lifetime

`props` is created by the auth middleware in `src/index.ts` (planned, `business-docs/wiki/shared/mvp-spec.md:369`), attached to the `McpAgent` for the request, and discarded with it. Nothing about it is cached, and nothing outlives the request.

That is what makes revocation and suspension take effect at the next request with no invalidation step: there is no permission cache to invalidate.
