---
page: divergences
status: stub
updated: 2026-08-29
code_refs:
  - README.md:221
---

# Divergences

Known contradictions: where the wiki, the specification, and the code disagree. Recorded rather than quietly resolved.

## The standing divergence: nothing is implemented

| What | Detail |
| --- | --- |
| **Contradiction** | Every rule in this wiki is described in the present tense by its source (`README.md`), but no code implements any of it. |
| **Status** | Accepted, and expected to close feature by feature. |
| **Effect** | Every page is `status: stub`; every derived rule is `status: aspirational`; `code_refs` cite `README.md`, not source files. |
| **Resolves when** | Code lands and `/business-wiki:feature <slug>` re-traces that feature's claims to real files. |

Until then, **no claim in this wiki has been verified against a running program.** That is the single most important thing a reader can know about it.

## Repository history does not match the project

| What | Detail |
| --- | --- |
| **Contradiction** | The git history before `chore: reset repo to the Wine Cellar MCP project` belongs to an unrelated Go chat/telegram microservice stack. The directory is still named `wine-cellar-chat`. |
| **Status** | Accepted, and recorded as [[0014-repurpose-this-repository]]. The repository was repurposed rather than recreated. |
| **Effect** | Blame, history, and any archaeology before that commit are about a different program. Do not read them as context for this one. |

## Specification gaps found while authoring

Points where `README.md` is silent or ambiguous, listed so the next reader does not mistake the silence for a decision. Each belongs to the feature named.

