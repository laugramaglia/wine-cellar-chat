---
feature: authentication
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Authentication — related

## Features

Authentication runs before all of them and has no upstream of its own.

| Feature | Relationship |
| --- | --- |
| [[authorization-index]] | **The direct handoff.** Authentication produces `props.permissions`; authorization consumes it, for `tools/list` filtering and for every handler's re-check. The permission table and the role map are theirs; the *intersection* at step 4 is ours (`business-docs/wiki/shared/mvp-spec.md:346`). |
| [[token-administration-index]] | Creates and revokes the rows this feature reads. Owns `token_create`, `token_list`, `token_revoke`, and the once-only plaintext response. We own what those rows mean at request time. |
| [[user-administration-index]] | Owns `users`, its `role` and `status`, and the guards on changing them. `status != active` is our step 3, but the transition is theirs — including the suspension gap below. |
| [[wine-catalog-index]] | Consumes `props.userId` for the `owned` flag and `created_by`. |
| [[cellar-index]] | Consumes `props.userId` — every cellar row is scoped to it by construction, never by a `user_id` input. |
| [[reviews-index]] | Same. A review belongs to `props.userId`. |
| [[preferences-index]] | Same, and it is the visible proof of the model: the same profile appears in Claude and in Gemini because identity is in the database, not the client (`business-docs/wiki/shared/mvp-spec.md:217`, `business-docs/wiki/shared/mvp-spec.md:22-23`). |
| [[recommendation-engine-index]] | Reads the caller's prefs, cellar, and review history — all resolved from `props.userId`. |

Every one of the last five depends on exactly one guarantee from this feature: **`props.userId` is correct, and it is the only way to name a user** (`business-docs/wiki/shared/mvp-spec.md:350-351`).

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[security]] | Holds the cross-cutting rules: the structural `props`-not-input rule, the two enforcement layers, token handling, what is never logged, the trust boundaries. **Read it first.** This feature goes deeper on the per-request mechanics and does not restate it. |
| [[error-codes]] | The shared catalogue. Our five `401` conditions live there too; [[authentication-errors]] explains *why* they are one response. |
| [[mcp-protocol]] | What `POST /mcp`, `tools/list`, and Streamable HTTP mean, and where `props` sits on an `McpAgent`. |
| [[data-types]] | `users` and `api_tokens` shapes, and the enums step 3 and step 4 read. |
| [[audit-logging]] | What is audited — admin actions only. Authentication is **not** audited, and no failed-authentication logging is specified. |
| [[glossary]] | `props`, `scopes`, `label`, permission, role. |
| [[divergences]] | Where this feature's contradictions are recorded, chiefly the suspension gap. |

## Divergences this feature contributes

| Divergence | Detail |
| --- | --- |
| Suspension does not revoke | `business-docs/wiki/shared/mvp-spec.md:231` says suspending "kills every one of that user's tokens"; the mechanism is a failed user lookup, so reinstating restores every token the account ever had. Affects this feature and [[user-administration-index]]. **The wiki is right and the specification's wording is misleading — the specification should change.** |
| `last_used_at` is not an audit signal | Best-effort via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`), yet surfaced as "last activity" (`business-docs/wiki/shared/mvp-spec.md:227`) and "last used" (`business-docs/wiki/shared/mvp-spec.md:244`). **The wording of those two tools should change**, or the write should stop being best-effort. |
| No rate limiting | Unspecified everywhere. Also noted in [[security]]. **The specification should change.** |
| Immortal tokens by default | `expires_at` optional (`business-docs/wiki/shared/mvp-spec.md:339`), no rotation policy. **The specification should change** — a default expiry, or an explicit decision that there is none. |

## Code shared with other features

None exists yet. When it does, the auth middleware in `src/index.ts` and `src/auth.ts` (planned, `business-docs/wiki/shared/mvp-spec.md:369-371`) is shared by every request in the system and is owned here. `src/permissions.ts` (`business-docs/wiki/shared/mvp-spec.md:372`) is read at step 4 but owned by [[authorization-index]] — the split is deliberate: this feature performs the intersection, that feature defines the operands.
