---
feature: preferences
page: related
status: stub
source_of_truth: wiki
code_refs: []
updated: 2026-08-29
---

# Preferences — related

## Features

| Feature | Relationship |
| --- | --- |
| [[recommendation-engine-index]] | **The only consumer.** It applies `avoid` and `dislikes` as hard filters (`business-docs/wiki/shared/mvp-spec.md:300-302`) and `likes`, the palate targets and the budget band as scored components worth `0.15`, `0.25` and `0.05` (`business-docs/wiki/shared/mvp-spec.md:309-312`). It also owns `use_prefs`, the switch that ignores this feature entirely (`business-docs/wiki/shared/mvp-spec.md:264`). |
| [[wine-catalog-index]] | Supplies the fields a preference is compared against — `grapes`, `region`, `sweetness`, `body`, `tannin`, `acidity`, `avg_price`, `style_tags` (`business-docs/wiki/shared/mvp-spec.md:84-87`). A preference over an attribute the catalogue does not record cannot be enforced; that is exactly the `avoid` problem. |
| [[reviews-index]] | The *other* model of taste. Past ratings drive the Personal-history component at `0.20` (`business-docs/wiki/shared/mvp-spec.md:310`) and are never written back into `user_prefs`. Stated taste and revealed taste stay separate on purpose. |
| [[cellar-index]] | Independent, but paired: both are per-user rows reached through the same token, and the definition of done tests them together — "one cellar and one prefs profile" (`business-docs/wiki/shared/mvp-spec.md:416`). |
| [[authentication-index]] | Resolves a bearer token to the `user_id` this feature is keyed on (`business-docs/wiki/shared/mvp-spec.md:341-347`). The cross-client promise is its guarantee, kept here. |
| [[authorization-index]] | Owns `prefs:read` / `prefs:write` and the two-layer enforcement that gates both tools (`business-docs/wiki/shared/mvp-spec.md:138-139`, `business-docs/wiki/shared/mvp-spec.md:144-151`). |
| [[token-administration-index]] | A token's `scopes` can narrow a member's access below `prefs:write` (`business-docs/wiki/shared/mvp-spec.md:127-128`) — a client that may read taste but not change it. |
| [[user-administration-index]] | Creates users with no prefs row (`business-docs/wiki/shared/mvp-spec.md:221`) and deletes them; `hard: true` drops cellar items and reviews and does not mention prefs (`business-docs/wiki/shared/mvp-spec.md:234-236`). |

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[glossary]] | *palate profile*, *hard filter*, *soft preference*, *merge vs replace* |
| [[data-types]] | the `sweetness` and `body`/`tannin`/`acidity` enums (`business-docs/wiki/shared/mvp-spec.md:101-102`) are shared verbatim between `user_prefs` and `wines` — that shared scale is what makes palate-fit distance meaningful |
| [[error-codes]] | the `401` and permission-denied shapes this feature inherits (`business-docs/wiki/shared/mvp-spec.md:153-159`) |
| [[security]] | the profile is personal data; it is returned in full to any client holding the user's token, and no per-client redaction exists |
| [[audit-logging]] | preference writes are **not** audited — `audit_log` records admin actions only (`business-docs/wiki/shared/mvp-spec.md:360`) |
| [[mcp-protocol]] | both tools are MCP tool calls over `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`); there is no REST surface and no OpenAPI document |
| [[divergences]] | the `avoid`-versus-schema mismatch, the unnormalized free-form vocabulary, and the `replace`/`overwrite` naming split |

## Code shared with other features

None yet — no code exists. When it does, the specification's sketch puts the row's access
in `src/db/queries/prefs.ts` and each tool in its own file under `src/tools/`
(`business-docs/wiki/shared/mvp-spec.md:376-378`). The enums in [[data-types]] are the one thing that must **not** be
duplicated: `user_prefs` and `wines` have to read from the same definition, or palate-fit
distance is comparing two scales that only look alike.
