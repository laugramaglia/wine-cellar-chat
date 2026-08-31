---
feature: token-administration
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Token administration — related

## Features

| Feature | Relationship |
| --- | --- |
| [[authentication-index]] | **Consumes everything this feature writes.** It hashes the presented token, looks up the row, checks `revoked_at` / `expires_at` / user status, and resolves `role_permissions(role) ∩ (scopes ?? everything)` (`business-docs/wiki/shared/mvp-spec.md:343-346`). This feature decides what a token *is*; that one decides what it *does* on a request. |
| [[authorization-index]] | Owns the permission vocabulary that `scopes` is drawn from, and the invariant that a token narrows and never widens (`business-docs/wiki/shared/mvp-spec.md:124-142`). |
| [[user-administration-index]] | Owns the accounts tokens belong to. Three of its behaviours reach into this feature: `user_create` with `issue_token: true` mints the first key (`business-docs/wiki/shared/mvp-spec.md:223-225`); `user_delete` revokes tokens (`business-docs/wiki/shared/mvp-spec.md:234-235`); suspension does **not** (`business-docs/wiki/shared/mvp-spec.md:230`). |
| [[wine-catalog-index]], [[cellar-index]], [[reviews-index]], [[preferences-index]], [[recommendation-engine-index]] | Downstream only. A scoped token is what makes them selectively reachable — the acceptance test is a `catalog:read` token refused by `cellar_add` (`business-docs/wiki/shared/mvp-spec.md:426`). None of them read `api_tokens`. |

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[security]] | The disclosure rules, token format, trust boundaries, and the unresolved suspension/reinstatement behaviour all live there in shared form. Read it before changing anything here. |
| [[audit-logging]] | "token issued" and "token revoked" are written by this feature. `metadata` may carry a token's `label` and `id`; never its value (`business-docs/wiki/shared/mvp-spec.md:359-361`). |
| [[mcp-protocol]] | How a tool call and a tool error reach the client, and how `tools/list` filtering works. |
| [[error-codes]] | The shared catalogue behind the `401` and the permission-denied message. |
| [[data-types]] | The `api_tokens` row and the permission strings on the wire. |
| [[glossary]] | *token*, *scope*, *label*, *permission*, *role*. |
| [[divergences]] | Nine specification gaps found here, listed in [[token-administration-decisions]]. |

## Code shared with other features

None exists yet. When it does:

| Planned | Owner |
| --- | --- |
| `src/db/queries/tokens.ts` (`business-docs/wiki/shared/mvp-spec.md:376`) | Written by this feature, read by [[authentication-index]] on every request. Whichever owns it, the hashing and the last-4 truncation must exist exactly once. |
| `src/permissions.ts` — `Permission`, `ROLE_PERMISSIONS`, `TOOL_PERMISSIONS`, `can()` (`business-docs/wiki/shared/mvp-spec.md:372`) | [[authorization-index]]. `scopes` validation here must use that vocabulary, not a second copy of it. |
| `src/tools/admin/` (`business-docs/wiki/shared/mvp-spec.md:378`) | Shared directory with [[user-administration-index]]; separate tools, one permission-gating convention (`business-docs/wiki/shared/mvp-spec.md:352-353`). |

A second definition of "how a token is hashed" or "how many characters may be shown" would be a divergence the moment it appeared. Both belong in one place.
