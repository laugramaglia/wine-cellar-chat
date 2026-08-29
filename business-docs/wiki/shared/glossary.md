---
page: glossary
status: stub
updated: 2026-08-29
code_refs:
  - README.md:43
---

# Glossary

The language the team, the database, and the MCP tools all use. Where the layers disagree, that disagreement is the entry.

## Wine

**Definition.** An abstract bottling — *Catena Malbec 2019* — shared across every user of the server.

- **Not to be confused with:** [[glossary]] → *Cellar item*, which is bottles of a wine that one user owns. Recommending "a Malbec" searches wines; deciding "what to open tonight" searches cellar items.
- **In code:** `wines` table; `wine_id` on every other table.
- **Owned by:** [[wine-catalog-index]]

## Cellar item

**Definition.** A holding of a specific wine by a specific user, with quantity, what they paid, and a drink-by window.

- **Not to be confused with:** a review. Owning a bottle and having drunk it are separate records; `review_write` with `consume: true` links them.
- **In code:** `cellar_items` table; `status: in_cellar | drunk | gifted`.
- **Owned by:** [[cellar-index]]

## NV

**Definition.** Non-vintage — a bottling with no single harvest year.

- **In code:** `wines.vintage IS NULL`. It participates in the uniqueness key `(lower(producer), lower(name), vintage)` — and because a null never equals a null in Postgres, that key does **not** constrain NV rows at all. Unlimited duplicate NV bottlings of the same producer and name are permitted, and a `vintage = $3` lookup never matches an existing NV row, so every NV upsert inserts again. See [[divergences]].
- **Owned by:** [[wine-catalog-index]]

## Palate profile

**Definition.** A user's stored preferences — likes, dislikes, budget band, and their sweetness/body/tannin/acidity targets — applied by the engine unless a request opts out.

- **Not to be confused with:** the per-request soft preferences passed to `wine_recommend`, which are one-shot and take precedence over the stored profile.
- **In code:** `user_prefs` table, one row per user; `use_prefs: true` on the recommend input.
- **Owned by:** [[preferences-index]]

## Permission

**Definition.** A capability string such as `cellar:write` that a tool requires and a caller either holds or does not.

- **Not to be confused with:** a *role*, which is a named bundle of permissions, or a token *scope*, which can only narrow what a role already grants.
- **In code:** the `Permission` union, `ROLE_PERMISSIONS`, and `TOOL_PERMISSIONS`.
- **Owned by:** [[authorization-index]]

## Scope

**Definition.** An optional subset of permissions attached to one API token, so a single client can be handed less power than its user has.

- **Not to be confused with:** a role. `scopes = null` means "inherit the role in full". A scope can never widen.
- **In code:** `api_tokens.scopes text[]`, nullable.
- **Owned by:** [[token-administration-index]]

## Reason

**Definition.** A human-readable string explaining one component of a recommendation's score.

- **Not to be confused with:** a penalty, which explains a deduction. Both ship on every result.
- **In code:** `reasons: string[]` / `penalties: string[]` on the `wine_recommend` result.
- **Owned by:** [[recommendation-engine-index]]

## Hard filter

**Definition.** A condition that removes a wine from the result set entirely, before any scoring happens.

- **Not to be confused with:** a low score. A filtered wine is absent; a badly-scoring wine is present and ranked last.
- **Owned by:** [[recommendation-engine-index]]

## Upsert

**Definition.** Creating a wine, or adding data to one that already exists, in a single call.

- **Not to be confused with:** an update. The merge **fills blanks and never overwrites a non-null field** unless `overwrite: true`.
- **In code:** `wine_upsert`, returning `created: bool` and `fields_filled: string[]`.
- **Owned by:** [[wine-catalog-index]]
