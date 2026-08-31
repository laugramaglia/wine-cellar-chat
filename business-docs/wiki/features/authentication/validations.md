---
feature: authentication
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:343
updated: 2026-08-29
---

# Authentication — validations

Everything here runs **server-side, at the Worker edge**, before any tool schema is consulted. The MCP client validates nothing: it pastes a header it was given (`business-docs/wiki/shared/mvp-spec.md:399`).

## Rules

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| `Authorization` header | must be present | step 1 (`business-docs/wiki/shared/mvp-spec.md:343`) | none — bare `401` |
| `Authorization` header | must be well-formed `Bearer <token>` | step 1 (`business-docs/wiki/shared/mvp-spec.md:343`) | none — bare `401` |
| token | SHA-256 hash must match an `api_tokens` row | step 2 (`business-docs/wiki/shared/mvp-spec.md:344`) | none — bare `401` |
| token | `revoked_at` must be null | step 2 (`business-docs/wiki/shared/mvp-spec.md:344`) | none — bare `401` |
| token | `expires_at` must be null or in the future | step 2 (`business-docs/wiki/shared/mvp-spec.md:344`) | none — bare `401` |
| user | `status` must be `active` | step 3 (`business-docs/wiki/shared/mvp-spec.md:345`) | none — bare `401` |
| `token.scopes` | applied as an intersection, so a scope outside the role grants nothing | step 4 (`business-docs/wiki/shared/mvp-spec.md:346`) | none — silently narrowed |

Every message column is empty on purpose. See [[authentication-errors]] for why.

## What "malformed" is not defined to mean

`business-docs/wiki/shared/mvp-spec.md:343` says "missing or malformed → `401`" and stops. The following are all unspecified, and each is a decision someone will make by accident while implementing:

| Case | Undecided |
| --- | --- |
| Scheme casing — `bearer` vs `Bearer` | whether the comparison is case-insensitive, as RFC 7235 requires |
| Extra whitespace, or multiple spaces after the scheme | accepted or rejected |
| A second `Authorization` header | first wins, last wins, or reject |
| A token not matching `wc_[A-Za-z0-9_-]{43}` | whether the shape is checked at all before hashing, or whether any string is simply hashed and looked up |
| Empty credential — `Authorization: Bearer ` | malformed, or an unknown token |

None of these is observable from outside — all roads lead to `401` — so they are implementation freedom, not user-facing behaviour. But **checking the `wc_` prefix and length before hashing** is the cheap way to make garbage traffic fail without a database round-trip, and nothing currently says to do it.

## Token generation — validated by construction

| Property | Value | Source |
| --- | --- | --- |
| Entropy source | `crypto.getRandomValues` | `business-docs/wiki/shared/mvp-spec.md:335` |
| Length | 32 bytes | `business-docs/wiki/shared/mvp-spec.md:335` |
| Encoding | base64url | `business-docs/wiki/shared/mvp-spec.md:335` |
| Prefix | `wc_` | `business-docs/wiki/shared/mvp-spec.md:335` |
| Stored form | SHA-256 hash only | `business-docs/wiki/shared/mvp-spec.md:336` |

These are properties of issuance ([[token-administration-index]]), not of the request path — but they are the reason the request path can be simple. 32 bytes of CSPRNG output is not guessable, so no lockout, throttle, or complexity rule is needed to make the lookup safe. That reasoning is only as good as the entropy: a substitution of `Math.random()` would silently invalidate the whole model and no test described in `business-docs/wiki/shared/mvp-spec.md:413-431` would catch it.

## Client vs server

| Rule | Client | Server |
| --- | --- | --- |
| header present and well-formed | — | ✅ |
| token valid, unrevoked, unexpired | — | ✅ |
| user active | — | ✅ |
| scopes ⊆ role permissions | — | ✅ (by intersection, step 4) |

Nothing is client-enforced, which is correct: the client is untrusted by construction, and there is no client code in this project to enforce anything in.

## Not validated

| Input | Detail |
| --- | --- |
| Request rate | **No rate limiting anywhere in the specification.** Unlimited `401`s, uncounted and (as far as anything says) unlogged — see [[audit-logging]]. |
| Header size | No stated bound on the `Authorization` value before it is hashed. |
| Token uniqueness in storage | No `UNIQUE (token_hash)` declared on `api_tokens` (`business-docs/wiki/shared/mvp-spec.md:74-75`), though `wines` declares one (`business-docs/wiki/shared/mvp-spec.md:88`). A duplicate-hash lookup is undefined. |
| Origin, IP, or client identity | Nothing binds a token to a client beyond its `label`, which is descriptive. A stolen `claude-desktop` token works from anywhere. |
| Token age | `expires_at` is optional (`business-docs/wiki/shared/mvp-spec.md:339`), and no rotation policy is stated. The default is an immortal credential. |

The last row is the one to argue about before implementing: [ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md) accepts hand-rolled bearer tokens precisely because the user set is small and known — that argument holds much better with a default expiry than without one.
