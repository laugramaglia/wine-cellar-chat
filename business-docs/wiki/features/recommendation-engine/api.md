---
feature: recommendation-engine
page: api
status: stub
source_of_truth: wiki
code_refs:
  - README.md:237
  - README.md:255
updated: 2026-08-29
---

# Recommendation engine — API

**There is no OpenAPI document, and there will not be one** —
[ADR-0002](../../decisions/0002-no-openapi-for-an-mcp-surface.md). The surface is a single
MCP endpoint, Streamable HTTP at `/mcp` (`README.md:25`), and MCP describes its own tools
through `tools/list`. An OpenAPI file describing one POST endpoint would document the
transport and hide the contract. Protocol details: [[mcp-protocol]].

So this page carries the tool contract itself rather than pointing at a spec file.

| Tool | Permission | Handler | Called from |
| --- | --- | --- | --- |
| `wine_recommend` | `recommend` — held by `admin`, `member` and `guest` (`README.md:126`) | planned: `src/tools/wine_recommend.ts`, `src/engine/recommend.ts` (`README.md:363-366`) | any connected MCP client |

## Input

Given at `README.md:239-252`. **The specification's block is JSONC with comments**, and
those comments carry two of the contract's defaults — they are normative, not annotations.

| Field | Type | Required | Default | Role |
| --- | --- | --- | --- | --- |
| `occasion` | string | no | — | free text, scoring context (`README.md:241`) |
| `food` | string | no | — | free text; primary input to food pairing, weight 0.30 (`README.md:242`) |
| `wine_type` | enum (`README.md:86`) | no | — | **hard filter** (`README.md:243`) |
| `price_max` | number \| null | no | `null` | **hard filter** (`README.md:244`) |
| `price_min` | number \| null | no | `null` | **hard filter** (`README.md:245`) |
| `grapes` | string[] | no | — | **soft** preference (`README.md:246`), and overrides a matching `prefs.dislikes` entry (`README.md:288`) |
| `region` | string | no | — | **hard filter** (`README.md:247`) |
| `exclude_wine_ids` | id[] | no | `[]` | **hard filter** (`README.md:248`) |
| `source` | `cellar` \| `catalog` \| `both` | no | **`"both"`** (`README.md:249`) | candidate-set selector |
| `use_prefs` | bool | no | **`true`** (`README.md:250`) | apply stored `user_prefs` |
| `limit` | int | no | `5` shown in the example (`README.md:251`) | result cap; **no maximum stated** |

There is no `user_id`. Apart from the `admin:*` tools, no tool takes one — you cannot read
another account's cellar whatever your role (`README.md:154-156`).

## Result

A ranked list; each entry as at `README.md:257-271`.

| Field | Type | Meaning |
| --- | --- | --- |
| `wine` | object | the full `wines` row (`README.md:259`). Owned by [[wine-catalog-index]]. |
| `score` | number `0..1` | weighted sum over the **present** components, renormalized (`README.md:260`, `README.md:290`) |
| `in_cellar` | bool | the caller owns bottles (`README.md:260-261`). Owned by [[cellar-index]]. |
| `quantity` | int | bottles held by the caller (`README.md:261`) |
| `reasons` | string[] | one per contributing component; never empty (`README.md:263-268`, `README.md:407`) |
| `penalties` | string[] | stated downward pulls; may be empty (`README.md:269`) |

## Request rules that matter here

| Rule | Detail |
| --- | --- |
| `source` default | `"both"` (`README.md:249`). Omitting it searches the shared catalogue as well as the cellar, so a user asking *"what should I open tonight"* gets bottles they do not own unless the agent sets `source: "cellar"`. The agent choosing the right value is load-bearing and unenforceable. |
| `use_prefs` default | `true` (`README.md:250`). Preferences apply by default, including the `avoid` and `dislikes` **hard filters** (`README.md:286-287`) — so the default silently removes candidates. |
| Hard vs soft | `wine_type`, `price_min/max`, `region`, `exclude_wine_ids` are hard filters (`README.md:284`). `grapes` is soft (`README.md:246`) **except** as a dislikes override (`README.md:288`). One field, two behaviours. |
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
| `wine_recommend` itself | No handler exists. Planned at `src/tools/` + `src/engine/recommend.ts` (`README.md:363-366`). |
| MCP *resources* exposing the cellar as browsable context | Post-MVP (`README.md:422`). |
| MCP *prompts* for "sommelier mode" | Post-MVP (`README.md:423`). |
| `enrich_wine` against an external API | Post-MVP (`README.md:424`). Would change what the engine has to score on. |

Listed here so that no derived format invents them.
