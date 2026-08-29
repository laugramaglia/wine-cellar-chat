# Wine Cellar MCP

An MCP (Model Context Protocol) server for wine: keep a catalog, track your own cellar,
write and read tasting reviews, and ask a recommendation engine what to drink.

It is a **remote MCP server deployed on Cloudflare Workers**. Any MCP client — Claude
(Desktop / Code / web), Gemini, Cursor, your own agent — connects to the same URL with its
own bearer token, and every client sees the same cellar and the same preferences, because
identity lives in the database, not in the client.

The intended flow: take a photo of a bottle → your agent reads the label (vision happens
**client-side**, the server never sees images) → it calls `wine_upsert` to store the wine →
later you ask *"what goes with lamb tonight, under $40, from what I have?"* and the agent
calls `wine_recommend`.

---

## 1. Scope of the MVP

**In scope**

| | |
|---|---|
| Runtime | TypeScript on Cloudflare Workers (`McpAgent` from the `agents` SDK) |
| Transport | Streamable HTTP at `/mcp` (remote only — no stdio binary) |
| Auth | Static bearer token per user, `Authorization: Bearer <token>` |
| Authorization | Role-based. Every tool declares a required permission; unauthorized tools are hidden and rejected. |
| Storage | Postgres (Neon), accessed over HTTP via `@neondatabase/serverless` |
| Engine | Deterministic rule-based scoring — filters + weighted score, no ML, no embeddings |
| Vision / OCR | Done by the connected agent. Server takes structured fields only. |
| Enrichment | None. The agent supplies region, grapes, notes — it already has web search. |

**Explicitly out of scope for the MVP**

- OAuth 2.1 / `workers-oauth-provider` (bearer tokens now, OAuth is the upgrade path)
- Embeddings, pgvector, "wines like this one" semantic search
- External wine APIs (Vivino, Wine-Searcher), scraping, price lookups
- Image upload or storage of any kind
- A web UI. The MCP client *is* the UI.

---

## 2. Domain model

Two things are deliberately separate:

- **Wine** — an abstract bottling. *Catena Malbec 2019*. Shared across all users.
- **Cellar item** — bottles of a wine that **a specific user owns**, with quantity,
  what they paid, and a drink-by window.

That split is what lets the engine answer both *"recommend me a Malbec"* (catalog) and
*"what should I open tonight"* (cellar only).

### Tables

```
users            id, name, email, role, status, created_at
                 -- role: admin | member | guest
                 -- status: active | suspended
api_tokens       id, user_id, token_hash, label, scopes text[] (nullable),
                 last_used_at, expires_at, revoked_at
                 -- label = "claude-desktop", "gemini", "phone"
                 -- scopes: null = inherit the user's role in full;
                 --         otherwise a subset, to hand a client less power than the user has
user_prefs       user_id (PK), likes jsonb, dislikes jsonb, budget_min, budget_max,
                 sweetness, body, tannin, acidity, avoid jsonb, notes, updated_at
                 -- likes/dislikes: { grapes: [], regions: [], styles: [] }
                 -- avoid: allergens / "no oak" / "no sulfites added" etc.

wines            id, name, producer, vintage (nullable = NV), country, region, subregion,
                 wine_type, grapes text[], abv, sweetness, body, tannin, acidity,
                 avg_price, style_tags text[], food_pairings text[],
                 tasting_notes, created_by, created_at, updated_at
                 UNIQUE (lower(producer), lower(name), vintage)

cellar_items     id, user_id, wine_id, quantity, purchase_price, purchase_date,
                 location, drink_from, drink_until, status, notes
                 -- status: in_cellar | drunk | gifted

reviews          id, user_id, wine_id, rating (1-100), drank_on, occasion,
                 body_text, would_buy_again bool, created_at
```

Enums, all lowercase strings:

- `wine_type`: `red | white | rose | sparkling | orange | dessert | fortified`
- `sweetness`: `bone_dry | dry | off_dry | medium_sweet | sweet`
- `body` / `tannin` / `acidity`: `low | medium_minus | medium | medium_plus | high`
  (`tannin` is `null` for most whites)

**Rule:** every field except `name` is optional. A wine created from a blurry photo may be
nothing but `{ name, producer }`. Filling it in later is what `wine_upsert` is for.

---

## 3. Roles and permissions

Not every token can do everything. Managing accounts and issuing API keys is an **admin**
job; a normal member can run the cellar but cannot create Fabian's account or mint him a
key.

### Roles

