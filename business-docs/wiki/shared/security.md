---
page: security
status: stub
updated: 2026-08-29
code_refs:
  - README.md:311
---

# Security

Rules that are not any single feature's property. Source: `README.md:311-349`.

## The structural rule

**Tool handlers read the calling user from `props`, never from tool input** (`README.md:336`).

This is the load-bearing rule of the whole design. "You can only touch your own cellar" is not a validation someone remembers to write — it is structural, because no non-admin tool accepts a `user_id` at all. There is no parameter through which to ask for someone else's data.

The `admin:*` tools are the sole exception, and they gate on `admin:users` / `admin:tokens` **first**.

A tool that adds a `user_id` input has broken this rule even if it checks the value.

## Two layers, both required

| Layer | What it does | What it is |
| --- | --- | --- |
| Visibility | `tools/list` returns only permitted tools | a UX affordance — it stops a model hallucinating a tool it cannot call |
| Execution | every handler re-checks its permission before doing work | **the security boundary** |

**A tool must never rely on having been hidden** (`README.md:136`). Hiding is for the model's benefit; the check is for the system's.

## Token handling

- 32 bytes from `crypto.getRandomValues`, base64url, prefixed `wc_` so it is greppable in logs (`README.md:321`).
- **Only the SHA-256 hash is stored.** Plaintext is returned exactly once, at creation, and is never retrievable again (`README.md:322`).
- Optional `expires_at`; optional `scopes` narrower than the user's role.
- One token per client, so revoking one client leaves the others working.

## What is never logged

**Tokens are never logged, in plaintext or hashed** (`README.md:347`). `token_list` never returns the token, and never a recoverable prefix beyond the last 4 characters (`README.md:230`).

## Trust boundaries

| Boundary | What crosses it | Checked how |
| --- | --- | --- |
| MCP client → Worker | bearer token | hash lookup, revocation, expiry, user status |
| Agent → tool input | free text and structured fields | per-tool zod schema |
| Server → client | wine rows, cellar, reviews | scoped to `props.userId` by construction |

**Images never cross any boundary.** Vision happens client-side; the server takes structured fields only and stores no images of any kind (`README.md:11`, `README.md:31`).

## Not yet specified

- No rate limiting is described anywhere.
- No statement on whether `wine_search` free text is parameterized against SQL injection — it must be, but the specification does not say it.
- Suspension "kills every one of that user's tokens at the next request" (`README.md:217`) — the tokens are not actually revoked, the user lookup fails. Reinstating a user therefore silently restores every token they had. Nothing says whether that is intended.
