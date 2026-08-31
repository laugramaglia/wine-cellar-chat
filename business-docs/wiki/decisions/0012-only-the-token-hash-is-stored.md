---
adr: 0012
title: Only the token hash is stored; plaintext is returned exactly once
status: accepted
date: 2026-08-29
affects:
  - authentication
  - token-administration
supersedes:
superseded_by:
source: business-docs/wiki/shared/mvp-spec.md:336
---

# ADR-0012 — Only the token hash is stored; plaintext is returned exactly once

**Decision.** API tokens are stored as SHA-256 hashes. The plaintext is returned at creation and is never retrievable again, by anyone, including an admin.

## Context

Tokens here are bearer credentials with the full permissions of their user ([[ADR-0003]]). A readable token table means a database dump, a log line, or an over-broad admin query hands over every account.

Admins will want to look a token up — "which key did I give Fabian?" — and that convenience is precisely what must not exist.

## Decision

Store `token_hash` only. Return the plaintext once, at creation (`business-docs/wiki/shared/mvp-spec.md:336`). `token_list` returns label, scopes, timestamps, and no more than the last 4 characters (`business-docs/wiki/shared/mvp-spec.md:244`). Tokens are never logged, plaintext or hashed (`business-docs/wiki/shared/mvp-spec.md:361`).

Tokens are 32 bytes from `crypto.getRandomValues`, base64url, prefixed `wc_` so they are greppable in logs — which is a detection aid for a leak, not permission to log them.

## Consequences

- A database compromise yields no usable credentials.
- A lost token is replaced, never recovered. Revoke and reissue is the only path.
- The `user_create` + `issue_token: true` response is the one moment the secret exists in transit; that response is unusually sensitive.
- One token per client means revoking Gemini leaves Claude working (`business-docs/wiki/shared/mvp-spec.md:338`).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Store plaintext | A single dump compromises every account. |
| Reversible encryption | Moves the problem to key management and still permits bulk recovery. |
| bcrypt/argon2 | Built for low-entropy human passwords. A 32-byte random token is not brute-forceable, and per-request auth needs the lookup to be fast. |

## Where this is enforced

`src/auth.ts`, `src/db/queries/tokens.ts` (planned). Cite as `ADR-0012`. See [[security]].