| Gap | Feature |
| --- | --- |
| **Determinism and the reason contract conflict.** Tie-breaking between two wines with an equal score is unspecified. Determinism (`README.md:303`) requires a total order, while [ADR-0005](../decisions/0005-every-point-of-score-maps-to-a-reason.md) forbids any ordering influence with no reason string. Whatever tie-break is chosen violates one of the two or needs an explicit exemption. This is a contradiction, not a gap. | [[recommendation-engine-index]] |
| **An unmatched `food` is silently ignored.** If `food` matches nothing in the pairing table, the 0.30 component is dropped and the remaining weights renormalize upward, so "what goes with lamb" can return a confident list in which food played no part. The only signal is the absence of a pairing sentence in `reasons`. | [[recommendation-engine-index]] |
| Whether `use_prefs: false` also disables the `prefs.avoid` and `prefs.dislikes` **hard** filters is unstated. Read literally it does, and `avoid` carries allergens (`README.md:68`) — a safety question, not a preference one. | [[recommendation-engine-index]] |
| No numeric distance defined between adjacent points of the 5-point body/tannin/acidity scale, which "palate fit" (weight 0.25) depends on. No stated rule for `tannin = null`, normal for whites (`README.md:89`). | [[recommendation-engine-index]] |
| The built-in food-pairing table is described by three examples and an ellipsis, never enumerated — the largest single weight (0.30) rests on an undocumented domain judgement nobody owns. | [[recommendation-engine-index]] |
| How `reasons` strings are generated is unspecified, though ADR-0005 makes them the contract. | [[recommendation-engine-index]] |
| A candidate with zero usable scoring components is undefined: renormalization divides by a weight sum of zero, and the entry would carry no `reasons`, breaking `README.md:407`. | [[recommendation-engine-index]] |
| A `score` renormalized over a partial component set is ranked against one computed over all six as if comparable. Nothing in the result says how many components contributed. | [[recommendation-engine-index]] |
| **`cellar_update` is where the ownership guarantee could leak.** It necessarily takes an item id — the only place a caller names a row belonging to a user — and nothing states the update is scoped by `user_id` from `props`. The structural rule (`README.md:336`) covers tools that take a `user_id`, not this. | [[cellar-index]] |
| Behaviour is undefined when `cellar_update` would take `quantity` below zero. | [[cellar-index]] |
| `ready_to_drink` semantics when `drink_from`/`drink_until` are null is unstated — and null is the *common* case for a bottle added from a photo. | [[cellar-index]] |
| No default is stated for `drink_soon`'s "within N months". | [[cellar-index]] |
| Whether `drunk` and `gifted` are terminal states is unstated. | [[cellar-index]] |
| Partial gifting is unrepresentable: `status` is per row, so it cannot describe some-but-not-all bottles. Decrement vs row-split is unspecified. | [[cellar-index]] |
| Whether the last-bottle auto-`drunk` fires on the `review_write consume: true` path is unstated; the rule appears only under `cellar_update` (`README.md:184`). | [[cellar-index]] |
| No `drink_from <= drink_until` ordering constraint; an inverted window silently breaks both predicates. | [[cellar-index]] |
| **The NV uniqueness key does not constrain.** `UNIQUE (lower(producer), lower(name), vintage)` cannot constrain NV rows, because in Postgres a null never equals a null — so duplicate NV bottlings are permitted without error, and a `vintage = $3` lookup never matches an existing NV row, making every NV upsert insert again. Needs `NULLS NOT DISTINCT`, a sentinel vintage, or `IS NOT DISTINCT FROM`; the spec picks none. | [[wine-catalog-index]] |
| **No field-level provenance.** `created_by` names only the row's creator, so in a catalogue merged by many agents "who claimed this region" is unanswerable, and a hallucinated value landing on a null column is indistinguishable from a verified one. Interacts directly with the fill-blanks merge of [ADR-0007](../decisions/0007-upsert-fills-blanks-and-never-overwrites.md). | [[wine-catalog-index]] |
| `wine_search.query` → SQL is never described. Nothing states it is parameterized and no matching strategy is named. It is the largest injection surface in the server. | [[wine-catalog-index]] |
| `abv` and `avg_price` have no stated unit, range, precision, or currency, yet both are compared against user-supplied numbers in filtering and budget scoring. | [[wine-catalog-index]] |
| No normalization stated for `grapes` / `region` / `country` / `subregion`, though the identity key deliberately lowercases `producer` and `name` and `wine_search` filters on region and grapes. | [[wine-catalog-index]] |
| No length bound on any string, notably `tasting_notes` — unbounded agent-written text on a row shared by every user. | [[wine-catalog-index]] |
| `wine_upsert` refusing a value is silent: `fields_filled` names what was written, never what was rejected. | [[wine-catalog-index]] |
| Behaviour when `wine_id` names a nonexistent wine is undefined, for `wine_upsert`, `wine_get` and `cellar_add` alike. | [[wine-catalog-index]] |
| **Whether one user may review the same wine twice is entirely unspecified** — and it determines what "avg 92 over 4 reviews" counts, a string shown to the user as fact. | [[reviews-index]] |
| **Cross-user review visibility cannot be resolved from the spec.** `review:read` is a guest permission (`README.md:120`) while the guest role description names only catalogue and own prefs (`README.md:108`); aggregate ratings are already cross-user by design (`README.md:176`), so "reviews are private" is already false numerically. The live question is whether another user's `body_text` and `occasion` are readable. Unresolved; worth an ADR either way. | [[reviews-index]] |
| Whether `rating` bounds (1–100) are enforced in the tool schema, the database, or both. Stated twice (`README.md:80`, `README.md:192`), assigned to neither layer. | [[reviews-index]] |
| No `review_update` or `review_delete` tool exists; the only removal path is `user_delete hard: true`, and the soft path says nothing about reviews. | [[reviews-index]] |
| `review_write` with `consume: true` when the user owns no bottles is unspecified, as is whether the insert and the cellar decrement share a transaction. | [[reviews-index]] |
| `drank_on` has no stated relationship to `cellar_items.drink_until`. | [[reviews-index]] |
| `review_list.limit` has no default and no maximum, unlike `wine_search` (default 10 / max 50, `README.md:171`). `since` is ambiguous between `drank_on` and `created_at`. | [[reviews-index]] |
| `cellar_list` has no `limit` or clamp, unlike `wine_search` — a large cellar returns unbounded rows into a model's context. | [[cellar-index]] |
| `wine_recommend` states no maximum for `limit`, where `wine_search` caps at 50. | [[recommendation-engine-index]] |
| No MCP error code is specified for a permission denial — only the message text. | [[authorization-index]] |
| `user_delete` soft-delete sets `status = deleted`, but `deleted` is not in the stated `user.status` enum. | [[user-administration-index]] |
| **Only administrative actions are audited.** `audit_log` covers user and token operations (`README.md:345-347`), so catalogue writes, cellar mutations, and reviews leave no trail at all. | [[audit-logging]] |
| No item in the MVP definition of done (`README.md:399-417`) exercises `review_write` or `review_list`. | [[reviews-index]] |
| **`avoid` is a hard filter against data the schema cannot hold.** `avoid` carries "no oak", "no sulfites added" and allergens (`README.md:68`) and removes wines outright (`README.md:286`), but the `wines` table has no oak, allergen or additive column — only `style_tags` and free-text `tasting_notes` come close, and natural-language matching against either collides with ADR-0004's determinism. Likely unimplementable as specified, and it fails silently: a user who listed an allergen believes they are protected and is shown wines anyway. | [[preferences-index]] |
| **The last-admin guard is not stated to be transactional.** Two concurrent suspensions could each observe the other admin as active and both commit, leaving zero active admins and defeating the guard entirely. Needs `SELECT … FOR UPDATE` or equivalent. | [[user-administration-index]] |
| No vocabulary or normalization for the free-form `likes` / `dislikes` / `avoid` jsonb — "malbec" vs "Malbec" vs "Malbec (Argentina)" against `wines.grapes text[]`. It matters more than it looks, because dislikes *filter* rather than score. | [[preferences-index]] |
| `prefs_set` merge semantics on nested jsonb are unspecified: does merging `likes` append to `likes.grapes` or replace it? Two materially different behaviours behind one call (`README.md:202`). | [[preferences-index]] |
| Two write tools, two keywords, two defaults: `prefs_set` merges by default with `replace: true` to clobber, while `wine_upsert` fills blanks with `overwrite: true` (ADR-0007). Nothing explains the split. | [[preferences-index]] |
| No conflict rule for a grape listed in both `likes` and `dislikes`; filter-then-score implies the dislike wins, but that is inference. | [[preferences-index]] |
| No stated behaviour when a user has no `user_prefs` row — the state every user starts in. Both `prefs_get`'s response and the engine's behaviour are undefined. | [[preferences-index]] |
| `dislikes.styles` is in the stored shape (`README.md:67`) and absent from the filter list (`README.md:287`) — stored, apparently never read. `notes` is likewise stored and read by nothing. | [[preferences-index]] |
| `budget_min`/`budget_max` have no stated currency; the only hint is the sample string "$28 is inside your $0–40 budget" (`README.md:266`). `wines.avg_price` is equally unlabelled. | [[preferences-index]] |
| **`user_prefs` is omitted from both delete depths.** `user_delete hard: true` names cellar items and reviews (`README.md:221`); prefs are keyed on `user_id` and simply not mentioned. Reads as an oversight. | [[user-administration-index]] |
| **The permission-denied message names only the caller's role**, but a denial can equally come from token `scopes` narrowing an otherwise adequate role (`README.md:412`). The message sends an admin to fix the wrong thing. | [[authorization-index]] |
| **A surplus token scope lies dormant and activates on promotion.** `README.md:114` says a token can only ever narrow; the intersection at `README.md:332` enforces that *silently*; and the subset check `README.md:225` implies at issuance is never specified. The intersection means a token never exceeds its user's role at any moment — so this is not an escalation past the role — but a scope the role does not currently grant lies dormant and begins working the moment the user is promoted, with nobody re-authorizing it then. Two distinct costs: the dormant grant, and an admin never being told the token they just issued is narrower than they asked for. Safe reading: validate the subset at `token_create` *and* intersect at every use. | [[authorization-index]] |
| **An empty non-null `scopes` array is unspecified.** `null` means "inherit the role in full", but `'{}'` is a distinct valid `text[]` — a token that lists nothing and can call nothing. Nothing says which is intended. | [[authorization-index]] |
| **`ROLE_PERMISSIONS` has no completeness guarantee.** [ADR-0011](../decisions/0011-a-missing-permission-is-a-type-error.md) closes the tool side only, and says so — a new `Permission` can exist assigned to no role. It fails closed, but silently. | [[authorization-index]] |
| Whether an admin's own permissions can be narrowed by token scopes is never stated; the matrix and `README.md:325` imply yes. The risk is an implementer special-casing admins "for safety". | [[authorization-index]] |
| Whether the permission denial is a protocol-level error or a tool result with `isError: true` is unstated, so clients would have to match on prose. | [[authorization-index]] |
| A `users.role` value outside the enum has no defined behaviour and no stated DB `CHECK` — the enum is only a schema comment (`README.md:57-58`). | [[authorization-index]] |
| **Denied attempts are not audited.** `audit_log` records admin actions *taken* (`README.md:345-347`), so a member probing `user_create` leaves no trace. | [[authorization-index]] |
| **`prefs:read` for a guest can only ever return empty.** `prefs_get` returns only the caller's profile (`README.md:200`), a guest cannot write one, and no tool writes one for them. `README.md:108` names the grant deliberately, so it is either forward-looking or an oversight — unresolvable from the spec. By contrast `review:read` *is* defensible, because `review_list` has a by-wine mode that is not caller-scoped (`README.md:195-196`). Related: a guest's `wine_recommend` with `source: "cellar"` can only ever return nothing. | [[authorization-index]] |
| `user_list` has no pagination, filter or limit, unlike `wine_search` (default 10 / max 50), and whether soft-deleted accounts appear in it is unstated. | [[user-administration-index]] |
| `email` has no stated uniqueness constraint and no stated format validation anywhere, though it is the only human-legible identity in `user_list`. Whether a soft-deleted user's email can be reused is undecidable until this is settled. | [[user-administration-index]] |
| The last-admin guard counts *active* admins, so a suspended admin is not a survivor: suspending A can succeed and then suspending B be blocked. The ordering effects are unexplored. | [[user-administration-index]] |
| No stated behaviour for `user_update` on a nonexistent user. Hard delete's recoverability, confirmability and auditing are all unstated. | [[user-administration-index]] |
| **Reinstating a suspended user silently restores every token they held**, because suspension never touches token rows — it is enforced by the auth flow's status check. Nothing says whether that is intended. | [[user-administration-index]] |
| Re-running `scripts/bootstrap-admin.ts` is not stated to be idempotent; a second run minting another admin would be a silent privilege grant. | [[user-administration-index]] |
| Preference writes are not audited, so nothing records which client last changed a profile — the one question the cross-client design invites. | [[preferences-index]] |
| **Revocation may not reach an established session.** `token_revoke` "takes effect immediately" (`README.md:234`), but `props` resolves once per connection and `McpAgent` is a Durable Object. The definition of done tests only connect-time rejection (`README.md:403`), so an open session may survive revocation. | [[authentication-index]] |
| **No `UNIQUE (token_hash)` is declared on `api_tokens`** (`README.md:60-64`), though `wines` declares a uniqueness key (`README.md:74`). Duplicate-hash lookup behaviour is undefined. | [[authentication-index]] |
| **No rate limiting anywhere, and no logging of failed authentication** — only admin actions are audited — so there is no specified way to *notice* a brute-force attempt. | [[authentication-index]] |
| "Malformed" is never defined for the `Authorization` header. Token lookup timing is unspecified; at 32 bytes of entropy this is very likely academic, but a constant-time compare costs nothing. | [[authentication-index]] |
| **The one-time plaintext token is handed to an LLM as tool output.** `token_create` returns a live bearer credential (`README.md:226-227`), and an agent will by default echo tool output into the chat transcript — which then lives in client history, provider logs, screenshots, or a shared session. The only mitigation the design holds is `token_revoke`: an exposed token is revoked and reissued, never scrubbed. Nothing in the spec acknowledges this. | [[token-administration-index]] |
| **`token_create` accepts `scopes` "a subset of that user's permissions" (`README.md:225`) without saying what happens when it is not.** Silently intersected, or the call rejected? Both are safe at request time thanks to `role_permissions(role) ∩ scopes` (`README.md:332`); they differ in whether the admin is told the token is weaker than they asked for. Security-relevant either way. | [[token-administration-index]] |
| `expires_at` is optional (`README.md:325`), so tokens are immortal by default, and no rotation policy is stated anywhere. | [[token-administration-index]] |
| Whether `token_list` **for everyone** (`README.md:229`) requires anything beyond `admin:tokens` — one permission gates both a single-user and an all-users read. | [[token-administration-index]] |
| Nothing states whether token creation or revocation is rate-limited. | [[token-administration-index]] |
| Whether `token_revoke` on an already-revoked token is idempotent or an error, and whether it writes a second `audit_log` entry. | [[token-administration-index]] |
| No maximum number of tokens per user, and `label` has no uniqueness rule — two tokens labelled `gemini` silently defeat the one-token-per-client convention that makes selective revocation work (`README.md:323-324`). | [[token-administration-index]] |
| **`last_used_at` cannot support a "revoke unused tokens" workflow.** It is best-effort via `ctx.waitUntil` (`README.md:341`), off the transaction and not guaranteed to run, so a key in daily use can read stale or null. Nothing warns against using it as an audit signal. | [[token-administration-index]] |
| Whether token issuance is audited beyond the single "token issued" action (`README.md:345`) — the `metadata` contents are unspecified, so label, scopes and expiry may leave no record. | [[token-administration-index]] |
| Whether the `token_create` response returns the new token's `id`, which is the only handle `token_revoke` accepts (`README.md:233`). Without it an admin must call `token_list` to revoke what they just created. | [[token-administration-index]] |
| **Nothing guards `token_revoke` against self-lockout.** `user_update` has explicit guards against self-suspension and demoting the last admin (`README.md:217-218`); revoking the last active admin's last token has none. | [[token-administration-index]] |
| Whether the permission-denied message (`README.md:139-140`) distinguishes a role denial from a token-**scope** denial — it names the role, which is true and unhelpful for a scoped token. | [[token-administration-index]] |
| Whether the `token_create` response carries any warning, or marks the plaintext sensitive in a machine-readable way, given it is returned as tool output to an LLM that may echo it into a transcript. | [[token-administration-index]] |

The `status = deleted` one is a genuine contradiction inside the specification itself, not merely a gap: `README.md:59` and `README.md:215` both give the enum as `active | suspended`; `README.md:221` sets a third value, `deleted`.
