---
feature: recommendation-engine
page: api
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:251
  - business-docs/wiki/shared/mvp-spec.md:269
updated: 2026-08-29
---

# Recommendation engine — API

**There is no OpenAPI document, and there will not be one** —
[ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). The surface is a single
MCP endpoint, Streamable HTTP at `/mcp` (`business-docs/wiki/shared/mvp-spec.md:39`), and MCP describes its own tools
through `tools/list`. An OpenAPI file describing one POST endpoint would document the
transport and hide the contract. Protocol details: [[mcp-protocol]].

So this page carries the tool contract itself rather than pointing at a spec file.

| Tool | Permission | Handler | Called from |
| --- | --- | --- | --- |
| `wine_recommend` | `recommend` — held by `admin`, `member` and `guest` (`business-docs/wiki/shared/mvp-spec.md:140`) | planned: `src/tools/wine_recommend.ts`, `src/engine/recommend.ts` (`business-docs/wiki/shared/mvp-spec.md:377-380`) | any connected MCP client |

## Input

Given at `business-docs/wiki/shared/mvp-spec.md:253-266`. **The specification's block is JSONC with comments**, and
those comments carry two of the contract's defaults — they are normative, not annotations.

| Field | Type | Required | Default | Role |
| --- | --- | --- | --- | --- |
| `occasion` | string | no | — | free text, scoring context (`business-docs/wiki/shared/mvp-spec.md:255`) |
| `food` | string | no | — | free text; primary input to food pairing, weight 0.30 (`business-docs/wiki/shared/mvp-spec.md:256`) |
| `wine_type` | enum (`business-docs/wiki/shared/mvp-spec.md:100`) | no | — | **hard filter** (`business-docs/wiki/shared/mvp-spec.md:257`) |
| `price_max` | number \| null | no | `null` | **hard filter** (`business-docs/wiki/shared/mvp-spec.md:258`) |
| `price_min` | number \| null | no | `null` | **hard filter** (`business-docs/wiki/shared/mvp-spec.md:259`) |
| `grapes` | string[] | no | — | **soft** preference (`business-docs/wiki/shared/mvp-spec.md:260`), and overrides a matching `prefs.dislikes` entry (`business-docs/wiki/shared/mvp-spec.md:302`) |
| `region` | string | no | — | **hard filter** (`business-docs/wiki/shared/mvp-spec.md:261`) |
| `exclude_wine_ids` | id[] | no | `[]` | **hard filter** (`business-docs/wiki/shared/mvp-spec.md:262`) |
| `source` | `cellar` \| `catalog` \| `both` | no | **`"both"`** (`business-docs/wiki/shared/mvp-spec.md:263`) | candidate-set selector |
| `use_prefs` | bool | no | **`true`** (`business-docs/wiki/shared/mvp-spec.md:264`) | apply stored `user_prefs` |
| `limit` | int | no | `5` shown in the example (`business-docs/wiki/shared/mvp-spec.md:265`) | result cap; **no maximum stated** |

There is no `user_id`. Apart from the `admin:*` tools, no tool takes one — you cannot read
another account's cellar whatever your role (`business-docs/wiki/shared/mvp-spec.md:168-170`).

## Result

A ranked list; each entry as at `business-docs/wiki/shared/mvp-spec.md:271-285`.

| Field | Type | Meaning |
| --- | --- | --- |
| `wine` | object | the full `wines` row (`business-docs/wiki/shared/mvp-spec.md:273`). Owned by [[wine-catalog-index]]. |
| `score` | number `0..1` | weighted sum over the **present** components, renormalized (`business-docs/wiki/shared/mvp-spec.md:274`, `business-docs/wiki/shared/mvp-spec.md:304`) |
| `in_cellar` | bool | the caller owns bottles (`business-docs/wiki/shared/mvp-spec.md:274-275`). Owned by [[cellar-index]]. |
| `quantity` | int | bottles held by the caller (`business-docs/wiki/shared/mvp-spec.md:275`) |
| `reasons` | string[] | one per contributing component; never empty (`business-docs/wiki/shared/mvp-spec.md:277-282`, `business-docs/wiki/shared/mvp-spec.md:421`) |
| `penalties` | string[] | stated downward pulls; may be empty (`business-docs/wiki/shared/mvp-spec.md:283`) |

## Request rules that matter here

| Rule | Detail |
| --- | --- |
| `source` default | `"both"` (`business-docs/wiki/shared/mvp-spec.md:263`). Omitting it searches the shared catalogue as well as the cellar, so a user asking *"what should I open tonight"* gets bottles they do not own unless the agent sets `source: "cellar"`. The agent choosing the right value is load-bearing and unenforceable. |
| `use_prefs` default | `true` (`business-docs/wiki/shared/mvp-spec.md:264`). Preferences apply by default, including the `avoid` and `dislikes` **hard filters** (`business-docs/wiki/shared/mvp-spec.md:300-301`) — so the default silently removes candidates. |
| Hard vs soft | `wine_type`, `price_min/max`, `region`, `exclude_wine_ids` are hard filters (`business-docs/wiki/shared/mvp-spec.md:298`). `grapes` is soft (`business-docs/wiki/shared/mvp-spec.md:260`) **except** as a dislikes override (`business-docs/wiki/shared/mvp-spec.md:302`). One field, two behaviours. |
| `limit` | No clamp is specified. See [[recommendation-engine-validations]]. |

## Response rules that matter here

| Rule | Detail |
| --- | --- |
| `score` is not comparable across entries | It is renormalized over whichever components were available per wine ([ADR-0006](../../decisions/0006-missing-data-never-penalizes.md)). Two entries with `0.82` may rest on two components and on six. **Nothing in the response says which**, and the field name gives no hint. This is the most misleading field in the contract. |
| Exclusions are invisible | The response says why a wine is present, never why one is absent. |
| Nothing is stripped for privacy | Every field is the caller's own data or the shared catalogue. Cross-user leakage would require a `user_id` argument, which does not exist. See [[security]]. |
| No pagination, no cursor, no total | `limit` truncates; the caller is not told how many were scored. |
| Ordering | By score, descending. Tie-breaking unspecified. |

## Planned

| Not implemented | Note |
| --- | --- |
| `wine_recommend` itself | No handler exists. Planned at `src/tools/` + `src/engine/recommend.ts` (`business-docs/wiki/shared/mvp-spec.md:377-380`). |
| MCP *resources* exposing the cellar as browsable context | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:436`). |
| MCP *prompts* for "sommelier mode" | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:437`). |
| `enrich_wine` against an external API | Post-MVP (`business-docs/wiki/shared/mvp-spec.md:438`). Would change what the engine has to score on. |

Listed here so that no derived format invents them.
