---
feature: recommendation-engine
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:253
  - business-docs/wiki/shared/mvp-spec.md:377
updated: 2026-08-29
---

# Recommendation engine — validations

There is exactly one trust boundary here: the `wine_recommend` tool input. Every tool is
planned as "one file per tool, zod input schema + handler" (`business-docs/wiki/shared/mvp-spec.md:377`), so the zod
schema is where these rules will live. Shared type definitions: [[data-types]].

Nothing in the specification states a single validation rule for `wine_recommend` beyond
what the field types imply. Every "Enforced where" below is therefore *planned*, and every
message is unspecified.

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| `occasion` | Free text, optional (`business-docs/wiki/shared/mvp-spec.md:255`) | planned zod schema | unspecified |
| `food` | Free text, optional (`business-docs/wiki/shared/mvp-spec.md:256`) | planned zod schema | unspecified |
| `wine_type` | One of `red \| white \| rose \| sparkling \| orange \| dessert \| fortified` (`business-docs/wiki/shared/mvp-spec.md:100`); optional hard filter (`business-docs/wiki/shared/mvp-spec.md:257`) | planned zod enum | unspecified |
| `price_max` / `price_min` | Numbers, nullable (`business-docs/wiki/shared/mvp-spec.md:258-259`) | planned zod schema | unspecified |
| `grapes` | Array of strings, soft preference (`business-docs/wiki/shared/mvp-spec.md:260`) | planned zod schema | unspecified |
| `region` | Free text (`business-docs/wiki/shared/mvp-spec.md:261`) | planned zod schema | unspecified |
| `exclude_wine_ids` | Array of wine ids (`business-docs/wiki/shared/mvp-spec.md:262`) | planned zod schema | unspecified |
| `source` | One of `cellar \| catalog \| both`, default `both` (`business-docs/wiki/shared/mvp-spec.md:263`) | planned zod enum with default | unspecified |
| `use_prefs` | Boolean, default `true` (`business-docs/wiki/shared/mvp-spec.md:264`) | planned zod boolean with default | unspecified |
| `limit` | Integer; `5` in the example (`business-docs/wiki/shared/mvp-spec.md:265`) | planned zod schema | unspecified |
| the caller | Resolved from the bearer token, **never** from tool input (`business-docs/wiki/shared/mvp-spec.md:350-351`) | auth middleware, structural | `401` before any tool runs |

## Rules that are stated but not as validations

| Rule | Stated at | Note |
| --- | --- | --- |
| No `user_id` argument exists | `business-docs/wiki/shared/mvp-spec.md:168-170` | Not a validation — an absence in the schema. You cannot recommend against someone else's cellar because there is nowhere to say whose. This is the structural version of the rule and is stronger than any check. |
| `recommend` permission required | `business-docs/wiki/shared/mvp-spec.md:140` | Checked in the handler before any work (`business-docs/wiki/shared/mvp-spec.md:149-151`), and the tool is hidden from `tools/list` for a caller without it (`business-docs/wiki/shared/mvp-spec.md:146`). Two layers, both required — [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md). |

## Client vs server

There is no client. Every rule is server-side, in the Worker, and there is no bypassable
layer — which is the one genuine benefit of having no UI.

| Rule | Client | Server |
| --- | --- | --- |
| Every input rule above | n/a — the "client" is an LLM composing a tool call | ✅ zod schema at the tool boundary (planned) |
| Caller identity | n/a | ✅ from `props`, never input (`business-docs/wiki/shared/mvp-spec.md:350-351`) |
| Permission | agent sees a filtered `tools/list` (`business-docs/wiki/shared/mvp-spec.md:146`) — a UX affordance, not a boundary | ✅ re-checked in the handler (`business-docs/wiki/shared/mvp-spec.md:149-151`) |

The MCP client is an unusually unreliable caller: a model composing arguments will produce
plausible-looking values that were never in the schema — a `wine_type` of `"burgundy"`, a
`limit` of `100`, a `region` invented from the conversation. The schema is the only thing
between that and the engine.

## Not validated

| Input | Why it matters |
| --- | --- |
| `limit` has **no stated maximum.** | `wine_search` caps at 50 (`business-docs/wiki/shared/mvp-spec.md:185`); `wine_recommend` states only the example value `5` (`business-docs/wiki/shared/mvp-spec.md:265`). An agent asking for `limit: 10000` would score the whole catalogue and return it over the wire. This is the clearest missing clamp in the feature. |
| `price_min > price_max` | Not stated as mutually constrained. Produces an empty result rather than an error. |
| `region` and `occasion` and `food` are free text | Unbounded strings reaching a query. `region` is a hard filter (`business-docs/wiki/shared/mvp-spec.md:298`), so it reaches the database; `food` and `occasion` reach the scorer only. Length is unbounded and unspecified. |
| `exclude_wine_ids` length | Unbounded array reaching a filter. |
| `grapes` values | Free strings, not an enum — `grapes` is `text[]` on the wine (`business-docs/wiki/shared/mvp-spec.md:85`). Case and spelling matching is unspecified, which matters because the same field triggers the request-beats-dislikes override (`business-docs/wiki/shared/mvp-spec.md:302`): whether `"Malbec"` overrides a dislike of `"malbec"` is undefined. |

That last one is a validation gap with a behavioural consequence, not just a hygiene note.
See [[recommendation-engine-flow]].
