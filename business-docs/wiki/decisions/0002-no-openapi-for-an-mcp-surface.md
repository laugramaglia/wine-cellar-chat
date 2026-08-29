---
adr: 0002
title: No OpenAPI document for an MCP surface
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
  - cellar
  - reviews
  - preferences
  - recommendation-engine
  - user-administration
  - token-administration
supersedes:
superseded_by:
source: human decision
---

# ADR-0002 — No OpenAPI document for an MCP surface

**Decision.** This project maintains no OpenAPI document. The tool input schemas, described in each feature's `api.md` and derived into `rules/<feature>.json`, are the contract.

## Context

The business-wiki system derives an OpenAPI document by default. This project's entire HTTP surface is a single `POST /mcp` carrying MCP JSON-RPC (`README.md:22`). Every tool call — `wine_upsert`, `token_revoke`, all of them — is one request to that one path.

## Decision

Skip `openapi/` entirely. Document the contract where it actually lives: per-tool input and output schemas on each feature's `api.md` page.

## Consequences

- No spec describing a single opaque endpoint, which would satisfy the validator and inform nobody.
- The per-tool schemas become the thing that must stay accurate, and they are what an implementer actually reads.
- `check-openapi.sh` has nothing to check. That is intended, not a gap.
- If an ordinary REST surface is ever added — a health endpoint, a webhook — this ADR must be revisited rather than quietly worked around.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Describe `POST /mcp` with a oneOf over every tool payload | Technically expressible, unreadable in practice, and duplicates the zod schemas it would be generated from. |
| Emit an OpenAPI document per tool, as pseudo-paths | Invents endpoints that do not exist. The wiki's first rule is not to document things that are not real. |

## Where this is enforced

`business-docs/README.md` records the absence and why. `CLAUDE_PLUGIN_OPTION_OPENAPI_PATH` is left unset.
