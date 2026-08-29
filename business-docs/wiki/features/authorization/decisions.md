---
feature: authorization
page: decisions
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Authorization — decisions

ADRs that constrain this feature. The ADR itself is the record; this page is the index.

| ADR | Decision | Why it binds this feature |
| --- | --- | --- |
| [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) | `tools/list` is filtered per caller **and** every handler re-checks; the filter is a UX affordance, the handler check is the security boundary | This *is* the enforcement model. It forbids a handler relying on having been hidden, and it forces the deliberate redundancy of two checks for one rule |
| [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md) | The tool→permission map is one exhaustive `TOOL_PERMISSIONS` record; a tool without a permission fails to compile | Closes the way ADR-0010 decays. It makes the matrix in [[authorization-index]] a compiled artefact rather than documentation, and it is why the tool table in [[authorization-api]] can be called exhaustive |
| [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) | Static bearer tokens per client; OAuth 2.1 is the upgrade path | Context, not constraint. It is why narrowing is expressed as a nullable `scopes` column rather than OAuth scopes, and why a token is bearer-equivalent to its account's permissions narrowed only by that column |

Two more are adjacent and worth knowing: [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md) (no OpenAPI document, so [[authorization-api]] has no schemas to point at) and [ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md) (only the hash is stored, which is [[token-administration-index]]'s concern but shapes what a scope check can inspect).

## Open questions

Decisions this feature still needs. Each is a real ambiguity in `README.md`, not an invented one; the reasoning is in [[authorization-validations]].

| Question | Blocked on | Why it matters |
| --- | --- | --- |
| **What happens when a token's `scopes` names a permission its user's role does not grant?** Ignored by the intersection, or rejected at issuance and at use? | A human decision. `README.md:114` states the invariant, `README.md:332` gives a mechanism that satisfies it silently, and `README.md:225` implies a subset check that is never specified | Security. Under the "ignore" reading, a surplus scope lies dormant and **activates if the user is later promoted** — a privilege escalation nobody authored |
| Should `ROLE_PERMISSIONS` be exhaustive over the `Permission` union, the way `TOOL_PERMISSIONS` is over the tool union? | An extension of [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md), which explicitly leaves this open | Without it a `Permission` can exist that no role holds — fails closed, but silently |
| Can an admin's own permissions be narrowed by token scopes? | A one-line statement. The matrix and `README.md:325` imply yes; nothing says it | An implementer may special-case admins "for safety", removing a genuinely useful capability |
| What is the MCP error code for a permission denial? | Depends on the `tools/call` error convention chosen — see [[mcp-protocol]] | Only the message text is specified (`README.md:139`), so clients must match prose |
| What happens when `users.role` is not in the enum? | A decision on fail-closed vs throw, plus whether the database carries a `CHECK` constraint | Undefined behaviour at the most sensitive point in the system |
| Should denied attempts be audited? | A scope decision for [[audit-logging]] | `audit_log` records admin actions taken (`README.md:345-347`), so a member probing `user_create` repeatedly leaves no trace |

An open question recorded here is worth more than an ADR invented to fill the table. None of these should be closed by an implementer choosing quietly.