| Role | Can |
|---|---|
| `admin` | everything a member can, **plus** create/suspend users, issue and revoke API keys, and edit anyone's role |
| `member` | full use of their own cellar, reviews, prefs; read and write the shared wine catalog |
| `guest` | read-only: search the catalog, read wines, read their own prefs. No writes, no cellar mutations. |

### Permissions

Each tool declares one required permission. A caller holds a permission if their role
grants it **and** — when the token has explicit `scopes` — the token grants it too.
A token can only ever *narrow* what its user's role allows, never widen it.

| Permission | Tools | admin | member | guest |
|---|---|:-:|:-:|:-:|
| `catalog:read` | `wine_search`, `wine_get` | ✅ | ✅ | ✅ |
| `catalog:write` | `wine_upsert` | ✅ | ✅ | — |
| `cellar:read` | `cellar_list` | ✅ | ✅ | — |
| `cellar:write` | `cellar_add`, `cellar_update` | ✅ | ✅ | — |
| `review:read` | `review_list` | ✅ | ✅ | ✅ |
| `review:write` | `review_write` | ✅ | ✅ | — |
| `prefs:read` | `prefs_get` | ✅ | ✅ | ✅ |
| `prefs:write` | `prefs_set` | ✅ | ✅ | — |
| `recommend` | `wine_recommend` | ✅ | ✅ | ✅ |
| `admin:users` | `user_create`, `user_list`, `user_update`, `user_delete` | ✅ | — | — |
| `admin:tokens` | `token_create`, `token_list`, `token_revoke` | ✅ | — | — |

### Enforcement — two layers, both required

1. **Visibility.** `tools/list` returns only the tools the caller is permitted to call.
   A member's Claude session simply never sees `user_create`, so the model cannot try it
   and cannot hallucinate that it exists.
2. **Execution.** Every handler re-checks the permission before doing any work. Visibility
   filtering is a UX affordance; **this** is the security boundary. A tool must never rely
   on having been hidden.

Rejections are explicit and boring: an MCP error, `Permission denied: 'user_create'
requires 'admin:users'; your role is 'member'.` — so the agent reports it instead of
retrying in a loop.

Also enforced before any permission check: an unknown, revoked, or expired token gets
`401` at the Worker edge, and a token whose user is `status = suspended` is rejected the
same way. Connection refused, no tool list, nothing.

The permission map lives in **one table in code** — a `TOOL_PERMISSIONS` record — so that
adding a tool without deciding its permission is a type error, not an accidental hole.

---

## 4. Tools

Every tool resolves the calling user from the bearer token. Apart from the `admin:*`
tools, none takes a `user_id` — you cannot read or write another account's cellar,
whatever your role.

### Catalog

**`wine_upsert`** — create a wine, or add data to one that exists.
Input: all the `wines` fields; `name` required, plus optional `wine_id` to target an
existing row. Without `wine_id` it matches on `(producer, name, vintage)`.
Merge semantics: **fills blanks, never overwrites a non-null field unless
`overwrite: true`**. This is the "collect more data over time" path — call it after the
photo with two fields, call it again next week with the grapes and the region.
Returns the full wine row plus `created: bool` and `fields_filled: string[]`.

**`wine_search`** — find wines in the catalog.
Input: `query` (free text over name/producer/region/notes), plus optional structured
filters `wine_type`, `country`, `region`, `grapes`, `vintage_min/max`,
`price_min/max`, `owned_only`, `limit` (default 10, max 50).
Returns matches with an `owned` flag and `quantity` for the calling user.

**`wine_get`** — one wine, everything about it: fields, the caller's cellar holdings, the
caller's reviews, and aggregate rating across all users.

### Cellar

**`cellar_add`** — put bottles in the cellar. `wine_id` (or inline wine fields, which
upsert first), `quantity`, `purchase_price`, `purchase_date`, `location`,
`drink_from`, `drink_until`.

**`cellar_update`** — change quantity / location / drink window, or mark
`status: drunk | gifted`. Drinking the last bottle sets `status = drunk` automatically.

**`cellar_list`** — the caller's cellar. Filters: `wine_type`, `region`, `ready_to_drink`
(now inside the drink window), `drink_soon` (window closes within N months),
`sort` (`drink_until | purchase_date | price | name`).

### Reviews

**`review_write`** — record a tasting. `wine_id`, `rating` 1–100, `drank_on`, `occasion`,
`body_text`, `would_buy_again`. Optionally decrements the cellar with `consume: true`.

**`review_list`** — reviews by wine, or the caller's recent reviews. Filters:
`wine_id`, `min_rating`, `since`, `limit`.

### Preferences

**`prefs_get`** — the caller's stored palate profile.

**`prefs_set`** — set/merge it. Partial updates merge by default; `replace: true` overwrites.
This is what makes the same profile show up in Claude and in Gemini.

