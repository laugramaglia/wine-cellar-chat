---
feature: cellar
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:153
  - business-docs/wiki/shared/mvp-spec.md:343
updated: 2026-08-29
---

# Cellar — errors

Shared catalogue: [[error-codes]].

> **Unverified.** No implementation exists. Only two failure shapes are specified for the whole project — a `401` at the edge and a permission-denied MCP error. Everything a cellar tool can specifically get wrong is unspecified.

| Condition | Code / exception | What the user sees | Recovery |
| --- | --- | --- | --- |
| Missing or malformed `Authorization` header | `401` at the Worker edge | Connection refused; no tool list at all (`business-docs/wiki/shared/mvp-spec.md:159`) | Supply a valid token |
| Unknown, revoked, or expired token | `401` | Same | New token from an admin — [[token-administration-index]] |
| Token's user is `status != active` | `401` | Same (`business-docs/wiki/shared/mvp-spec.md:345`) | Admin reactivates — [[user-administration-index]] |
| Caller lacks `cellar:read` / `cellar:write` (e.g. a `guest`) | MCP error | `Permission denied: '<tool>' requires '<permission>'; your role is '<role>'.` (`business-docs/wiki/shared/mvp-spec.md:153`) | None from the client; the message is deliberately explicit so the agent reports it instead of retrying (`business-docs/wiki/shared/mvp-spec.md:154`) |
| Token scoped narrower than the user's role, e.g. `catalog:read` only | MCP error, same shape | Same. Tested in the definition of done: a `catalog:read` token is refused by `cellar_add` even though its user is a `member` (`business-docs/wiki/shared/mvp-spec.md:426`) | Use a token with the scope |
| `cellar_add` targets a non-existent `wine_id` | *(unspecified)* | — | — |
| `cellar_update` targets an item the caller does not own | *(unspecified)* | — | — |
| `cellar_update` would drive `quantity` below zero | *(unspecified)* | — | — |
| `cellar_update` on a `drunk` or `gifted` item | *(unspecified)* | — | — |
| Invalid `sort` key or filter value on `cellar_list` | *(unspecified)* | — | — |
| Database unreachable | *(unspecified)* | — | — |

The unspecified rows are the finding. Six of the eleven ways a cellar call can fail have no defined behaviour, and the two that are defined are both authentication concerns owned by [[authentication-index]] and [[authorization-index]].

## Ownership errors are structurally impossible

There is no "you do not own this cellar" error for reads, because there is no way to ask for someone else's: no non-admin tool takes a `user_id`, and handlers read the caller from `props` (`business-docs/wiki/shared/mvp-spec.md:169`, `business-docs/wiki/shared/mvp-spec.md:350`). The class of error is designed out rather than caught. See [[cellar-validations]] and [[security]].

`cellar_update` is the exception worth watching: it necessarily takes an **item id**, and an item id belongs to a user. Whether the handler scopes the update by `user_id` from `props` is not stated anywhere. It must, or the structural guarantee has a hole. Recorded in [[divergences]].

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `last_used_at` update | Written best-effort via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`) | Nothing; a stale `last_used_at` in `token_list`. Deliberate. |
| `cellar_add` inline-wine upsert | Merge semantics mean a supplied field that conflicts with an existing non-null value is **silently dropped**, not rejected ([ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md)) | The bottles are added; the corrected region is not. `wine_upsert` reports `fields_filled` (`business-docs/wiki/shared/mvp-spec.md:180`), but whether `cellar_add` echoes it is unstated — so via this path the drop may be invisible. |

No `catch` blocks exist to inspect. The second row is a real product decision inherited from the catalogue, and it reaches the cellar only because `cellar_add` can upsert.

## Retries

None specified, in either direction. The permission-denial message is worded to stop an agent retrying in a loop (`business-docs/wiki/shared/mvp-spec.md:154`) — that is the only retry-shaped rule in the project.
