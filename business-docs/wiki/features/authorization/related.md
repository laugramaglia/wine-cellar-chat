---
feature: authorization
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Authorization — related

Authorization touches every feature on the server, because every tool passes through it. The distinction that matters is between the three features it *shares a boundary with* and the five whose tools it merely *gates*.

## Features

### The boundary

| Feature | Relationship |
| --- | --- |
| [[authentication-index]] | **Runs immediately before, every request.** Resolves the token to `{ userId, role, tokenId, permissions }` on `props` (`README.md:327-334`) and hands it over. Owns the `401` responses; authorization never sees an unauthenticated caller. Its failures are bare and indistinguishable; this feature's are explicit — see [[authorization-errors]] |
| [[token-administration-index]] | **Supplies the narrowing input.** Owns `token_create` and the `scopes` column that intersects with the role (`README.md:224-225`, `README.md:332`). The rule that scopes may only narrow is this feature's; enforcing the subset at issuance is theirs. The open question about a surplus scope spans both — [[authorization-validations]] |
| [[user-administration-index]] | **Supplies the role.** Owns `users.role` as data and the guards on changing it: an admin cannot demote or suspend themselves, and the last active admin cannot be demoted, suspended, or deleted (`README.md:216-218`). Those guards are the only thing preventing an unrecoverable server, and they are not permission checks |

### Gated by it

Each of these owns tools whose permission this feature defines; none of them owns the mapping. Full table in [[authorization-api]].

| Feature | Permissions that gate it |
| --- | --- |
| [[wine-catalog-index]] | `catalog:read`, `catalog:write` |
| [[cellar-index]] | `cellar:read`, `cellar:write` |
| [[reviews-index]] | `review:read`, `review:write` |
| [[preferences-index]] | `prefs:read`, `prefs:write` |
| [[recommendation-engine-index]] | `recommend` |

The read/write split is uniform across the first four, which is why the matrix is legible at a glance. `recommend` is the exception — a single permission for a read-only tool, granted to every role including `guest` (`README.md:126`).

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[security]] | The structural rule (handlers read the user from `props`, never from input) and the two-layer model both live there. **Read it before this feature's pages** — it states the boundary; these pages state the permission model inside it |
| [[glossary]] | `role`, `permission`, `scope`, and `props` all mean something specific here |
| [[error-codes]] | Where a permission denial would sit, if a code had been specified for it — it has not (`README.md:139`) |
| [[divergences]] | The surplus-scope ambiguity, the missing denial code, and the inert `prefs:read` for guests |
| [[mcp-protocol]] | `tools/list` and `tools/call` are the two methods this feature intercepts; the shape of an MCP error is defined there |
| [[audit-logging]] | Records admin actions taken (`README.md:345-347`), not permission denials. Whether denials should be audited is open — [[authorization-decisions]] |
| [[data-types]] | `Permission` as a string union, `users.role` as an enum, `api_tokens.scopes` as nullable `text[]` (`README.md:57-64`) |

## Code shared with other features

None exists yet. When it does, `src/permissions.ts` (`README.md:358`) is planned to hold the `Permission` union, `ROLE_PERMISSIONS`, `TOOL_PERMISSIONS`, and `can()` — **all four owned by this feature**, imported by every tool module and by `src/mcp.ts`.

That single-module design is not incidental: [ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md) depends on the tool-name union used by `TOOL_PERMISSIONS` being the same type the registration uses. If a feature declares its own local tool-name type, the compile-time guarantee becomes cosmetic. Any such duplication belongs in [[divergences]] the day it appears.
