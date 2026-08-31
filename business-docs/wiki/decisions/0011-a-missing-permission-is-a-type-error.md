---
adr: 0011
title: A tool without a declared permission is a compile error
status: accepted
date: 2026-08-29
affects:
  - authorization
supersedes:
superseded_by:
source: business-docs/wiki/shared/mvp-spec.md:161
---

# ADR-0011 — A tool without a declared permission is a compile error

**Decision.** The tool→permission map is one exhaustive `TOOL_PERMISSIONS` record in code. Adding a tool without deciding its permission fails to compile.

## Context

[[ADR-0010]] requires every handler to check a permission. The predictable way that decays is a new tool added in a hurry with no check — which is not a visible bug, because the tool works. It works for everyone.

An unauthenticated tool is silent by nature: nothing fails, nothing logs, and it is found by an audit or by an incident.

## Decision

One record keyed by the tool-name union, so the type system requires an entry for every tool. Not a lookup with a default, not a decorator that can be omitted.

The definition of done states it as a test: every tool in `TOOL_PERMISSIONS` maps to a permission — a missing entry fails to compile (`business-docs/wiki/shared/mvp-spec.md:426`).

## Consequences

- The dangerous omission becomes impossible rather than merely discouraged.
- Deciding the permission is forced to the moment the tool is created, when the author knows the answer.
- The tool-name union must be the same type the registration uses, or the guarantee is cosmetic.
- A `Permission` added without assigning it to a role is still possible; this ADR closes the tool side only.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Runtime check with a deny-by-default fallback | Safe, but the failure is at call time in production rather than at build time. |
| Permission as a field on each tool module | Omittable. Nothing forces it to exist. |
| A lint rule | Enforcement that lives outside the type system and can be skipped. |

## Where this is enforced

`src/permissions.ts` (planned). Cite as `ADR-0011`.
