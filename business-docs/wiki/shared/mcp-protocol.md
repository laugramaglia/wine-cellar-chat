---
page: mcp-protocol
status: stub
updated: 2026-08-29
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:19
---

# MCP protocol conventions

Cross-cutting rules every feature's tools obey. Source: `business-docs/wiki/shared/mvp-spec.md:19-27`, `business-docs/wiki/shared/mvp-spec.md:144-165`, `business-docs/wiki/shared/mvp-spec.md:395-411`.

## Surface

| | |
| --- | --- |
| Transport | Streamable HTTP at `/mcp` — remote only, no stdio binary |
| Runtime | TypeScript on Cloudflare Workers, `McpAgent` from the `agents` SDK |
| Auth header | `Authorization: Bearer <token>` |
| Identity | lives in the database, not the client — every client sees the same cellar |

One endpoint carries every tool call. That is why there is no OpenAPI document: see [ADR-0002](../decisions/0002-no-openapi-for-an-mcp-surface.md).

## Tool naming

`<noun>_<verb>` for domain tools (`wine_upsert`, `cellar_add`, `review_write`, `prefs_get`), `<entity>_<verb>` for administration (`user_create`, `token_revoke`). The engine's tool is the one exception and is named for what it does: `wine_recommend`.

## The permission declaration rule

**Every tool declares one required permission, in one table in code** — a `TOOL_PERMISSIONS` record — **so that adding a tool without deciding its permission is a type error, not an accidental hole** (`business-docs/wiki/shared/mvp-spec.md:161`).

This is a compile-time guarantee, and it is listed in the definition of done (`business-docs/wiki/shared/mvp-spec.md:426`). A tool registered anywhere else, or with an optional permission, defeats it.

## Tool visibility

`tools/list` is filtered per caller. A member's client never sees `user_create`, so the model cannot try it and cannot hallucinate that it exists. See [[security]] for why this is an affordance and not a boundary.

## What the client is responsible for

Vision and OCR happen in the connected agent (`business-docs/wiki/shared/mvp-spec.md:25`). Enrichment — region, grapes, notes — is the agent's job too, because it already has web search (`business-docs/wiki/shared/mvp-spec.md:48`). The server takes structured fields and does not call out to anything.

## Deployment shape

`McpAgent` is a Durable Object, so `wrangler.jsonc` needs a DO binding, a `new_sqlite_classes` migration for `WineMcp`, and `nodejs_compat` (`business-docs/wiki/shared/mvp-spec.md:390`). `DATABASE_URL` is a Worker secret; `.dev.vars` carries it locally.
