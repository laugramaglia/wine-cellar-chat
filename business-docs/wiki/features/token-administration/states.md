---
feature: token-administration
page: states
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:74
updated: 2026-08-29
---

# Token administration — states

A token's state is not a column. There is no `status` on `api_tokens` — the state is **derived** at request time from three nullable timestamps and from the owning user's `status` (`business-docs/wiki/shared/mvp-spec.md:74-75`, `business-docs/wiki/shared/mvp-spec.md:344-345`). Everything below follows from that.

> **Unverified.** Specified only; no code exists. See [[divergences]].

## State shape

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `id` | uuid | Revocation handle — the only thing `token_revoke` accepts (`business-docs/wiki/shared/mvp-spec.md:247`). | generated |
| `user_id` | uuid | The owner. Their `role` and `status` are read on every request (`business-docs/wiki/shared/mvp-spec.md:345-346`). | required |
| `token_hash` | text | SHA-256 of the plaintext. The plaintext is not stored (`business-docs/wiki/shared/mvp-spec.md:336`). | required |
| `label` | text | Which client this key is for: `claude-desktop`, `gemini`, `phone` (`business-docs/wiki/shared/mvp-spec.md:76`). | required |
| `scopes` | text[] **nullable** | `null` = inherit the user's role in full; otherwise a subset (`business-docs/wiki/shared/mvp-spec.md:74`, `business-docs/wiki/shared/mvp-spec.md:77-78`). | `null` |
| `last_used_at` | timestamp nullable | Best-effort, written via `ctx.waitUntil` (`business-docs/wiki/shared/mvp-spec.md:355`). See *Do not trust `last_used_at`* below. | `null` |
| `expires_at` | timestamp nullable | Optional. `null` = never expires (`business-docs/wiki/shared/mvp-spec.md:75`, `business-docs/wiki/shared/mvp-spec.md:339`). | `null` |
| `revoked_at` | timestamp nullable | Set by `token_revoke` and by `user_delete` (`business-docs/wiki/shared/mvp-spec.md:235`, `business-docs/wiki/shared/mvp-spec.md:247`). **Not** set by suspension. | `null` |

### Derived state

| Derived state | Expression | Effect |
| --- | --- | --- |
| **issued** | the instant `token_create` returns | The one moment the plaintext exists (`business-docs/wiki/shared/mvp-spec.md:240`). |
| **active** | `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now) AND user.status = 'active'` | Requests succeed; permissions resolve (`business-docs/wiki/shared/mvp-spec.md:344-346`). |
| **expired** | `expires_at <= now` | `401`. Irreversible: nothing extends an expiry (`business-docs/wiki/shared/mvp-spec.md:344`). |
| **revoked** | `revoked_at IS NOT NULL` | `401`, immediately (`business-docs/wiki/shared/mvp-spec.md:247`). Irreversible — no un-revoke tool exists. |
| **inert** | token itself is fine, but `user.status != 'active'` | `401` at step 3 (`business-docs/wiki/shared/mvp-spec.md:345`). **Reversible.** See below. |

## Transitions

| From | Event | To | Guard |
| --- | --- | --- | --- |
| — | `token_create` (`business-docs/wiki/shared/mvp-spec.md:238`) | issued → active | caller holds `admin:tokens` |
| — | `user_create` with `issue_token: true` (`business-docs/wiki/shared/mvp-spec.md:223`) | issued → active | caller holds `admin:users` |
| active | `token_revoke` by id (`business-docs/wiki/shared/mvp-spec.md:247`) | revoked | takes effect immediately |
| active | wall clock passes `expires_at` (`business-docs/wiki/shared/mvp-spec.md:344`) | expired | only if `expires_at` is non-null |
| active | owner `user_update` → `status: suspended` (`business-docs/wiki/shared/mvp-spec.md:230`) | inert | `revoked_at` untouched |
| inert | owner `user_update` → `status: active` | **active again** | every one of that user's tokens works again |
| active / inert | `user_delete` (`business-docs/wiki/shared/mvp-spec.md:234-235`) | revoked | soft-delete revokes the user's tokens |
| revoked | — | — | terminal; no transition out is specified |
| expired | — | — | terminal; no transition out is specified |

## Suspension does not revoke — read this twice

Suspension and revocation look the same to the caller (both are a bare `401`, `business-docs/wiki/shared/mvp-spec.md:158-159`) and are not the same in the database.

| | Suspension | Revocation |
| --- | --- | --- |
| Writes `revoked_at` | **no** | yes |
| Rejects at | step 3, on `user.status != active` (`business-docs/wiki/shared/mvp-spec.md:345`) | step 2, on the token row (`business-docs/wiki/shared/mvp-spec.md:344`) |
| Shows in `token_list` as revoked | **no** (`business-docs/wiki/shared/mvp-spec.md:243-244`) | yes |
| Reversible | **yes** — reinstating the user silently restores *every* token they had | no |

`business-docs/wiki/shared/mvp-spec.md:230` phrases this as "suspending kills every one of that user's tokens at the next request". *At the next request* is the operative clause: the tokens are not touched, the user lookup fails. Nothing in the specification says whether the silent restoration on reinstatement is intended. Recorded in [[divergences]] and [[security]].

Practical consequence: **suspension is not a substitute for revocation.** If a token has leaked, revoke it — suspending its owner hides the problem until someone flips the account back to `active`.

## Resolution order

The per-request chain, in order. The first failing step decides, and every failure is the same opaque `401` (`business-docs/wiki/shared/mvp-spec.md:343-346`).

1. Header missing or malformed → `401`.
2. Hash lookup: **unknown**, then **revoked**, then **expired** → `401`. The specification lists them together and does not order them; any order gives the same answer because they are disjoint.
3. `user.status != 'active'` → `401`.
4. `permissions = role_permissions(user.role) ∩ (token.scopes ?? everything)` (`business-docs/wiki/shared/mvp-spec.md:346`).

Step 4 is where `scopes` being nullable becomes a rule: **`?? everything`**. A missing `scopes` value means *no narrowing at all*, not *no permissions*. Getting that fallback backwards would silently lock out every unscoped token in the system.

Note the ordering consequence: **scope is resolved last**. A revoked or expired token never reaches permission resolution, so a scoped token and an unscoped one fail identically.

## Do not trust `last_used_at`

`last_used_at` is updated "on the way through, best-effort, via `ctx.waitUntil`" (`business-docs/wiki/shared/mvp-spec.md:355`). That means:

- it is not in the request's transaction, and a failed write is not surfaced anywhere;
- `ctx.waitUntil` work is not guaranteed to complete if the isolate is evicted;
- nothing states a write granularity, so it may or may not be written on every single request.

Anyone building a **"revoke tokens unused for 90 days"** workflow on this column will be wrong, and will revoke keys that are in daily use. It is a rough activity hint for a human reading `token_list`, nothing more. If reliable last-use is ever needed it has to become an audited write, not a deferred one. Recorded in [[divergences]].

## Lifetime

The row lives in Postgres and outlives every request, isolate, and Durable Object. Nothing in this feature is held in memory: `props` is rebuilt from the database on each request (`business-docs/wiki/shared/mvp-spec.md:346-347`), which is exactly why revocation takes effect immediately rather than at the next session.

No expiry sweep, no archival, and no retention rule for revoked rows is specified — a revoked token's row apparently persists forever, which is what keeps `token_list`'s "revoked" column meaningful.
