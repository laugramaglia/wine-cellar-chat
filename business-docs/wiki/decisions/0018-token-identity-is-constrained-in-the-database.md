---
adr: 0018
title: A token hash is unique, a live label is unique per user, and scopes is never empty
status: accepted
date: 2026-08-29
affects:
  - authentication
  - token-administration
  - authorization
supersedes:
superseded_by:
source: human decision — schema design, 2026-08-29; resolves three gaps recorded in business-docs/wiki/shared/divergences.md
---

# ADR-0018 — A token hash is unique, a live label is unique per user, and `scopes` is never empty

**Decision.** `api_tokens.token_hash` is a unique 32-byte `bytea`; `(user_id, lower(label))` is unique among unrevoked tokens; and `scopes` is either `null` or a non-empty array — an empty array cannot be stored.

## Context

Three separate silences in [[mvp-spec]] land on one table, and all three are recorded in [[divergences]].

**No `UNIQUE (token_hash)` is declared** (`business-docs/wiki/shared/mvp-spec.md:74-78`), though `wines` declares a uniqueness key eleven lines later. The per-request flow hashes the presented token and looks it up (`business-docs/wiki/shared/mvp-spec.md:342`); with no constraint, "look it up" has undefined behaviour when two rows match. A collision on 32 bytes of `crypto.getRandomValues` is not the worry — a bug, a bad migration, or a restored backup writing a duplicate row is, and it would authenticate as whichever row the planner returned first.

**`label` has no uniqueness rule and there is no maximum token count.** The whole point of one token per client is that "revoking Gemini leaves Claude working" (`business-docs/wiki/shared/mvp-spec.md:337-338`). Two live tokens labelled `gemini` defeat that quietly: the admin revokes the one they can see and the other keeps working.

**An empty `scopes` array is unspecified.** `null` means "inherit the user's role in full" (`business-docs/wiki/shared/mvp-spec.md:76-78`), but `'{}'` is a distinct, storable `text[]` meaning "a token that can call nothing". Under the intersection at `business-docs/wiki/shared/mvp-spec.md:346` the two values behave in opposite ways, and nothing says which an admin gets if they pass `[]`.

## Decision

```sql
token_hash  bytea NOT NULL CHECK (octet_length(token_hash) = 32),
scopes      text[] CHECK (scopes IS NULL OR cardinality(scopes) > 0),

CREATE UNIQUE INDEX api_tokens_hash_uniq  ON api_tokens (token_hash);
CREATE UNIQUE INDEX api_tokens_label_uniq ON api_tokens (user_id, lower(label))
  WHERE revoked_at IS NULL;
```

`token_hash` is `bytea`, not hex text: the hash is exactly 32 bytes, and storing it as bytes is what lets the length `CHECK` mean something. Storing a truncated hash, a hex string of the wrong length, or a plaintext token by mistake all become insert-time failures.

Label uniqueness is scoped to `revoked_at IS NULL`, so a revoked `gemini` token does not block issuing its replacement. Uniqueness is on `lower(label)`, because `Gemini` and `gemini` are one client.

`scopes` is `null` or non-empty. An admin who wants a token that can do nothing revokes it or does not issue it; `[]` is a mistake, and it is now one the database refuses rather than one that silently mints an inert credential nobody can diagnose.

`token_last4` is stored alongside the hash, because `token_list` is specified to show up to the last 4 characters (`business-docs/wiki/shared/mvp-spec.md:244`) and the plaintext is gone by then ([ADR-0012](0012-only-the-token-hash-is-stored.md)).

## Consequences

- Authentication's lookup is provably single-row, so `business-docs/wiki/shared/mvp-spec.md:342` has one defined outcome.
- Selective revocation per client is now structurally true rather than a naming convention.
- Storing a hash of the wrong length — the shape a truncation or an encoding bug takes — fails at write time, on the row, rather than at 3am on an auth path.
- **A second live token for the same client requires a different label.** An admin re-issuing before revoking gets a constraint violation and must say `gemini-2` or revoke first. That friction is the feature; the alternative is two keys nobody can tell apart.
- This ADR does **not** decide what happens when `scopes` names a permission the user's role does not grant. That question — reject at issuance, or intersect silently — stays open in [[authorization-decisions]] and is the dormant-scope problem in [[divergences]]. The non-empty constraint narrows the input space; it does not resolve the policy.
- No maximum number of tokens per user is imposed. Label uniqueness bounds the useful count in practice, which is the part that mattered.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| `text` column holding a hex or base64 digest | Doubles the stored bytes, permits a wrong-length or wrong-encoding value, and makes the length check cosmetic. |
| No hash uniqueness, rely on entropy | Entropy prevents collisions between correctly generated tokens. It does not prevent a duplicate row from a bug or a restore, which is the case with undefined behaviour. |
| Unique label across all tokens including revoked | A label could never be reused, so replacing a revoked key would force a new name each time. Revocation should not consume vocabulary. |
| Treat `'{}'` as equivalent to `null` in code | Two spellings of "inherit everything", one of which reads to a human as "nothing". The most dangerous kind of convenience. |
| Treat `'{}'` as "no permissions" and allow it | Defensible, but it makes an inert token indistinguishable at a glance from a fully scoped one in `token_list`, and nobody asked for that capability. |

## Where this is enforced

`src/db/schema.sql` (constraints and indexes), `src/db/queries/tokens.ts` (`token_create`, `token_revoke`), `src/auth.ts` (the hash lookup). Cite as `ADR-0018`. See [ADR-0012](0012-only-the-token-hash-is-stored.md) and [[security]].
