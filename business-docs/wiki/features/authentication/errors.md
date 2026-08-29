---
feature: authentication
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - README.md:142
updated: 2026-08-29
---

# Authentication — errors

Shared catalogue: [[error-codes]]. This page covers the transport-level rejections only; permission denials after authentication belong to [[authorization-index]].

## Five conditions, one response

**Every authentication failure is a bare `401` with no detail.** The caller cannot tell which of the five conditions applied.

| # | Condition | Step | Response | What the caller sees | Recovery |
| --- | --- | --- | --- | --- | --- |
| 1 | No `Authorization` header, or malformed | 1 (`README.md:329`) | `401` | connection refused, no tool list, nothing (`README.md:145`) | supply a well-formed `Authorization: Bearer <token>` |
| 2 | Token unknown — hash matches no row | 2 (`README.md:330`) | `401` | as above | obtain a token from an admin |
| 3 | Token revoked — `revoked_at` set | 2 (`README.md:330`) | `401` | as above | ask an admin to issue a new one; revocation is terminal |
| 4 | Token expired — `expires_at` passed | 2 (`README.md:330`) | `401` | as above | ask an admin to issue a new one |
| 5 | User not active — `status != active` | 3 (`README.md:331`) | `401` | as above | ask an admin to reinstate the account |

The rejection happens **before any permission check** (`README.md:143`) and before the MCP session exists. There is no tool list, no partial capability, no degraded mode.

## Why they are indistinguishable

This is a deliberate design property, not an implementation shortcut.

Distinguishing them turns the endpoint into an oracle. "Unknown token" versus "revoked token" tells an attacker holding a candidate string whether that string was ever a real credential — which converts a guess into a confirmed hit, and makes a leaked-and-revoked token a signal that the account exists. "User suspended" leaks an account's status to anyone holding any string. A single opaque `401` says only *no*.

The corresponding asymmetry — [[error-codes]] states it directly — is that **tool-level** permission denials are deliberately verbose: `Permission denied: 'user_create' requires 'admin:users'; your role is 'member'.` (`README.md:139-140`). That is safe precisely because it comes *after* this page's checks have passed. Identity is already established; naming the missing permission tells an authenticated caller nothing they could not read in the documentation, and it stops an LLM client retrying in a loop.

**The rule: before identity is established, say nothing. After it is established, say everything.**

| | Transport (`401`) | Tool (permission denied) |
| --- | --- | --- |
| Caller identity | unknown | established |
| Detail given | none | the tool, the required permission, the caller's role |
| Purpose | reveal nothing to a stranger | let the agent report and stop |

## Recovery is always out-of-band

None of the five conditions is recoverable inside the protocol. There is no refresh, no re-auth challenge, no `WWW-Authenticate` negotiation described. Every recovery path runs through a human admin using [[token-administration-index]] or [[user-administration-index]] tools, or — for an empty database — the bootstrap script ([ADR-0013](../../decisions/0013-the-first-admin-is-seeded-by-script.md)).

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `last_used_at` write | any failure of the `ctx.waitUntil` update (`README.md:341`) | nothing — the request succeeds. The timestamp is simply not written, and nothing records that it was not |
| The `401` itself | which of the five conditions fired | one undifferentiated failure. **Deliberate** — see above |

The first row is an **accidental** silence with a real consequence: `user_list` "last activity" (`README.md:213`) and `token_list` "last used" (`README.md:230`) both read this field. A stale or null `last_used_at` is not evidence that a token went unused. Anyone pruning tokens on that basis is acting on an unreliable signal. Recorded in [[divergences]].

The second row is a **deliberate** silence and should stay.

## Retries

Nothing is retried. Neither the token lookup nor the user lookup has a specified retry, backoff, or fallback; a database failure during step 2 or 3 has **no specified behaviour at all**.

That is a real gap: an unreachable Neon endpoint (`README.md:28`) would most naturally surface as a `500`, which is distinguishable from a `401` and therefore tells a caller that their token was *not* the problem. Whether that distinction is acceptable is undecided. It should be, but the specification does not say it.

## Not specified

| Gap | Detail |
| --- | --- |
| Response body of the `401` | Whether it is empty, JSON, or a JSON-RPC error object is not stated. It must not vary by condition. |
| `WWW-Authenticate` header | Not mentioned. `401` without it is technically incomplete HTTP. |
| Rate limiting | **None is described anywhere** (`README.md` has no mention). Repeated `401`s are unbounded and uncounted. |
| Logging of failures | Only *admin actions* are audited (`README.md:345-347`). Nothing says whether a failed authentication is logged at all — so there is no specified way to notice a brute-force attempt. See [[audit-logging]]. |
| Database error during steps 2–3 | Unspecified, as above. |
| Timing differences between conditions | A naive lookup could make condition 2 measurably faster than 3–5. With 32 bytes of entropy (`README.md:321`) this is very likely academic — the search space is not walkable regardless — but it is the one channel through which the opaque `401` could leak what it is designed to hide. Worth a constant-time comparison; not worth alarm. |
| SHA-256 collision / duplicate `token_hash` | No uniqueness constraint is declared on `api_tokens` (`README.md:60-61`), unlike `wines` (`README.md:74`). What a multi-row match resolves to is undefined. |
