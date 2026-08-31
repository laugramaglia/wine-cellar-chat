---
feature: authorization
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:153
updated: 2026-08-29
---

# Authorization — copy

This feature has exactly one user-visible string, and it carries more weight than its length suggests: it is the only place the permission model speaks to anyone, and its reader is a language model that will act on it.

| Key | Source text | Placeholders | Where it appears |
| --- | --- | --- | --- |
| `permission-denied` | `Permission denied: '{tool}' requires '{permission}'; your role is '{role}'.` | `{tool}` — the tool name; `{permission}` — the required `Permission`; `{role}` — the caller's `users.role` | the MCP error returned by any handler whose permission check fails (`business-docs/wiki/shared/mvp-spec.md:153-155`) |

The specification gives it as one worked instance, not as a template (`business-docs/wiki/shared/mvp-spec.md:153-155`):

```
Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.
```

Every punctuation mark in that line is load-bearing until someone decides otherwise: single quotes around all three variables, a colon after `Permission denied`, a semicolon before `your role`, a closing full stop. No implementation exists to check the wording against, so **this string is the specification and the wording is the contract** ([[divergences]]).

## Copy that asserts a rule

This string asserts three facts at once, and each is either enforced or it is a lie:

| Claim in the copy | Enforced? | By what |
| --- | --- | --- |
| "`{tool}` requires `{permission}`" | **Enforced.** One exhaustive `TOOL_PERMISSIONS` record is the single source for the mapping; the message must render from that record, not from a literal (`business-docs/wiki/shared/mvp-spec.md:161-162`, [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md)) | the type system |
| "your role is `{role}`" | **Enforced.** `props.role` is resolved from the database at request time (`business-docs/wiki/shared/mvp-spec.md:346-347`) | the auth flow |
| "Permission denied" — i.e. no work was done | **Enforced.** The handler re-checks *before doing any work* (`business-docs/wiki/shared/mvp-spec.md:149-150`) | [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) |

A denial rendered from a hard-coded string rather than from `TOOL_PERMISSIONS` would be a divergence, not a copy nit: it can state a required permission that the code does not actually check.

**The third claim also constrains implementation order.** Any handler that does work first and checks second makes this message false.

## Why the wording is a contract with the LLM client

The consumer is an agent, and the message is the only signal it gets. The wording is chosen to produce one specific behaviour: **report, do not retry** (`business-docs/wiki/shared/mvp-spec.md:154-155`).

| Wording property | The model behaviour it buys |
| --- | --- |
| Names the exact permission | The model can tell the user precisely what to request from an admin, ending the turn usefully rather than apologising |
| Names the caller's role | Establishes the denial as a property of the account, not of the call. Nothing about the arguments suggests itself as worth changing |
| No apology, no hedge, no "try" | Nothing reads as transient. A model that sees "unable to complete right now" will back off and retry |
| No alternative suggested | Nothing sends the model hunting for a neighbouring tool to accomplish the same thing by another route |

Rewording this message is therefore a behavioural change to every connected agent, not a translation task. Treat an edit to it as an API change.

## Not localized

Nothing is localized, and nothing should be. The reader is an MCP client's language model, not an end user reading UI chrome. There is no localization system in this project and none is planned (`business-docs/wiki/shared/mvp-spec.md:432-438`). Introducing one for this string would make the model's input locale-dependent, which is worse than English-only.

## Unused keys

None. There is exactly one string and it has exactly one call site.

## What has no copy at all

| Situation | What the caller gets |
| --- | --- |
| Tool hidden from `tools/list` | **Nothing.** Deliberate silence — no "some tools are hidden" notice, because the point is that the model cannot know (`business-docs/wiki/shared/mvp-spec.md:147-148`) |
| Edge auth failure | A bare `401` with no body specified (`business-docs/wiki/shared/mvp-spec.md:157-159`). Owned by [[authentication-index]] |
| A role or scope that grants nothing | Not specified. A token with empty `scopes` would list zero tools and explain nothing — see [[authorization-states]] |
