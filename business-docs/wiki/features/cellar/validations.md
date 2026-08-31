---
feature: cellar
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - business-docs/wiki/shared/mvp-spec.md:350
  - business-docs/wiki/shared/mvp-spec.md:377
updated: 2026-08-29
---

# Cellar — validations

The single most important rule on this page is not a validation at all: **the owner of a cellar item is never an input.** Apart from the `admin:*` tools, no tool takes a `user_id`; handlers read the caller from `props` (`business-docs/wiki/shared/mvp-spec.md:169`, `business-docs/wiki/shared/mvp-spec.md:350`). That is what makes *"you can only touch your own cellar"* structural rather than a check someone can forget to write. See [[security]].

> **Unverified.** Tools are specified as *"one file per tool, zod input schema + handler"* (`business-docs/wiki/shared/mvp-spec.md:377`), but no schema is written down. Every row below marked *(unspecified)* is a rule the specification does not state.

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| caller identity | Not an input. Taken from `props`. | Handler (`business-docs/wiki/shared/mvp-spec.md:350`) | n/a — unrepresentable |
| permission | `cellar_add` / `cellar_update` need `cellar:write`; `cellar_list` needs `cellar:read` | Two layers: `tools/list` visibility **and** a handler re-check (`business-docs/wiki/shared/mvp-spec.md:144`–`151`) | `Permission denied: …` (`business-docs/wiki/shared/mvp-spec.md:153`) |
| `wine_id` | Must identify an existing wine — *or* inline wine fields are supplied instead | *(unspecified)* | — |
| inline wine fields | `name` required; everything else optional (`business-docs/wiki/shared/mvp-spec.md:105`, `business-docs/wiki/shared/mvp-spec.md:175`) | [[wine-catalog-index]] via the upsert | — |
| `quantity` | Presumably a non-negative integer | *(unspecified)* | — |
| `purchase_price` | Number. No currency, no unit, no bound stated | *(unspecified)* | — |
| `purchase_date`, `drink_from`, `drink_until` | Dates. No format, no ordering constraint, no bound on past/future | *(unspecified)* | — |
| `location`, `notes` | Free text. No length limit | *(unspecified)* | — |
| `status` | One of `in_cellar \| drunk \| gifted` (`business-docs/wiki/shared/mvp-spec.md:92`) | *(unspecified — enum stated for the column, not the input)* | — |
| `cellar_list.sort` | One of `drink_until \| purchase_date \| price \| name` (`business-docs/wiki/shared/mvp-spec.md:202`) | *(unspecified)* | — |
| `cellar_list.wine_type` | One of the seven `wine_type` values (`business-docs/wiki/shared/mvp-spec.md:100`) — see [[data-types]] | *(unspecified)* | — |
| `cellar_list.drink_soon` | "within N months" — the unit is months; **no default `N` is stated** (`business-docs/wiki/shared/mvp-spec.md:201`) | *(unspecified)* | — |
| `cellar_list.limit` | Not mentioned for `cellar_list`. `wine_search` clamps to default 10 / max 50 (`business-docs/wiki/shared/mvp-spec.md:185`); no equivalent here | *(unspecified)* | — |

## Client vs server

There is no client to validate on. Every rule is server-side by construction, and an MCP client's own argument checking is an affordance the server must never trust.

| Rule | Client | Server |
| --- | --- | --- |
| Permission for the tool | Advisory only — a permitted-tools list from `tools/list` (`business-docs/wiki/shared/mvp-spec.md:146`) | **Authoritative** — re-checked in every handler; *"this is the security boundary"* (`business-docs/wiki/shared/mvp-spec.md:150`) |
| Caller identity | Cannot be supplied | Resolved from the bearer token (`business-docs/wiki/shared/mvp-spec.md:346`) |
| Everything else | none | *(unspecified)* |

The two-layer rule is explicit that visibility is UX and execution is security, and that *"a tool must never rely on having been hidden"* (`business-docs/wiki/shared/mvp-spec.md:151`) — [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md).

## Not validated

| Input | Risk |
| --- | --- |
| Ownership of the item id passed to `cellar_update` | The one place a caller names a row belonging to a user. Nothing states that the update is scoped by `user_id` from `props`. If it is not, the structural ownership guarantee has a hole exactly here — the highest-value thing to fix when this feature is built. |
| `quantity` lower bound | Driving it below zero is undefined ([[cellar-states]]) |
| `drink_from` vs `drink_until` ordering | An inverted window silently breaks `ready_to_drink` and `drink_soon` |
| `purchase_price` currency | Compared against the engine's `price_max` / `price_min` (`business-docs/wiki/shared/mvp-spec.md:298`) and against `prefs.budget_min/max` with no stated unit |
| Result-set size on `cellar_list` | No limit or clamp specified; a large cellar returns unbounded rows into a model's context |
| Free-text `location` and `notes` | No length bound; both are returned verbatim to a language model |

Recorded in [[divergences]].
