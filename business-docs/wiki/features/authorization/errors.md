---
feature: authorization
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - README.md:139
  - README.md:142
updated: 2026-08-29
---

# Authorization — errors

Shared catalogue: [[error-codes]].

This feature produces **one** error. Everything else on this page is either a neighbouring feature's error or an unspecified gap.

| Condition | Code / exception | What the user sees | Recovery |
| --- | --- | --- | --- |
| Caller lacks the tool's declared permission | an MCP error — **no code is specified**, only the text (`README.md:139`) | `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` | None available to the caller. An admin must change their role or issue a wider token |
| Tool not in the caller's `tools/list` | not an error | the tool is absent; the model does not know it exists (`README.md:133-134`) | — |

## The denial message is deliberate

> Rejections are explicit and boring: an MCP error, `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` — so the agent reports it instead of retrying in a loop. (`README.md:139-141`)

"Boring" is the design goal. The caller is a language model. Three properties follow:

| Property | Why |
| --- | --- |
| **Terminal** | It states a fact about the account, not a transient condition. There is nothing to back off and retry — no wording suggests waiting or trying again |
| **Complete** | Tool, required permission, and current role. The model has everything needed to tell the user *what to ask an admin for*, in one message, without a second call |
| **Flat** | No apology, no suggestion, no alternative tool. A message that hints at a workaround invites the model to go looking for one |

An error that read "you are not authorized to do that" would produce a retry loop: the model has no way to distinguish it from a transient failure, and no information to act on. Full copy treatment in [[authorization-copy]].

## The deliberate asymmetry with authentication

| | [[authentication-index]] | Authorization |
| --- | --- | --- |
| Failure response | a bare `401`, identical for unknown, revoked, expired, and suspended (`README.md:143-145`) | a message naming the tool, the permission, and the role |
| Caller identity | unknown, and possibly hostile | already established |
| What the message leaks | nothing — the responses are indistinguishable, so a probe learns nothing | nothing new — the caller already knows their own role |

This is not an inconsistency. The bare `401` exists because an unauthenticated caller must not learn whether a token exists, is revoked, or belongs to a suspended user. By the time authorization runs, the caller has proved they hold a valid token for an active account; naming their own role back to them tells them nothing they did not supply.

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `tools/list` filtering | the *existence* of tools the caller cannot call | a shorter tool list, with no indication anything was removed. **Deliberate** (`README.md:133-134`) — the model must not be able to hallucinate a capability |
| A token scope naming a permission the role lacks | the extra scope, if the intersection simply drops it | the token silently has fewer permissions than its `scopes` column claims; `token_list` would report a scope that does nothing (`README.md:229`). **Not stated** whether this is intended — see [[authorization-validations]] |
| Denied attempts | the attempt itself | nothing is recorded. `audit_log` covers admin actions taken (`README.md:345-347`), not attempts refused. A member repeatedly probing `user_create` leaves no trace. See [[audit-logging]] |

The first row is a deliberate product decision. The second and third are gaps, and belong in [[divergences]].

## Retries

**Nothing is retried, and the message is worded to stop the caller retrying** (`README.md:140-141`). A permission denial is a fact about account configuration; retrying the identical call produces the identical result until an admin changes something.

Note the contrast with `last_used_at`, which is deliberately best-effort via `ctx.waitUntil` and never retried (`README.md:341`) — that is [[authentication-index]]'s concern.

## Not specified

| Gap | Why it matters |
| --- | --- |
| **No MCP error code.** Only the message string is given (`README.md:139`). | A client cannot distinguish a permission denial from any other tool error except by matching prose. The exact string becomes a de facto API — see [[authorization-copy]] |
| No stated behaviour when `user.role` is outside the enum. | The most sensitive failure in the system has no defined outcome |
| Whether the denial is an MCP protocol-level error or a tool result with `isError: true`. | Different clients surface these differently. See [[mcp-protocol]] |
