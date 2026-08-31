---
feature: preferences
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:212
  - business-docs/wiki/shared/mvp-spec.md:296
updated: 2026-08-29
---

# Preferences — flow

> **Unverified.** Specification only; no implementation exists in this repository.
> Every claim cites [[mvp-spec]].

## Happy path

The profile is written once in whatever client the user happens to be in, and read
everywhere afterwards.

1. The user tells their agent something about their palate — *"I like Malbec and Syrah,
   nothing sweet, I never want oak, budget about 40."*
2. The agent calls **`prefs_set`** with the fields it extracted. The caller is resolved
   from the bearer token via `props`; no `user_id` is passed (`business-docs/wiki/shared/mvp-spec.md:168-170`,
   `business-docs/wiki/shared/mvp-spec.md:350-351`).
3. The write **merges** into the existing `user_prefs` row by default; `replace: true`
   overwrites it instead (`business-docs/wiki/shared/mvp-spec.md:216`). Because `user_id` is the primary key
   (`business-docs/wiki/shared/mvp-spec.md:79`), there is exactly one row to merge into — no insert-or-pick logic,
   no per-client copy.
4. `updated_at` moves (`business-docs/wiki/shared/mvp-spec.md:80`).
5. Later, from a **different client with a different token** — Gemini instead of Claude —
   the user asks for a recommendation. That token resolves to the same `user_id`, so the
   same row applies (`business-docs/wiki/shared/mvp-spec.md:20-23`, `business-docs/wiki/shared/mvp-spec.md:217`, `business-docs/wiki/shared/mvp-spec.md:416`).
6. **`prefs_get`** returns the stored profile whenever the agent needs to show or reason
   about it (`business-docs/wiki/shared/mvp-spec.md:214`).

## Preconditions

| Precondition | Source |
| --- | --- |
| A valid, unrevoked, unexpired bearer token whose user is `status = active` | `business-docs/wiki/shared/mvp-spec.md:157-159` |
| `prefs:read` for `prefs_get`; `prefs:write` for `prefs_set` | `business-docs/wiki/shared/mvp-spec.md:138-139` |
| Nothing else. A user needs no cellar, no reviews and no prior profile. | `business-docs/wiki/shared/mvp-spec.md:79-82` |

## Postconditions

- Exactly one `user_prefs` row exists for the caller, holding the merged result.
- `updated_at` reflects the write (`business-docs/wiki/shared/mvp-spec.md:80`).
- Nothing else is touched. Writing prefs does not create, modify or score wines, and it
  is **not** written to `audit_log` — that table records admin actions only
  (`business-docs/wiki/shared/mvp-spec.md:360`).

## How the engine consumes it

Owned by [[recommendation-engine-index]]; reproduced here because it is the contract this
feature must keep. Order matters — the profile is applied in two distinct stages
(`business-docs/wiki/shared/mvp-spec.md:294`).

| Stage | Field | Effect |
| --- | --- | --- |
| Hard filter | `avoid` | wine removed entirely (`business-docs/wiki/shared/mvp-spec.md:300`) |
| Hard filter | `dislikes.grapes`, `dislikes.regions` | wine removed — **unless the request explicitly asks for it, in which case the request wins** (`business-docs/wiki/shared/mvp-spec.md:301-302`) |
| Score `0.25` | `sweetness`, `body`, `tannin`, `acidity` | distance from the wine's values on the 5-point scale (`business-docs/wiki/shared/mvp-spec.md:309`) |
| Score `0.15` | `likes` | overlap with the wine, alongside the request's soft `grapes` (`business-docs/wiki/shared/mvp-spec.md:311`) |
| Score `0.05` | `budget_min`, `budget_max` | inside the band scores `1.0`, decaying outside (`business-docs/wiki/shared/mvp-spec.md:312`) |
| Not consumed | `notes` | no stated use anywhere in the specification |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Merge | `prefs_set` without `replace` | fields present in the call are applied; fields absent are left as they were (`business-docs/wiki/shared/mvp-spec.md:216`) |
| Replace | `prefs_set` with `replace: true` | the profile is overwritten (`business-docs/wiki/shared/mvp-spec.md:216`) |
| Profile ignored | `wine_recommend` with `use_prefs: false` | the stored profile is not applied at all — no `avoid`, no dislikes filter, no palate fit, no preference match, no budget fit (`business-docs/wiki/shared/mvp-spec.md:264`) |
| Request overrides a dislike | the request names a grape or region that is in `dislikes` | the dislike is dropped for that request only; the stored profile is unchanged (`business-docs/wiki/shared/mvp-spec.md:301-302`) |
| Guest attempts a write | role `guest` calls `prefs_set` | rejected; `guest` holds `prefs:read` but not `prefs:write` (`business-docs/wiki/shared/mvp-spec.md:138-139`, `business-docs/wiki/shared/mvp-spec.md:122`) |
| No profile yet | a user who has never called `prefs_set` | **undefined.** See [[preferences-states]]. |

## Timing and automatic behaviour

Nothing in this feature is timed, retried, debounced or auto-advanced. The only automatic
write is `updated_at` (`business-docs/wiki/shared/mvp-spec.md:80`). `last_used_at` on the token is touched
best-effort via `ctx.waitUntil` on every request (`business-docs/wiki/shared/mvp-spec.md:355`), which is
[[authentication-index]]'s behaviour, not this feature's.

## What is deliberately not here

| Absent | Why |
| --- | --- |
| Per-client or per-token preferences | The whole point is the opposite: identity, and therefore the profile, lives in the database (`business-docs/wiki/shared/mvp-spec.md:20-23`). A token narrows *permissions* (`business-docs/wiki/shared/mvp-spec.md:128`), never taste. |
| Preference *learning* from reviews | Rating history is a separate scoring component worth `0.20` (`business-docs/wiki/shared/mvp-spec.md:310`), owned by [[reviews-index]]. It is never written back into `user_prefs`. Stated preferences and revealed preferences stay separate. |
| Any inference by an LLM inside the flow | [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md). The *agent* interprets the user's words into fields; the server stores fields. |
| Enrichment or normalization of what is stored | The server takes structured fields only (`business-docs/wiki/shared/mvp-spec.md:44-45`). Nothing normalizes `"Malbec"` to a canonical grape — see the gaps in [[preferences-index]]. |
