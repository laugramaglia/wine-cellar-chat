---
feature: user-administration
page: states
status: stub
source_of_truth: wiki
code_refs:
  - README.md:57
  - README.md:215
updated: 2026-08-29
---

# User administration — states

## State shape

The `users` row (`README.md:57-59`).

| Field | Type | Meaning | Default |
| --- | --- | --- | --- |
| `id` | id | account identity; the anchor for tokens, cellar, reviews, prefs | assigned |
| `name` | text | display name | required at create (`README.md:207`) |
| `email` | text | contact identity | required at create; uniqueness and format **unstated** |
| `role` | `admin \| member \| guest` | what permissions the account grants ([[authorization-index]]) | `member` (`README.md:208`) |
| `status` | `active \| suspended` — **but see below** | whether the account may authenticate at all | `active` |
| `created_at` | timestamp | — | now |

Derived, not stored:

| Derived value | Expression | Where it matters |
| --- | --- | --- |
| may authenticate | `status == 'active'` | step 3 of the per-request flow; anything else is `401` (`README.md:331`) |
| effective permissions | `role_permissions(user.role) ∩ (token.scopes ?? everything)` | resolved per request, not stored (`README.md:332`) |
| is last active admin | `count(users where role='admin' and status='active') == 1` | both destructive guards (`README.md:217-218`) |
| token count / last activity | aggregated over `api_tokens` | `user_list` output only (`README.md:213`) |

### The `deleted` status contradiction

`README.md:59` and `README.md:215` both give the enum as `active | suspended`. `README.md:221` has `user_delete` set `status` to `deleted` — a third value that the enum does not contain. This is a contradiction **inside the specification**, not a wiki/code drift, and it must be resolved before the schema is written. Recorded in [[divergences]]; consequences below are written as if `deleted` is a real third value, because the delete behaviour is unambiguous and the enum line is the one that looks stale.

## The state machine

```
  (bootstrap script)              (user_create)
            \                        /
             v                      v
                    +----------+
                    |  active  |
                    +----------+
                     |   ^    \
        user_update  |   |     \  user_delete
   status: suspended |   | user_update       \
                     v   | status: active     v
                +-------------+          +-----------+
                |  suspended  | -------> |  deleted  |
                +-------------+ delete   +-----------+
                                              |
                                              | user_delete hard: true
                                              v
                                        [ hard-deleted ]
```

## Transitions

| From | Event | To | Guard | What happens to their tokens |
| --- | --- | --- | --- | --- |
| — | `scripts/bootstrap-admin.ts` | `active` (`admin`) | only on an empty database; re-run behaviour **unstated** ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)) | one token minted, printed once (`README.md:316`) |
| — | `user_create` | `active` | caller holds `admin:users` | one token minted iff `issue_token: true` (`README.md:208-211`); otherwise none, and the account cannot connect |
| `active` | `user_update` `status: suspended` | `suspended` | **not self**; **not the last active admin** (`README.md:216-218`) | **untouched.** Every token fails at the next request via the user-status check, not by revocation (`README.md:216`, `README.md:331`) |
| `suspended` | `user_update` `status: active` | `active` | none stated | **every token the user had works again**, including ones the admin may have thought were dead |
| `active` \| `suspended` | `user_delete` | `deleted` | **not the last active admin** (`README.md:218`) | **revoked** on the token rows (`README.md:221`) |
| `deleted` | `user_delete` `hard: true` | hard-deleted | not stated whether this is reachable as a second call or only as the first | already revoked |
| `active` \| `suspended` | `user_delete` `hard: true` | hard-deleted | **not the last active admin** | revoked; rows presumably dropped, **unstated** |
| `active` (`admin`) | `user_update` `role: member \| guest` | role change | **not self**; **not the last active admin** (`README.md:216-218`) | untouched — the token keeps working with narrower permissions, resolved fresh each request (`README.md:332`) |
| any | reverse a hard delete | — | **no path.** Nothing states whether hard delete is recoverable | — |

## The guards, precisely

Both come from `README.md:216-218`. They are the only thing preventing an unrecoverable server.

| Guard | Blocks | Applies to |
| --- | --- | --- |
| **No self-demotion / self-suspension** | An admin changing their own `role` away from `admin`, or their own `status` to `suspended`. | `user_update` where the target is the caller. |
| **Protect the last active admin** | Demoting, suspending, or deleting the only remaining `active` admin. | `user_update` and `user_delete`. |

**Why they matter.** `user_create` requires `admin:users`, which only an `admin` role grants (`README.md:127`). With zero active admins, no live token can call it, and no tool can restore one — the tool surface has no privileged escape hatch by deliberate design ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)). Recovery would require running `scripts/bootstrap-admin.ts` against the production database, i.e. database credentials and an operator, for what began as one mistyped tool call.

**"Active" is doing real work in that wording.** The guard counts *active* admins (`README.md:217`), so a suspended admin does not protect anything and does not count as a survivor:

- Two admins, A and B, both active. Suspending A succeeds (B still counts). Suspending B is then **blocked** — B is the last active admin.
- The set of legal operations therefore depends on the order they are attempted in. Nothing in the specification explores this, and nothing says whether the count is taken inside the same transaction as the write. Two admins suspended concurrently could each see the other as active and both succeed, leaving zero. **Unstated; a real gap.**

## Resolution order

The per-request check that makes `suspended` bite (`README.md:329-333`), in order — the order is the rule:

1. `Authorization: Bearer <token>` missing or malformed → `401`.
2. Hash and look up. Unknown, revoked, or expired → `401`.
3. Load the user. `status != active` → `401`. Written as a **negation**, so `deleted` — and any future status — is rejected by default. Whatever the enum contradiction is resolved to, this line stays correct.
4. Resolve permissions: `role_permissions(user.role) ∩ (token.scopes ?? everything)`. `?? everything` means **a token with no explicit scopes inherits the user's role in full** (`README.md:63-64`); a null there is maximal, not minimal.
5. Pass `{ userId, role, tokenId, permissions }` as `props`; `tools/list` filters on it and every handler re-checks it.

A role change is therefore effective on the target's very next request — permissions are resolved per request, never cached in the token.

## Lifetime

| | |
| --- | --- |
| Holder | the `users` row in Postgres (Neon), reached over HTTP per request (`README.md:28`). |
| Created | by the bootstrap script, or by `user_create`. |
| Destroyed | only by `user_delete` with `hard: true`. A soft delete keeps the row forever. |
| Outlives the account | **contributed wines.** `wines.created_by` still points at the deleted user at every delete depth (`README.md:222`) — a dangling reference by design, so the shared catalogue survives. See [[wine-catalog-index]]. |
| Does not outlive a hard delete | that user's cellar items and reviews (`README.md:221`). Aggregate ratings on a wine (`README.md:175`) therefore change when a user is hard-deleted. |
| Unstated | whether a soft-deleted user's `email` may be reused by a later `user_create` — which is undecidable while `email` uniqueness itself is unstated. |