### Administration — `admin` only

**`user_create`** (`admin:users`) — create an account. `name`, `email`,
`role` (default `member`). Optionally `issue_token: true` with a `token_label`, which
creates the account and returns its first key in one call — the "create an API key for a
new user called Fabian" path.
Returns the user row, and the plaintext token **once** if one was issued.

**`user_list`** (`admin:users`) — all accounts: role, status, token count, last activity.

**`user_update`** (`admin:users`) — change `role` or `status` (`active | suspended`).
Suspending kills every one of that user's tokens at the next request. Guards: an admin
cannot demote or suspend themselves, and the last remaining active admin cannot be
demoted, suspended, or deleted.

**`user_delete`** (`admin:users`) — remove an account. Soft-delete by default (status
`deleted`, tokens revoked); `hard: true` also drops their cellar items and reviews.
Wines they contributed stay in the shared catalog.

**`token_create`** (`admin:tokens`) — issue a key. `user_id`, `label`, optional
`scopes` (subset of that user's permissions) and `expires_at`.
**Returns the plaintext token exactly once — it is never retrievable again**, only its hash
is stored.

**`token_list`** (`admin:tokens`) — keys for a user or for everyone: label, scopes,
created, last used, revoked. Never the token itself, and never a recoverable prefix beyond
the last 4 characters.

**`token_revoke`** (`admin:tokens`) — revoke by token id. Takes effect immediately.

### The engine

**`wine_recommend`** — the point of the whole thing.

```jsonc
{
  "occasion":      "dinner party",       // free text, optional
  "food":          "roast lamb",         // free text, optional
  "wine_type":     "red",                // optional hard filter
  "price_max":     40,
  "price_min":     null,
  "grapes":        ["malbec", "syrah"],  // optional soft preference
  "region":        "Mendoza",
  "exclude_wine_ids": [],
  "source":        "cellar",             // "cellar" | "catalog" | "both"  (default "both")
  "use_prefs":     true,                 // apply stored user_prefs (default true)
  "limit":         5
}
```

Returns a ranked list, each entry:

```jsonc
{
  "wine": { /* full wine row */ },
  "score": 0.82,
  "in_cellar": true,
  "quantity": 3,
  "reasons": [
    "Malbec matches a grape you rate highly (avg 92 over 4 reviews)",
    "Food pairing: lamb is listed in this wine's pairings",
    "$28 is inside your $0–40 budget",
    "Drink window closes in 5 months"
  ],
  "penalties": ["Higher tannin than your usual preference"]
}
```

`reasons` is not decoration — it is the contract. The engine is rule-based precisely so
the agent can explain *why*, and so you can argue with it.

---

## 5. How the engine scores

Two stages: **hard filters**, then **weighted score**.

**Hard filters** (a wine that fails any of these is not in the result at all)

- explicit `wine_type`, `price_max` / `price_min`, `region`, `exclude_wine_ids`
- `source: "cellar"` → must have `quantity > 0` and `status = in_cellar`
- anything in the user's `prefs.avoid`
- anything in `prefs.dislikes.grapes` / `.regions` — unless the request explicitly asks
  for it, in which case the request wins

**Weighted score**, each component in `0..1`, summed and normalized:

| Component | Weight | How |
|---|---|---|
| Food pairing | 0.30 | request `food` vs. `food_pairings` + a small built-in pairing table (red meat→tannic red, shellfish→high-acid white, spicy→off-dry aromatic, …) |
| Palate fit | 0.25 | `prefs` sweetness/body/tannin/acidity vs. the wine's, distance on the 5-point scale |
| Personal history | 0.20 | caller's past ratings of this wine, its grape, its region, its producer — a grape you rate 90+ pulls hard |
| Preference match | 0.15 | overlap with `prefs.likes` and with the request's soft `grapes` |
| Budget fit | 0.05 | inside the band scores 1.0, decaying outside it |
| Drink-window urgency | 0.05 | cellar only — bottles closing their window get nudged up |

Design rules for the MVP:

- **Deterministic.** Same input, same output. No LLM inside the engine.
- **Missing data never penalizes.** An unknown component is dropped and the remaining
  weights are renormalized, so a half-filled wine can still be recommended.
- **Every point of score maps to a reason string.** If it can't be explained, it isn't scored.
- Weights live in one config object so they can be tuned without touching the logic.

---

## 6. Auth

### Bootstrap

The **first** admin cannot be created through a tool — there is nobody to authorize it.
`scripts/bootstrap-admin.ts` seeds one admin user and prints its token once. Every account
after that (Fabian included) is created through `user_create` by an admin.

### Tokens

- 32 bytes of `crypto.getRandomValues`, base64url, prefixed `wc_` so it is greppable in logs.
- Only the **SHA-256 hash** is stored. The plaintext is returned exactly once, at creation.
- One token per client (`label` = `claude-desktop`, `gemini`, `phone`), so revoking Gemini
  leaves Claude working.
- Optional `expires_at` and optional `scopes` narrower than the user's role.

### Per-request flow

1. Read `Authorization: Bearer <token>`; missing or malformed → `401`.
2. Hash it, look it up. Unknown, revoked, or expired → `401`.
3. Load the user. `status != active` → `401`.
4. Resolve `permissions = role_permissions(user.role) ∩ (token.scopes ?? everything)`.
5. Pass `{ userId, role, tokenId, permissions }` as `props` on the `McpAgent`.
   `tools/list` filters on it; every handler re-checks against it.

Tool handlers read the user **from `props`, never from tool input** — that is what makes
"you can only touch your own cellar" structural rather than a validation rule someone can
forget. The `admin:*` tools are the sole exception, and they gate on `admin:users` /
`admin:tokens` first.

`last_used_at` is updated on the way through, best-effort, via `ctx.waitUntil`.

### Logging

Admin actions — user created, role changed, token issued, token revoked — are written to
an `audit_log` table (`actor_user_id`, `action`, `target_user_id`, `metadata jsonb`,
`created_at`). Tokens are never logged, in plaintext or hashed.

---

## 7. Shape of the code

```
src/
  index.ts              # Worker fetch: auth middleware -> WineMcp.serve("/mcp")
  mcp.ts                # WineMcp extends McpAgent; registers tools in init()
  auth.ts               # bearer token -> { userId, role, permissions } props
  permissions.ts        # Permission union, ROLE_PERMISSIONS, TOOL_PERMISSIONS, can()
  db/
    client.ts           # neon() serverless client
    schema.sql          # migrations
    queries/            # wines.ts, cellar.ts, reviews.ts, prefs.ts, users.ts, tokens.ts
  tools/                # one file per tool, zod input schema + handler
    admin/              # user_*.ts, token_*.ts
  engine/
    recommend.ts        # filters + scoring
    weights.ts          # tunable config
    pairings.ts         # built-in food->style table
scripts/
  bootstrap-admin.ts
wrangler.jsonc
```

`wrangler.jsonc` needs a Durable Object binding and a `new_sqlite_classes` migration for
`WineMcp` (`McpAgent` is a Durable Object), plus `nodejs_compat`.

Secrets: `DATABASE_URL` via `wrangler secret put`, `.dev.vars` for local `wrangler dev`.

---

## 8. Connecting a client

```
https://<worker>.workers.dev/mcp
Authorization: Bearer <your-token>
```

Claude Code:

```bash
claude mcp add --transport http wine-cellar https://<worker>.workers.dev/mcp \
  --header "Authorization: Bearer <your-token>"
```

Any other MCP client: point it at the same URL with the same header.

---

## 9. Definition of done for the MVP

- [ ] `wrangler deploy` puts a reachable `/mcp` endpoint live
- [ ] Two tokens for the same user, from two different clients, see one cellar and one prefs profile
- [ ] A wrong or revoked token gets `401` and reaches no tool
- [ ] Photo → agent extracts fields → `wine_upsert` → `cellar_add` works end to end
- [ ] Calling `wine_upsert` again with more fields fills blanks and clobbers nothing
- [ ] `wine_recommend` with `source: "cellar"` only returns bottles actually owned
- [ ] Every recommendation carries at least one non-empty `reasons` entry
- [ ] A wine with only `{ name, producer }` can still be stored, found, and recommended
- [ ] An admin can run `user_create` for "fabian" with `issue_token: true` and get a working key back
- [ ] Fabian's member token does **not** see `user_create` in `tools/list`
- [ ] Calling `user_create` with Fabian's token anyway is rejected with a permission error
- [ ] A scoped token (`catalog:read` only) is refused by `cellar_add` even though its user is a member
- [ ] Suspending a user makes all of their existing tokens fail with `401` immediately
- [ ] Every tool in `TOOL_PERMISSIONS` maps to a permission — a missing entry fails to compile

---

## 10. After the MVP

In rough order: pgvector + embeddings for "wines like this one" · OAuth 2.1 so tokens
aren't hand-rolled · custom roles and per-user permission grants instead of three fixed
roles · MCP *resources* exposing the cellar as browsable context · MCP
*prompts* for "sommelier mode" · consumption history and drinking stats · sharing a cellar
between users · an `enrich_wine` tool against an external API.
