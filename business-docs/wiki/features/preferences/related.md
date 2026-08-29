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
| [[recommendation-engine-index]] | **The only consumer.** It applies `avoid` and `dislikes` as hard filters (`README.md:286-288`) and `likes`, the palate targets and the budget band as scored components worth `0.15`, `0.25` and `0.05` (`README.md:295-298`). It also owns `use_prefs`, the switch that ignores this feature entirely (`README.md:250`). |
| [[wine-catalog-index]] | Supplies the fields a preference is compared against — `grapes`, `region`, `sweetness`, `body`, `tannin`, `acidity`, `avg_price`, `style_tags` (`README.md:70-73`). A preference over an attribute the catalogue does not record cannot be enforced; that is exactly the `avoid` problem. |
| [[reviews-index]] | The *other* model of taste. Past ratings drive the Personal-history component at `0.20` (`README.md:296`) and are never written back into `user_prefs`. Stated taste and revealed taste stay separate on purpose. |
| [[cellar-index]] | Independent, but paired: both are per-user rows reached through the same token, and the definition of done tests them together — "one cellar and one prefs profile" (`README.md:402`). |
| [[authentication-index]] | Resolves a bearer token to the `user_id` this feature is keyed on (`README.md:327-333`). The cross-client promise is its guarantee, kept here. |
| [[authorization-index]] | Owns `prefs:read` / `prefs:write` and the two-layer enforcement that gates both tools (`README.md:124-125`, `README.md:130-137`). |
| [[token-administration-index]] | A token's `scopes` can narrow a member's access below `prefs:write` (`README.md:113-114`) — a client that may read taste but not change it. |
| [[user-administration-index]] | Creates users with no prefs row (`README.md:207`) and deletes them; `hard: true` drops cellar items and reviews and does not mention prefs (`README.md:220-222`). |

## Shared components and concerns

| Shared page | Why it applies |
| --- | --- |
| [[glossary]] | *palate profile*, *hard filter*, *soft preference*, *merge vs replace* |
| [[data-types]] | the `sweetness` and `body`/`tannin`/`acidity` enums (`README.md:87-88`) are shared verbatim between `user_prefs` and `wines` — that shared scale is what makes palate-fit distance meaningful |
| [[error-codes]] | the `401` and permission-denied shapes this feature inherits (`README.md:139-145`) |
| [[security]] | the profile is personal data; it is returned in full to any client holding the user's token, and no per-client redaction exists |
| [[audit-logging]] | preference writes are **not** audited — `audit_log` records admin actions only (`README.md:346`) |
| [[mcp-protocol]] | both tools are MCP tool calls over `/mcp` (`README.md:25`); there is no REST surface and no OpenAPI document |
| [[divergences]] | the `avoid`-versus-schema mismatch, the unnormalized free-form vocabulary, and the `replace`/`overwrite` naming split |

## Code shared with other features

None yet — no code exists. When it does, the specification's sketch puts the row's access
in `src/db/queries/prefs.ts` and each tool in its own file under `src/tools/`
(`README.md:362-364`). The enums in [[data-types]] are the one thing that must **not** be
duplicated: `user_prefs` and `wines` have to read from the same definition, or palate-fit
distance is comparing two scales that only look alike.
