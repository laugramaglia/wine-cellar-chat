---
feature: wine-catalog
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - README.md:139
  - README.md:329
updated: 2026-08-29
---

# Wine catalogue — errors

Shared catalogue: [[error-codes]]. The specification names exactly one error message and one HTTP status across the whole server; everything below that line is undefined.

| Condition | Code / exception | What the user sees | Recovery |
| --- | --- | --- | --- |
| No, malformed, unknown, revoked or expired bearer token | `401` at the Worker edge | Connection refused. No tool list, nothing (`README.md:145`) | Get a new token from an admin ([[token-administration-index]]) |
| Token's user is `status = suspended` | `401`, same path | Same as above (`README.md:144`) | An admin reactivates the account |
| A `guest` calls `wine_upsert` | MCP error, message form at `README.md:139` | `Permission denied: 'wine_upsert' requires 'catalog:write'; your role is 'guest'.` | Nothing the caller can do; the tool is also hidden from their `tools/list` (`README.md:132`) |
| A token scoped to `catalog:read` calls `wine_upsert` | MCP error, same form | Same shape. A token can only narrow its user's role, never widen it (`README.md:114`) | Use a token with `catalog:write` |
| `wine_upsert` with no `name` | **Undefined.** Presumably a zod schema rejection (`README.md:363`) | Not specified | — |
| `wine_id` names a row that does not exist | **Undefined.** No behaviour is stated for `wine_upsert`, `wine_get` or `cellar_add` | Not specified | — |
| An enum field given a value outside its list | **Undefined.** Not stated whether the tool schema, the database, or neither rejects it | Not specified | — |
| Two concurrent `wine_upsert` calls insert the same `(producer, name, vintage)` | Unique-constraint violation from Postgres (`README.md:74`) | Not specified. Whether the handler retries as an update is not stated | — |
| Database unreachable | **Undefined.** Neon is reached over HTTP (`README.md:28`); no timeout, retry or degraded mode is specified | Not specified | — |

Rejections are meant to be "explicit and boring", so the agent reports them instead of retrying in a loop (`README.md:140`). That intent is stated only for permission denials.

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `wine_upsert`, per field | A supplied value for a column that is already non-null | Nothing. No error, no warning. The field's absence from `fields_filled` is the only signal — the caller must diff to notice (`README.md:166`) |
| `wine_upsert`, per field | A value the agent hallucinated that happens to land on a null column | It is stored, indistinguishable from a verified one. Nothing records provenance |
| Auth middleware | `last_used_at` update failure — explicitly best-effort via `ctx.waitUntil` (`README.md:341`) | Nothing. Owned by [[authentication-index]] |

The first row is deliberate — it is the point of [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md). The second is a consequence of it that the specification does not acknowledge, and it belongs in [[divergences]].

## Retries

Nothing in this feature is retried. No retry policy, backoff, or idempotency key is specified for any tool. The one explicit anti-retry statement is about agents: permission errors are worded so the model reports them rather than looping (`README.md:140`).

## Not specified at all

- No MCP error **code** is defined anywhere — only the permission-denial message text (`README.md:139`). Tracked in [[divergences]].
- No distinction between "wine not found" and "you may not see it". There is nothing a caller may not see: the catalogue is shared (`README.md:47`).
- No rate limit, quota, or abuse response for a client that upserts in a loop against a shared table.
