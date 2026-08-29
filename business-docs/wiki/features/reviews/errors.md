---
feature: reviews
page: errors
status: stub
source_of_truth: wiki
code_refs:
  - README.md:139
  - README.md:143
updated: 2026-08-29
---

# Reviews — errors

Shared catalogue: [[error-codes]]. Transport-level rules: [[mcp-protocol]]. Auth rules: [[security]].

| Condition | Code / exception | What the user sees | Recovery |
| --- | --- | --- | --- |
| No / malformed `Authorization` header | `401` at the Worker edge | Connection refused, no tool list at all (`README.md:329`, `README.md:145`) | Supply a valid bearer token |
| Unknown, revoked, or expired token | `401` | Same — nothing loads (`README.md:330`, `README.md:143-144`) | Have an admin issue a new token ([[token-administration-index]]) |
| User `status = suspended` | `401` | Same, immediately on the next request (`README.md:144`, `README.md:413`) | Admin reactivates the account |
| `guest` calls `review_write` | MCP permission error | `Permission denied: 'review_write' requires 'review:write'; your role is 'guest'.` — pattern from `README.md:139-141` | None; guests are read-only (`README.md:108`) |
| Scoped token lacking `review:write` | MCP permission error, same shape | Same message | Use a token whose `scopes` include it (`README.md:113-114`) |
| `review_write` for a nonexistent `wine_id` | **Unspecified** | Unspecified | — |
| `rating` outside `1-100` | **Unspecified** — see [[reviews-validations]] | Unspecified | — |
| `consume: true` with no bottles owned | **Unspecified** — see [[reviews-flow]] | Unspecified | — |

The permission-denied message is deliberately explicit and boring so the agent reports it rather than retrying in a loop (`README.md:139-141`). That is a behavioural requirement on the copy, not a style note; see [[reviews-copy]].

## Visibility as a first line

A `guest` never sees `review_write` in `tools/list` at all (`README.md:132-134`), so the denial above is the second line of defence, not the first. Both layers are required: every handler re-checks the permission, because visibility filtering is a UX affordance and **execution is the security boundary** (`README.md:135-137`). See [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) via [[reviews-decisions]].

## Silent failures

| Where | What is swallowed | What the user experiences instead |
| --- | --- | --- |
| `last_used_at` update | Written best-effort via `ctx.waitUntil` (`README.md:341`) — a failure cannot fail the request | Their review still lands; the token's last-activity column in `token_list` is silently wrong |
| `consume: true` decrement | **Unspecified** whether the insert and the decrement are one transaction | If they are not, a review can exist for a bottle never deducted, or vice versa. Nobody would be told. |
| Aggregate rating | Sample size is not part of the stated contract beyond the reason string | A "92 average" over one review reads the same as over forty |

Each unspecified row above is a genuine gap in `README.md`, not an observed behaviour. They are listed in [[divergences]].

## Retries

Nothing in this feature specifies a retry. The permission error is explicitly designed **not** to be retried by the agent (`README.md:139-141`). Whether a failed Neon HTTP call is retried is unstated anywhere in the specification.
