---
feature: recommendation-engine
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - README.md:239
  - README.md:363
updated: 2026-08-29
---

# Recommendation engine — validations

There is exactly one trust boundary here: the `wine_recommend` tool input. Every tool is
planned as "one file per tool, zod input schema + handler" (`README.md:363`), so the zod
schema is where these rules will live. Shared type definitions: [[data-types]].

Nothing in the specification states a single validation rule for `wine_recommend` beyond
what the field types imply. Every "Enforced where" below is therefore *planned*, and every
message is unspecified.

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| `occasion` | Free text, optional (`README.md:241`) | planned zod schema | unspecified |
| `food` | Free text, optional (`README.md:242`) | planned zod schema | unspecified |
| `wine_type` | One of `red \| white \| rose \| sparkling \| orange \| dessert \| fortified` (`README.md:86`); optional hard filter (`README.md:243`) | planned zod enum | unspecified |
| `price_max` / `price_min` | Numbers, nullable (`README.md:244-245`) | planned zod schema | unspecified |
| `grapes` | Array of strings, soft preference (`README.md:246`) | planned zod schema | unspecified |
| `region` | Free text (`README.md:247`) | planned zod schema | unspecified |
| `exclude_wine_ids` | Array of wine ids (`README.md:248`) | planned zod schema | unspecified |
| `source` | One of `cellar \| catalog \| both`, default `both` (`README.md:249`) | planned zod enum with default | unspecified |
| `use_prefs` | Boolean, default `true` (`README.md:250`) | planned zod boolean with default | unspecified |
| `limit` | Integer; `5` in the example (`README.md:251`) | planned zod schema | unspecified |
| the caller | Resolved from the bearer token, **never** from tool input (`README.md:336-337`) | auth middleware, structural | `401` before any tool runs |

## Rules that are stated but not as validations

| Rule | Stated at | Note |
| --- | --- | --- |
| No `user_id` argument exists | `README.md:154-156` | Not a validation — an absence in the schema. You cannot recommend against someone else's cellar because there is nowhere to say whose. This is the structural version of the rule and is stronger than any check. |
| `recommend` permission required | `README.md:126` | Checked in the handler before any work (`README.md:135-137`), and the tool is hidden from `tools/list` for a caller without it (`README.md:132`). Two layers, both required — [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md). |

## Client vs server

There is no client. Every rule is server-side, in the Worker, and there is no bypassable
layer — which is the one genuine benefit of having no UI.

| Rule | Client | Server |
| --- | --- | --- |
| Every input rule above | n/a — the "client" is an LLM composing a tool call | ✅ zod schema at the tool boundary (planned) |
| Caller identity | n/a | ✅ from `props`, never input (`README.md:336-337`) |
| Permission | agent sees a filtered `tools/list` (`README.md:132`) — a UX affordance, not a boundary | ✅ re-checked in the handler (`README.md:135-137`) |

The MCP client is an unusually unreliable caller: a model composing arguments will produce
plausible-looking values that were never in the schema — a `wine_type` of `"burgundy"`, a
`limit` of `100`, a `region` invented from the conversation. The schema is the only thing
between that and the engine.

## Not validated

| Input | Why it matters |
| --- | --- |
| `limit` has **no stated maximum.** | `wine_search` caps at 50 (`README.md:171`); `wine_recommend` states only the example value `5` (`README.md:251`). An agent asking for `limit: 10000` would score the whole catalogue and return it over the wire. This is the clearest missing clamp in the feature. |
| `price_min > price_max` | Not stated as mutually constrained. Produces an empty result rather than an error. |
| `region` and `occasion` and `food` are free text | Unbounded strings reaching a query. `region` is a hard filter (`README.md:284`), so it reaches the database; `food` and `occasion` reach the scorer only. Length is unbounded and unspecified. |
| `exclude_wine_ids` length | Unbounded array reaching a filter. |
| `grapes` values | Free strings, not an enum — `grapes` is `text[]` on the wine (`README.md:71`). Case and spelling matching is unspecified, which matters because the same field triggers the request-beats-dislikes override (`README.md:288`): whether `"Malbec"` overrides a dislike of `"malbec"` is undefined. |

That last one is a validation gap with a behavioural consequence, not just a hygiene note.
See [[recommendation-engine-flow]].
