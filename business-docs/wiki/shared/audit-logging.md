---
page: audit-logging
status: stub
updated: 2026-08-29
code_refs:
  - README.md:343
---

# Audit logging

Source: `README.md:345-347`.

Administrative actions are written to an `audit_log` table. This is a shared concern rather than a feature because two features write to it ([[user-administration-index]], [[token-administration-index]]) and neither owns it.

## Table

```
audit_log    actor_user_id, action, target_user_id, metadata jsonb, created_at
```

## What is recorded

| Action | Written by |
| --- | --- |
| user created | [[user-administration-index]] |
| role changed | [[user-administration-index]] |
| token issued | [[token-administration-index]] |
| token revoked | [[token-administration-index]] |

## What is never recorded

**Tokens, in plaintext or hashed** (`README.md:347`). `metadata` may name a token's `label` and `id`; it must never carry its value. See [[security]].

## Not yet specified

- `action` is not a stated enum — the four values above are inferred from prose, not declared.
- Nothing says whether suspension, deletion, or a failed permission check is audited. Suspension and deletion are administrative acts and arguably must be; a denied permission check is arguably a security event and belongs somewhere.
- No retention rule.
- Whether the write is on the request path or deferred via `ctx.waitUntil` — the specification only says that for `last_used_at` (`README.md:341`).
