---
feature: authorization
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:144
  - business-docs/wiki/shared/mvp-spec.md:341
updated: 2026-08-29
---

# Authorization — flow

## Happy path

Authorization runs twice per session, in two different shapes.

**A. At `tools/list` — visibility.**

1. The caller's effective permission set is already on `props`, resolved during authentication (`business-docs/wiki/shared/mvp-spec.md:346-348`).
2. The server walks `TOOL_PERMISSIONS` and keeps only tools whose declared permission is in that set (`business-docs/wiki/shared/mvp-spec.md:146-147`, `business-docs/wiki/shared/mvp-spec.md:161`).
3. The client receives that filtered list. A member's Claude session simply never sees `user_create`, so the model cannot try it and cannot hallucinate that it exists (`business-docs/wiki/shared/mvp-spec.md:147-148`).

**B. At `tools/call` — execution.**

4. The handler looks up its own declared permission and re-checks it against `props.permissions` before doing any work (`business-docs/wiki/shared/mvp-spec.md:149-150`).
5. Held → the handler proceeds and reads the calling user from `props`, never from tool input (`business-docs/wiki/shared/mvp-spec.md:350`).
6. Not held → an MCP error carrying the exact denial message (`business-docs/wiki/shared/mvp-spec.md:153-155`). No work is done, nothing is written.

Step 4 is the security boundary. Steps 1–3 are a UX affordance for the model. See [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md).

## Preconditions

Everything in [[authentication-index]] has already succeeded (`business-docs/wiki/shared/mvp-spec.md:341-348`):

| Precondition | Failure mode |
| --- | --- |
| `Authorization: Bearer <token>` present and well-formed | `401`, no tool list |
| Token known, not revoked, not expired | `401` |
| `users.status = active` | `401` |
| `props = { userId, role, tokenId, permissions }` populated | — |

**Authorization never sees an unauthenticated caller.** A denial from this feature therefore always concerns a caller whose identity is established — which is why the message can name their role without leaking anything ([[authorization-errors]]).

## Postconditions

| Outcome | State afterwards |
| --- | --- |
| Permitted | The handler ran. Its own feature's postconditions apply. `last_used_at` updated best-effort via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`) — that belongs to [[authentication-index]]. |
| Denied | Nothing was written. No audit-log row: `business-docs/wiki/shared/mvp-spec.md:359-361` logs *admin actions taken*, not attempts refused. See [[audit-logging]]. |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Tool hidden and never called | Permission not in `props.permissions` at list time | The model never learns the tool exists (`business-docs/wiki/shared/mvp-spec.md:147`) |
| Tool hidden but called anyway | A client calls a tool name it was not offered | Handler check denies it — the tool must never rely on having been hidden (`business-docs/wiki/shared/mvp-spec.md:150-151`) |
| Role grants, token scope withholds | `token.scopes` is non-null and omits the permission | Denied. Tested by `business-docs/wiki/shared/mvp-spec.md:426`: a `catalog:read`-only token is refused by `cellar_add` even though its user is a member |
| Role withholds, token scope grants | `token.scopes` names a permission the role lacks | **Undefined.** `business-docs/wiki/shared/mvp-spec.md:128` says a token can only narrow — but is the extra scope ignored, or is the token rejected? See [[authorization-validations]] |
| `token.scopes = null` | The default | Token inherits the user's role in full (`business-docs/wiki/shared/mvp-spec.md:77-78`) |
| Admin calling an `admin:*` tool | Holds `admin:users` / `admin:tokens` | Gated on the permission **first**, before any `user_id` input is honoured (`business-docs/wiki/shared/mvp-spec.md:351-353`) |

## Timing and automatic behaviour

There is none. Authorization has no timers, no retries, no debounce, and no cache with a TTL. The permission set is computed once per request during authentication (`business-docs/wiki/shared/mvp-spec.md:346`) and is immutable for the life of that request.

One consequence is worth stating: **a role change or a token revocation takes effect on the next request, not the current one.** Suspending a user makes all of their existing tokens fail with `401` immediately, per `business-docs/wiki/shared/mvp-spec.md:427` — "immediately" meaning at the next request, since there is nothing to interrupt in flight.

## What is deliberately not here

| Not here | Why |
| --- | --- |
| Row-level or ownership checks | Not a permission concern. "You can only touch your own cellar" is structural: no non-admin tool accepts a `user_id` (`business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:350`). See [[security]] |
| Per-tool argument authorization | Every tool declares exactly one permission (`business-docs/wiki/shared/mvp-spec.md:126`). There is no notion of "may write this field but not that one" |
| Custom roles, per-user grants | Explicitly post-MVP (`business-docs/wiki/shared/mvp-spec.md:435`) |
| Deny rules | The model is grant-only. There is no way to subtract a permission from a role, only to narrow a token |
