---
adr: 0010
title: Permission enforcement has two layers, and only one is the boundary
status: accepted
date: 2026-08-29
affects:
  - authorization
supersedes:
superseded_by:
source: README.md:130
---

# ADR-0010 — Permission enforcement has two layers, and only one is the boundary

**Decision.** `tools/list` is filtered per caller *and* every handler re-checks its permission. The filtering is a UX affordance; the handler check is the security boundary. A tool must never rely on having been hidden.

## Context

The caller is a language model. Two different failure modes matter:

A model that can see `user_create` in its tool list will eventually try it, fail, and possibly retry — burning a conversation on a wall. Hiding the tool prevents that, and prevents the model telling the user about a capability they do not have.

But hiding is not security. An MCP client can call any tool name it likes regardless of what `tools/list` returned.

## Decision

Do both, and be explicit about which is which (`README.md:130-137`). Filtering serves the model; the handler check serves the system.

## Consequences

- Members' clients never surface admin tools, so the model neither tries them nor hallucinates them.
- Every handler carries a check even though it "cannot" be reached without one — deliberate redundancy.
- Two places to get a permission wrong. [[ADR-0011]] closes that by making the map a single table.
- The definition of done tests both independently: Fabian's token does not *see* `user_create` (`README.md:410`), and calling it anyway is *rejected* (`README.md:411`).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Filter only | Not a boundary at all. Any client can call an unlisted tool. |
| Check only | Works, but the model sees tools it can never use and wastes turns discovering that. |

## Where this is enforced

`src/mcp.ts` (list filtering) and every handler in `src/tools/` (execution). Cite as `ADR-0010`. See [[security]].
