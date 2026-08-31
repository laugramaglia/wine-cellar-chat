---
adr: 0017
title: Deletion is a status, and an email is unique only among living accounts
status: accepted
date: 2026-08-29
affects:
  - user-administration
  - authentication
supersedes:
superseded_by:
source: human decision — schema design, 2026-08-29; resolves the internal contradiction recorded in business-docs/wiki/shared/divergences.md
---

# ADR-0017 — Deletion is a status, and an email is unique only among living accounts

**Decision.** `deleted` is a third value of `user.status`, and `users.email` is unique across accounts whose status is not `deleted` — so a soft-deleted account releases its address.

## Context

[[mvp-spec]] contradicts itself. It gives `user.status` as `active | suspended` twice (`business-docs/wiki/shared/mvp-spec.md:73`, `business-docs/wiki/shared/mvp-spec.md:229`) and then sets a third value it never declared: soft delete "sets status `deleted`" (`business-docs/wiki/shared/mvp-spec.md:235`). This is the one genuine self-contradiction in the specification, recorded as such in [[divergences]].

Separately, `email` has no stated uniqueness constraint and no stated format rule anywhere, though it is the only human-legible identity in `user_list`. The two questions are the same question: **whether a soft-deleted user's email can be reused is undecidable until deletion has a defined representation.**

The forcing case is ordinary. An admin creates an account for a departing colleague's replacement at the same address, or deletes an account created with a typo and recreates it. Under a table-wide unique constraint, both fail with a violation naming a row the admin cannot see.

## Decision

`user_status` is `active | suspended | deleted` ([ADR-0015](0015-closed-enumerations-are-database-types.md)). A soft delete sets `status = 'deleted'` and revokes every token; the row and its `id` survive, so foreign keys from `wines.created_by`, `reviews`, and `audit_log` continue to resolve.

Uniqueness is partial:

```sql
CREATE UNIQUE INDEX users_email_live_uniq ON users (email) WHERE status <> 'deleted';
```

`email` is `citext` with a format `CHECK`, so `Fabian@example.com` and `fabian@example.com` are one address rather than two accounts.

A `deleted` user is rejected at authentication by the existing rule — `status != active` → `401` (`business-docs/wiki/shared/mvp-spec.md:344`) — with no new branch. That rule already covers a third status correctly, which is part of why `deleted` belongs in the status column rather than beside it.

## Consequences

- The enum now covers what the system actually does, so `user_list`'s filter, the auth check, and the delete path all speak one vocabulary.
- An address can be recycled after a soft delete. This is what an admin expects; it also means **email is not a stable identifier for a person across time** — `users.id` is, and anything that needs to identify an actor historically must store the id. `audit_log` already does.
- Two soft-deleted accounts may share an address, which is correct and occasionally surprising in a raw query.
- Hard delete (`hard: true`) still removes the row and cascades cellar items, reviews and prefs. Wines the user contributed stay in the shared catalogue with `created_by` set to null (`business-docs/wiki/shared/mvp-spec.md:236`).
- **`user_prefs` cascades on both paths.** It is keyed on `user_id` and was omitted from both delete depths in the specification; the omission reads as an oversight and is closed here.
- The last-admin guard must count only `status = 'active'` admins, which it already does — but it now has a third status to ignore rather than two. The guard's transactionality is a separate open question and is *not* closed by this ADR.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A separate `deleted_at timestamptz` column | Two sources of truth for liveness. Every query would have to test both `status` and `deleted_at`, and one of them would eventually be forgotten at the auth check. |
| Table-wide `UNIQUE (email)` | Blocks recreating an account at a deleted address, with an error naming an invisible row. Punishes the ordinary case to keep a property nobody asked for. |
| A `deleted_users` archive table | Breaks every foreign key from reviews, wines and audit entries, or duplicates them. The value of soft delete is that the id keeps resolving. |
| Hard delete only | Destroys the audit trail and orphans catalogue contributions. `business-docs/wiki/shared/mvp-spec.md:235` makes soft the default deliberately. |
| No email uniqueness at all | Makes `user_list` ambiguous to the human reading it and invites two accounts for one person, silently splitting a cellar. |

## Where this is enforced

`src/db/schema.sql` (the `user_status` type and `users_email_live_uniq`), `src/auth.ts` (the `status != active` rejection), `src/db/queries/users.ts` (`user_delete`). Cite as `ADR-0017`. See [[user-administration-index]] and [[authentication-index]].
