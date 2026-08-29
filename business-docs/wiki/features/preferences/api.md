---
feature: preferences
page: api
status: stub
source_of_truth: wiki
code_refs:
  - README.md:198
  - README.md:124
updated: 2026-08-29
---

# Preferences — API

**There is no OpenAPI document, by decision** —
[ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). The surface is not
REST: it is MCP over Streamable HTTP at a single endpoint, `/mcp` (`README.md:25`), where
every operation is a JSON-RPC tool call. There is exactly one HTTP path and it has no
per-tool schema to describe. Tool contracts therefore live **here**, in the wiki, and
nowhere else. Protocol-level detail: [[mcp-protocol]].

> **Unverified.** No handler, no zod schema and no tool registration exists in this
> repository. Both tools below are described in one sentence each in the specification.

| Tool | Permission | Roles | Planned handler | Called from |
| --- | --- | --- | --- | --- |
| `prefs_get` | `prefs:read` | `admin`, `member`, `guest` | `src/tools/` (`README.md:363`) | any MCP client; the engine reads the row directly, not through the tool |
| `prefs_set` | `prefs:write` | `admin`, `member` | `src/tools/` (`README.md:363`) | any MCP client |

Sources: `README.md:124-125` (permissions), `README.md:200-203` (tools).

## `prefs_get`

*"The caller's stored palate profile"* (`README.md:200`) — the entire specification of
this tool.

| | |
| --- | --- |
| Input | none specified. There is no `user_id` parameter: the user comes from the bearer token via `props` (`README.md:154-156`, `README.md:336-337`) |
| Output | the `user_prefs` row: `likes`, `dislikes`, `budget_min`, `budget_max`, `sweetness`, `body`, `tannin`, `acidity`, `avoid`, `notes`, `updated_at` (`README.md:65-66`) |
| Undefined | the response when the user has **no row**; whether `updated_at` is returned; whether absent fields are `null` or omitted |

## `prefs_set`

*"Set/merge it. Partial updates merge by default; `replace: true` overwrites"*
(`README.md:202`).

| Field | Type | Notes |
| --- | --- | --- |
| `likes` | `jsonb` `{ grapes, regions, styles }` | soft; scored at `0.15` (`README.md:67`, `README.md:297`) |
| `dislikes` | same shape | `.grapes` / `.regions` are hard filters (`README.md:287`) |
| `budget_min`, `budget_max` | number | no currency stated |
| `sweetness` | enum (`README.md:87`) | target value |
| `body`, `tannin`, `acidity` | enum (`README.md:88`) | target values |
| `avoid` | `jsonb` | hard filter (`README.md:286`) |
| `notes` | text | nothing reads it |
| `replace` | boolean, default false | `true` overwrites the profile instead of merging (`README.md:202`) |

| | |
| --- | --- |
| Output | not specified. `wine_upsert` returns the row plus `created: bool` and `fields_filled: string[]` (`README.md:166`); nothing says `prefs_set` does anything comparable. |

## Request rules that matter here

- **Merge is the default; `replace: true` is opt-in** (`README.md:202`). This is the
  inverse of the catalogue's rule, where `wine_upsert` fills blanks and needs
  `overwrite: true` to clobber (`README.md:163-165`,
  [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md)). Two
  write tools, two different words for the escape hatch — `replace` and `overwrite` —
  and two different meanings for the default. Worth a divergence entry.
- **Neither tool accepts a `user_id`.** Cross-account access is structurally impossible,
  not a validation rule (`README.md:154-156`, `README.md:336-337`).
- **`wine_recommend` carries `use_prefs`, default `true`** (`README.md:250`). It belongs
  to [[recommendation-engine-api]], but it is the only way to opt out of this feature.

## Response rules that matter here

- The profile is returned to whichever client asked, in full. There is nothing to strip:
  no secrets are stored in `user_prefs`, and tokens are never logged or returned
  ([[security]], `README.md:347`).
- Preference writes are **not** audited. `audit_log` records admin actions only
  (`README.md:346`) — see [[audit-logging]]. Nothing records which client changed a
  profile, which is the one question the cross-client design makes likely.

## Planned

| Thing | State |
| --- | --- |
| An OpenAPI document | Deliberately absent — [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). Do not generate one for these tools. |
| MCP *resources* exposing the cellar as browsable context | Post-MVP (`README.md:422`). Could plausibly expose the profile too; not specified. |
| Custom roles / per-user permission grants | Post-MVP (`README.md:421`). Would change who may read another user's prefs — today, nobody can. |
