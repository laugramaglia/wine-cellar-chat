---
feature: preferences
page: flow
status: stub
source_of_truth: wiki
code_refs:
  - README.md:198
  - README.md:282
updated: 2026-08-29
---

# Preferences — flow

> **Unverified.** Specification only; no implementation exists in this repository.
> Every claim cites `README.md`.

## Happy path

The profile is written once in whatever client the user happens to be in, and read
everywhere afterwards.

1. The user tells their agent something about their palate — *"I like Malbec and Syrah,
   nothing sweet, I never want oak, budget about 40."*
2. The agent calls **`prefs_set`** with the fields it extracted. The caller is resolved
   from the bearer token via `props`; no `user_id` is passed (`README.md:154-156`,
   `README.md:336-337`).
3. The write **merges** into the existing `user_prefs` row by default; `replace: true`
   overwrites it instead (`README.md:202`). Because `user_id` is the primary key
   (`README.md:65`), there is exactly one row to merge into — no insert-or-pick logic,
   no per-client copy.
4. `updated_at` moves (`README.md:66`).
5. Later, from a **different client with a different token** — Gemini instead of Claude —
   the user asks for a recommendation. That token resolves to the same `user_id`, so the
   same row applies (`README.md:6-9`, `README.md:203`, `README.md:402`).
6. **`prefs_get`** returns the stored profile whenever the agent needs to show or reason
   about it (`README.md:200`).

## Preconditions

| Precondition | Source |
| --- | --- |
| A valid, unrevoked, unexpired bearer token whose user is `status = active` | `README.md:143-145` |
| `prefs:read` for `prefs_get`; `prefs:write` for `prefs_set` | `README.md:124-125` |
| Nothing else. A user needs no cellar, no reviews and no prior profile. | `README.md:65-68` |

## Postconditions

- Exactly one `user_prefs` row exists for the caller, holding the merged result.
- `updated_at` reflects the write (`README.md:66`).
- Nothing else is touched. Writing prefs does not create, modify or score wines, and it
  is **not** written to `audit_log` — that table records admin actions only
  (`README.md:346`).

## How the engine consumes it

Owned by [[recommendation-engine-index]]; reproduced here because it is the contract this
feature must keep. Order matters — the profile is applied in two distinct stages
(`README.md:280`).

| Stage | Field | Effect |
| --- | --- | --- |
| Hard filter | `avoid` | wine removed entirely (`README.md:286`) |
| Hard filter | `dislikes.grapes`, `dislikes.regions` | wine removed — **unless the request explicitly asks for it, in which case the request wins** (`README.md:287-288`) |
| Score `0.25` | `sweetness`, `body`, `tannin`, `acidity` | distance from the wine's values on the 5-point scale (`README.md:295`) |
| Score `0.15` | `likes` | overlap with the wine, alongside the request's soft `grapes` (`README.md:297`) |
| Score `0.05` | `budget_min`, `budget_max` | inside the band scores `1.0`, decaying outside (`README.md:298`) |
| Not consumed | `notes` | no stated use anywhere in the specification |

## Branches

| Branch | When | Outcome |
| --- | --- | --- |
| Merge | `prefs_set` without `replace` | fields present in the call are applied; fields absent are left as they were (`README.md:202`) |
| Replace | `prefs_set` with `replace: true` | the profile is overwritten (`README.md:202`) |
| Profile ignored | `wine_recommend` with `use_prefs: false` | the stored profile is not applied at all — no `avoid`, no dislikes filter, no palate fit, no preference match, no budget fit (`README.md:250`) |
| Request overrides a dislike | the request names a grape or region that is in `dislikes` | the dislike is dropped for that request only; the stored profile is unchanged (`README.md:287-288`) |
| Guest attempts a write | role `guest` calls `prefs_set` | rejected; `guest` holds `prefs:read` but not `prefs:write` (`README.md:124-125`, `README.md:108`) |
| No profile yet | a user who has never called `prefs_set` | **undefined.** See [[preferences-states]]. |

## Timing and automatic behaviour

Nothing in this feature is timed, retried, debounced or auto-advanced. The only automatic
write is `updated_at` (`README.md:66`). `last_used_at` on the token is touched
best-effort via `ctx.waitUntil` on every request (`README.md:341`), which is
[[authentication-index]]'s behaviour, not this feature's.

## What is deliberately not here

| Absent | Why |
| --- | --- |
| Per-client or per-token preferences | The whole point is the opposite: identity, and therefore the profile, lives in the database (`README.md:6-9`). A token narrows *permissions* (`README.md:114`), never taste. |
| Preference *learning* from reviews | Rating history is a separate scoring component worth `0.20` (`README.md:296`), owned by [[reviews-index]]. It is never written back into `user_prefs`. Stated preferences and revealed preferences stay separate. |
| Any inference by an LLM inside the flow | [ADR-0004](../../decisions/0004-a-deterministic-rule-based-engine.md). The *agent* interprets the user's words into fields; the server stores fields. |
| Enrichment or normalization of what is stored | The server takes structured fields only (`README.md:30-31`). Nothing normalizes `"Malbec"` to a canonical grape — see the gaps in [[preferences-index]]. |
