---
page: security
status: stub
updated: 2026-08-29
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:325
---

# Security

Rules that are not any single feature's property. Source: `business-docs/wiki/shared/mvp-spec.md:325-363`.

## The structural rule

**Tool handlers read the calling user from `props`, never from tool input** (`business-docs/wiki/shared/mvp-spec.md:350`).

This is the load-bearing rule of the whole design. "You can only touch your own cellar" is not a validation someone remembers to write — it is structural, because no non-admin tool accepts a `user_id` at all. There is no parameter through which to ask for someone else's data.

The `admin:*` tools are the sole exception, and they gate on `admin:users` / `admin:tokens` **first**.

A tool that adds a `user_id` input has broken this rule even if it checks the value.

## Two layers, both required

| Layer | What it does | What it is |
| --- | --- | --- |
| Visibility | `tools/list` returns only permitted tools | a UX affordance — it stops a model hallucinating a tool it cannot call |
| Execution | every handler re-checks its permission before doing work | **the security boundary** |

**A tool must never rely on having been hidden** (`business-docs/wiki/shared/mvp-spec.md:150`). Hiding is for the model's benefit; the check is for the system's.

## Token handling

- 32 bytes from `crypto.getRandomValues`, base64url, prefixed `wc_` so it is greppable in logs (`business-docs/wiki/shared/mvp-spec.md:335`).
- **Only the SHA-256 hash is stored.** Plaintext is returned exactly once, at creation, and is never retrievable again (`business-docs/wiki/shared/mvp-spec.md:336`).
- Optional `expires_at`; optional `scopes` narrower than the user's role.
- One token per client, so revoking one client leaves the others working.

## What is never logged

**Tokens are never logged, in plaintext or hashed** (`business-docs/wiki/shared/mvp-spec.md:361`). `token_list` never returns the token, and never a recoverable prefix beyond the last 4 characters (`business-docs/wiki/shared/mvp-spec.md:244`).

## Trust boundaries

| Boundary | What crosses it | Checked how |
| --- | --- | --- |
| MCP client → Worker | bearer token | hash lookup, revocation, expiry, user status |
| Agent → tool input | free text and structured fields | per-tool zod schema |
| Server → client | wine rows, cellar, reviews | scoped to `props.userId` by construction |

**Images never cross any boundary.** Vision happens client-side; the server takes structured fields only and stores no images of any kind (`business-docs/wiki/shared/mvp-spec.md:25`, `business-docs/wiki/shared/mvp-spec.md:45`).

## Not yet specified

- No rate limiting is described anywhere.
- ~~No statement on whether `wine_search` free text is parameterized against SQL injection~~ — closed by [ADR-0021](../decisions/0021-wine-search-is-full-text-plus-trigram.md): every value is a bound parameter, including the optional structured filters, and a query in `src/db/queries/wines.ts` containing an interpolated value is a bug.
- Suspension "kills every one of that user's tokens at the next request" (`business-docs/wiki/shared/mvp-spec.md:231`) — the tokens are not actually revoked, the user lookup fails. Reinstating a user therefore silently restores every token they had. Nothing says whether that is intended.
