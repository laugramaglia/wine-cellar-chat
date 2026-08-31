---
feature: preferences
page: api
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:212
  - business-docs/wiki/shared/mvp-spec.md:138
updated: 2026-08-29
---

# Preferences — API

**There is no OpenAPI document, by decision** —
[ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). The surface is not
REST: it is MCP over Streamable HTTP at a single endpoint, `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`), where
every operation is a JSON-RPC tool call. There is exactly one HTTP path and it has no
per-tool schema to describe. Tool contracts therefore live **here**, in the wiki, and
nowhere else. Protocol-level detail: [[mcp-protocol]].

> **Unverified.** No handler, no zod schema and no tool registration exists in this
> repository. Both tools below are described in one sentence each in the specification.

| Tool | Permission | Roles | Planned handler | Called from |
| --- | --- | --- | --- | --- |
| `prefs_get` | `prefs:read` | `admin`, `member`, `guest` | `src/tools/` (`business-docs/wiki/shared/mvp-spec.md:377`) | any MCP client; the engine reads the row directly, not through the tool |
| `prefs_set` | `prefs:write` | `admin`, `member` | `src/tools/` (`business-docs/wiki/shared/mvp-spec.md:377`) | any MCP client |

Sources: `business-docs/wiki/shared/mvp-spec.md:138-139` (permissions), `business-docs/wiki/shared/mvp-spec.md:214-217` (tools).

## `prefs_get`

*"The caller's stored palate profile"* (`business-docs/wiki/shared/mvp-spec.md:214`) — the entire specification of
this tool.

| | |
| --- | --- |
| Input | none specified. There is no `user_id` parameter: the user comes from the bearer token via `props` (`business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:350-351`) |
| Output | the `user_prefs` row: `likes`, `dislikes`, `budget_min`, `budget_max`, `sweetness`, `body`, `tannin`, `acidity`, `avoid`, `notes`, `updated_at` (`business-docs/wiki/shared/mvp-spec.md:79-80`) |
| Undefined | the response when the user has **no row**; whether `updated_at` is returned; whether absent fields are `null` or omitted |

## `prefs_set`

*"Set/merge it. Partial updates merge by default; `replace: true` overwrites"*
(`business-docs/wiki/shared/mvp-spec.md:216`).

| Field | Type | Notes |
| --- | --- | --- |
| `likes` | `jsonb` `{ grapes, regions, styles }` | soft; scored at `0.15` (`business-docs/wiki/shared/mvp-spec.md:81`, `business-docs/wiki/shared/mvp-spec.md:311`) |
| `dislikes` | same shape | `.grapes` / `.regions` are hard filters (`business-docs/wiki/shared/mvp-spec.md:301`) |
| `budget_min`, `budget_max` | number | no currency stated |
| `sweetness` | enum (`business-docs/wiki/shared/mvp-spec.md:101`) | target value |
| `body`, `tannin`, `acidity` | enum (`business-docs/wiki/shared/mvp-spec.md:102`) | target values |
| `avoid` | `jsonb` | hard filter (`business-docs/wiki/shared/mvp-spec.md:300`) |
| `notes` | text | nothing reads it |
| `replace` | boolean, default false | `true` overwrites the profile instead of merging (`business-docs/wiki/shared/mvp-spec.md:216`) |

| | |
| --- | --- |
| Output | not specified. `wine_upsert` returns the row plus `created: bool` and `fields_filled: string[]` (`business-docs/wiki/shared/mvp-spec.md:180`); nothing says `prefs_set` does anything comparable. |

## Request rules that matter here

- **Merge is the default; `replace: true` is opt-in** (`business-docs/wiki/shared/mvp-spec.md:216`). This is the
  inverse of the catalogue's rule, where `wine_upsert` fills blanks and needs
  `overwrite: true` to clobber (`business-docs/wiki/shared/mvp-spec.md:177-179`,
  [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md)). Two
  write tools, two different words for the escape hatch — `replace` and `overwrite` —
  and two different meanings for the default. Worth a divergence entry.
- **Neither tool accepts a `user_id`.** Cross-account access is structurally impossible,
  not a validation rule (`business-docs/wiki/shared/mvp-spec.md:168-170`, `business-docs/wiki/shared/mvp-spec.md:350-351`).
- **`wine_recommend` carries `use_prefs`, default `true`** (`business-docs/wiki/shared/mvp-spec.md:264`). It belongs
  to [[recommendation-engine-api]], but it is the only way to opt out of this feature.

## Response rules that matter here

- The profile is returned to whichever client asked, in full. There is nothing to strip:
  no secrets are stored in `user_prefs`, and tokens are never logged or returned
  ([[security]], `business-docs/wiki/shared/mvp-spec.md:361`).
- Preference writes are **not** audited. `audit_log` records admin actions only
  (`business-docs/wiki/shared/mvp-spec.md:360`) — see [[audit-logging]]. Nothing records which client changed a
  profile, which is the one question the cross-client design makes likely.

## Planned

| Thing | State |
| --- | --- |
| An OpenAPI document | Deliberately absent — [ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). Do not generate one for these tools. |
| MCP *resources* exposing the cellar as browsable context | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:436`). Could plausibly expose the profile too; not specified. |
| Custom roles / per-user permission grants | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:435`). Would change who may read another user's prefs — today, nobody can. |
