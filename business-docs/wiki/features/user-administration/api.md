---
feature: user-administration
page: api
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:219
updated: 2026-08-29
---

# User administration — API

**There is no OpenAPI document, by decision.** The surface is MCP tools over Streamable HTTP at a single endpoint, `POST /mcp` (`business-docs/wiki/shared/mvp-spec.md:39`); an MCP tool surface is not a REST surface and OpenAPI cannot describe it without inventing paths that do not exist ([ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md)). The tool schemas below are therefore the contract, and this page is where they live. Protocol mechanics: [[mcp-protocol]].

| Tool | Permission | Handler (planned) | Called from |
| --- | --- | --- | --- |
| `user_create` | `admin:users` | `src/tools/admin/user_create.ts` | an admin's MCP client |
| `user_list` | `admin:users` | `src/tools/admin/user_list.ts` | an admin's MCP client |
| `user_update` | `admin:users` | `src/tools/admin/user_update.ts` | an admin's MCP client |
| `user_delete` | `admin:users` | `src/tools/admin/user_delete.ts` | an admin's MCP client |

Permission mapping: `business-docs/wiki/shared/mvp-spec.md:141`. Paths are from the planned layout at `business-docs/wiki/shared/mvp-spec.md:377-378` and **do not exist**; they are prose here and deliberately absent from `code_refs`.

## `user_create` (`business-docs/wiki/shared/mvp-spec.md:221-225`)

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | |
| `email` | string | yes | format and uniqueness unstated |
| `role` | `admin \| member \| guest` | no | **default `member`** |
| `issue_token` | boolean | no | mints the account's first key in the same call |
| `token_label` | string | no | e.g. `claude-desktop`, `gemini`, `phone` (`business-docs/wiki/shared/mvp-spec.md:76`) |

Returns the user row, **plus the plaintext token once** if one was issued (`business-docs/wiki/shared/mvp-spec.md:225`). That field is the single most sensitive response in the system — see [[user-administration-copy]] and [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md). It exists in exactly one response and is never retrievable again.

## `user_list` (`business-docs/wiki/shared/mvp-spec.md:227`)

No stated inputs. Returns every account: `role`, `status`, token count, last activity. No pagination, no filter, and no `limit` — unlike `wine_search`, which clamps to `limit` default 10 / max 50 (`business-docs/wiki/shared/mvp-spec.md:185`). Unstated whether soft-deleted accounts appear; an admin cannot see who was deleted if they do not.

"Last activity" derives from `api_tokens.last_used_at`, which is written best-effort via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`) — so it can under-report. See [[token-administration-index]].

## `user_update` (`business-docs/wiki/shared/mvp-spec.md:229-232`)

| Input | Type | Notes |
| --- | --- | --- |
| target user | id | the one place a `user_id` is legitimately accepted — `admin:*` tools are the sole exception to the props-only rule (`business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:352`, [[security]]) |
| `role` | `admin \| member \| guest` | |
| `status` | `active \| suspended` | `deleted` is set by `user_delete` but is not in this list — see [[divergences]] |

Both guards apply before any write: no self-demotion or self-suspension, and the last active admin is untouchable ([[user-administration-validations]]).

A role change takes effect on the target's **next request** — permissions are resolved per request from `role_permissions(user.role) ∩ (token.scopes ?? everything)`, never cached in the token (`business-docs/wiki/shared/mvp-spec.md:346`).

A suspension likewise bites at the next request, via the user-status check at step 3 of the auth flow (`business-docs/wiki/shared/mvp-spec.md:345`) — **not** by revoking token rows. Reinstating therefore restores every token.

## `user_delete` (`business-docs/wiki/shared/mvp-spec.md:234-236`)

| Input | Type | Notes |
| --- | --- | --- |
| target user | id | |
| `hard` | boolean | default false |

| Depth | `users` row | Tokens | Cellar items and reviews | Contributed wines |
| --- | --- | --- | --- | --- |
| soft (default) | kept, `status = deleted` | **revoked** | kept | kept |
| `hard: true` | dropped | revoked | **dropped** | **kept** (`business-docs/wiki/shared/mvp-spec.md:236`) |

The asymmetry is deliberate: the wine catalogue is shared across all users (`business-docs/wiki/shared/mvp-spec.md:61`), so one person leaving must not remove bottlings everyone else references. The consequence is that `wines.created_by` (`business-docs/wiki/shared/mvp-spec.md:87`) points at a user row that no longer exists after a hard delete — a dangling reference the schema must permit. See [[wine-catalog-index]]. Dropping reviews also changes the aggregate rating `wine_get` returns for those wines (`business-docs/wiki/shared/mvp-spec.md:189`).

## Response rules that matter here

- The plaintext token appears in exactly one response, once. Nowhere else, ever, including to an admin ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)).
- `user_list` returns a token **count**, never tokens. Token listing is `admin:tokens`, a different permission and a different feature (`business-docs/wiki/shared/mvp-spec.md:142`, [[token-administration-index]]).
- `user created` and `role changed` are written to `audit_log`; suspension and deletion are not listed (`business-docs/wiki/shared/mvp-spec.md:359-361`, [[audit-logging]]).

## Not specified

| Gap | Effect |
| --- | --- |
| No MCP error code for a permission denial — only the message text (`business-docs/wiki/shared/mvp-spec.md:153`) | Clients must string-match to distinguish it. See [[error-codes]]. |
| No error shape for either guard rejection | An agent cannot tell "you are the last admin" from a transport failure. |
| No behaviour for `user_update` on a nonexistent user | |
| `user_list` has no pagination and no stated ordering | |
| Whether hard delete is audited or reversible | Both unstated; see [[audit-logging]]. |
