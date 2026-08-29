---
feature: authentication
page: api
status: stub
source_of_truth: wiki
code_refs:
  - README.md:384
updated: 2026-08-29
---

# Authentication — API

**This feature exposes no MCP tools.** Nothing in the tool catalogue (`README.md:152-234`) belongs to it. Authentication is a property of the transport: it runs on the way in, on every request, and is finished before the MCP layer starts.

**There is no OpenAPI document.** The surface is MCP over Streamable HTTP, not REST — [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). Protocol mechanics live in [[mcp-protocol]].

## The transport contract

| Method + path | Purpose | Auth | Handler |
| --- | --- | --- | --- |
| `POST /mcp` | the entire MCP surface — Streamable HTTP, remote only, no stdio binary (`README.md:25`, `README.md:384`) | `Authorization: Bearer <token>`, **required on every request** | `src/index.ts` → auth middleware → `WineMcp.serve("/mcp")` (planned, `README.md:355`) |

There is no second path. No `/health`, no `/token`, no `/authorize`, no OAuth metadata endpoint — the last of these deliberately, [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md).

### Request

| Header | Value | Required |
| --- | --- | --- |
| `Authorization` | `Bearer wc_<43 base64url chars>` | yes, on every request (`README.md:26`) |

The credential is the whole of the authentication input. Nothing is read from the body, from a cookie, from a query parameter, or from the MCP `initialize` payload. **No tool takes a `user_id`** except the `admin:*` tools (`README.md:154-156`), so there is no in-band way to claim an identity at all — the structural rule, stated in [[security]].

### Responses

| Status | When | Body |
| --- | --- | --- |
| `401` | any of the five authentication failures | unspecified, and identical across all five — [[authentication-errors]] |
| passes through | authentication succeeded | whatever the MCP layer returns |

A `401` terminates the request at the edge: **connection refused, no tool list, nothing** (`README.md:145`).

## Request rules that matter here

| Rule | Expression | Source |
| --- | --- | --- |
| Auth precedes authorization | edge check runs before any permission check | `README.md:143` |
| Permission resolution | `role_permissions(user.role) ∩ (token.scopes ?? everything)` | `README.md:332` |
| Identity handoff | `{ userId, role, tokenId, permissions }` as `props` on the `McpAgent` | `README.md:333` |

`??` is a business rule, not a defensive default: a null `scopes` means *inherit the role in full*, not *no permissions* (`README.md:63`).

## Response rules that matter here

| Rule | Detail |
| --- | --- |
| The `401` says nothing | No reason code, no distinguishing text. Deliberate — [[authentication-errors]] |
| No token ever leaves the server | Not in a response, not in a log, plaintext or hashed (`README.md:347`). The one exception is the creation response, exactly once ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)) — and that belongs to [[token-administration-index]] |
| `tools/list` is filtered by `props.permissions` | So the response shape itself varies by caller (`README.md:132-134`) — [[authorization-index]] |
| No identity echo | Nothing returns "you are logged in as…". There is no whoami tool |

## Side effects

| Effect | Guarantee |
| --- | --- |
| `api_tokens.last_used_at` updated | **best-effort only**, via `ctx.waitUntil` (`README.md:341`). Not transactional with the request, not retried, not reported if it fails |
| Audit log entry | none. Only admin actions are audited (`README.md:345`) — [[audit-logging]] |

## Deployment surface

| | |
| --- | --- |
| Runtime | TypeScript on Cloudflare Workers, `McpAgent` from the `agents` SDK (`README.md:24`) |
| Binding | `WineMcp` needs a Durable Object binding and a `new_sqlite_classes` migration, plus `nodejs_compat` (`README.md:374-376`) |
| Secrets | `DATABASE_URL` via `wrangler secret put`; `.dev.vars` for local `wrangler dev` (`README.md:377`) |

`DATABASE_URL` is the one credential the server itself holds. Nothing in the specification describes rotating it.

## Planned

| Endpoint / surface | Status |
| --- | --- |
| OAuth 2.1 authorization + token endpoints | out of scope for the MVP; the named upgrade path (`README.md:35`, `README.md:421`) — [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) |
| MCP *resources* and *prompts* | after the MVP (`README.md:422-423`). Both would be filtered by `props.permissions` the same way `tools/list` is; nothing says so yet |

`POST /mcp` itself does not exist. `wrangler deploy` putting a reachable `/mcp` endpoint live is the first unchecked box in the definition of done (`README.md:401`).
