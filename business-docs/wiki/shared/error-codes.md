---
page: error-codes
status: stub
updated: 2026-08-29
code_refs:
  - README.md:139
---

# Error catalogue

Shared failure conditions. A feature's own `errors.md` links here rather than restating these.

Source: `README.md:139-151` (rejections and edge auth), `README.md:327-342` (per-request flow).

## Transport-level — before any tool runs

| Condition | Response | What the caller sees |
| --- | --- | --- |
| No `Authorization` header, or malformed | `401` | Connection refused. No tool list, nothing. |
| Token unknown (no matching hash) | `401` | as above |
| Token revoked (`revoked_at` set) | `401` | as above |
| Token expired (`expires_at` passed) | `401` | as above |
| Token valid but user `status != active` | `401` | as above |

All five are deliberately **indistinguishable to the caller** — one `401`, no detail. Telling a client *which* of these applies tells an attacker whether a token exists.

## Tool-level — after auth, before work

| Condition | Response | Message |
| --- | --- | --- |
| Caller lacks the tool's required permission | MCP error | `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` |

This message is deliberately explicit and boring so the **agent reports it instead of retrying in a loop** — a vague or retryable-looking error makes an LLM client burn a conversation rediscovering that it is not allowed. See [[authorization-index]].

Note the asymmetry, and that it is intentional: transport failures say nothing, tool failures say everything. By the time a permission check runs, the caller's identity is already established, so naming the missing permission leaks nothing they could not determine by reading the docs.

## Guard rejections — administration

| Condition | Owner |
| --- | --- |
| An admin demoting or suspending themselves | [[user-administration-index]] |
| Demoting, suspending, or deleting the last active admin | [[user-administration-index]] |
| A token scope that is not a subset of its user's role permissions | [[token-administration-index]] |

## Not yet specified

The specification does not state:

- the MCP error **code** (as opposed to message) for a permission denial;
- what a tool returns when `wine_id` names a wine that does not exist;
- what happens when `cellar_update` would drive `quantity` below zero;
- whether a validation failure surfaces as an MCP error or a structured result.

These are real gaps, not omissions from this page. Resolve them before implementing, and record the answers here.
