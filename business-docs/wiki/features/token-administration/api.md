---
feature: token-administration
page: api
status: stub
source_of_truth: wiki
code_refs:
  - README.md:224
updated: 2026-08-29
---

# Token administration — API

**There is no OpenAPI document, by decision.** The surface is MCP tools over Streamable HTTP at `/mcp`, not REST resources; a spec describing one endpoint that multiplexes every tool would describe nothing ([ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md)). The tool contracts below are therefore the contract. See [[mcp-protocol]].

| Tool | Permission | Handler | Called from |
| --- | --- | --- | --- |
| `token_create` | `admin:tokens` | `src/tools/admin/token_create.ts` (planned, `README.md:364`) | an admin's MCP client |
| `token_list` | `admin:tokens` | `src/tools/admin/token_list.ts` (planned) | an admin's MCP client |
| `token_revoke` | `admin:tokens` | `src/tools/admin/token_revoke.ts` (planned) | an admin's MCP client |

Transport: `POST /mcp`, `Authorization: Bearer <token>` (`README.md:25-26`, `README.md:384-385`).

> **Unverified.** No handler exists. The schemas below are transcribed from prose at `README.md:224-233`; no zod schema has been written.

## Tool schemas

### `token_create` (`README.md:224-227`)

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `user_id` | id | yes | The owner of the new token |
| `label` | string | yes | Which client this key is for (`claude-desktop`, `gemini`, `phone`) |
| `scopes` | string[] | no | A subset of that user's permissions. Omitted ⇒ `null` ⇒ inherit the role in full |
| `expires_at` | timestamp | no | Omitted ⇒ the token never expires |

Returns: the plaintext token, **once**, plus (unspecified) the created row's metadata.

### `token_list` (`README.md:229-231`)

Input: a `user_id` filter, or nothing for everyone. Returns per token: `label`, `scopes`, created, last used, revoked.

### `token_revoke` (`README.md:233`)

Input: a token id. Effect: immediate.

## Request rules that matter here

| Rule | Expression | Source |
| --- | --- | --- |
| Permission gate runs first | The `admin:*` tools "gate on `admin:users` / `admin:tokens` first" | `README.md:338-339` |
| These are the sole tools that accept a `user_id` | Every other tool resolves the user from `props`, never from input | `README.md:154-156`, `README.md:336-337` |
| `scopes` omitted is not `scopes: []` | `token.scopes ?? everything` — a missing value means *no narrowing*, an empty array would mean *no permissions* | `README.md:332` |
| `expires_at` omitted means immortal | No default expiry is specified | `README.md:325` |
| Revocation is by token id | Not by user, not by label | `README.md:233` |

## Response rules that matter here — what the client is deliberately NOT told

This is the part of the contract most likely to be eroded by a helpful change. Each row is a field that is **absent on purpose**.

| Response | Withheld | Why |
| --- | --- | --- |
| `token_create` | Nothing — this is the single exception. The plaintext is returned **exactly once**, at creation, and is never retrievable again (`README.md:226-227`, `README.md:322`) | It has to reach the human somehow, and this is the only moment it can |
| `token_list` | **The token itself** (`README.md:230`) | Only the SHA-256 hash exists to return, and it must not be returned either ([ADR-0012](../../decisions/0012-only-the-token-hash-is-stored.md)) |
| `token_list` | **Any recoverable prefix beyond the last 4 characters** (`README.md:230-231`) | 4 characters identify a row visually without narrowing a brute force. Keys are identified by `label`, not by bytes |
| `token_list` | The `token_hash` | A hash of a 32-byte random value is an offline-crackable credential handed out for free |
| any log or `audit_log` | Tokens, plaintext or hashed (`README.md:347`) | See [[audit-logging]] |
| every `401` | Which of the five rejection causes fired (`README.md:143-145`) | Owned by [[authentication-index]]; deliberate opacity |

**Unspecified in the `token_create` response:** whether the created row's `id` comes back. It is the only handle `token_revoke` accepts (`README.md:233`), so without it the admin must call `token_list` to revoke what they just made. Recorded in [[divergences]].

Fields whose names mislead: `last_used_at` is best-effort and may be stale or null for a token in daily use (`README.md:341`). It is not an audit signal — see [[token-administration-states]].

## Planned

| Named | Source | State |
| --- | --- | --- |
| `src/tools/admin/token_*.ts` | `README.md:364` | not written |
| `src/db/queries/tokens.ts` | `README.md:362` | not written |
| OAuth 2.1 token issuance replacing all three tools | `README.md:35`, `README.md:420-421` | after the MVP ([ADR-0003](../../decisions/0003-bearer-tokens-not-oauth-for-the-mvp.md)) |
| Per-user permission grants instead of three fixed roles, which would change what `scopes` can contain | `README.md:421-422` | after the MVP |

Nothing else. No REST endpoint for tokens is planned, and none should be invented.
