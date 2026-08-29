---
adr: 0005
title: Every point of score maps to a reason string
status: accepted
date: 2026-08-29
affects:
  - recommendation-engine
supersedes:
superseded_by:
source: README.md:273
---

# ADR-0005 — Every point of score maps to a reason string

**Decision.** `reasons` is part of the contract, not decoration. If a scoring component cannot be explained in a sentence, it is not scored.

## Context

An agent that says "try the Malbec" is guessing as far as the user can tell. An agent that says "Malbec matches a grape you rate highly — avg 92 over 4 reviews, and its window closes in 5 months" is making a claim the user can check and disagree with.

The engine is rule-based **precisely so** this is possible (`README.md:273`).

## Decision

Every result carries `reasons: string[]` and `penalties: string[]`. Every contributing component produces at least one. A component that cannot produce one is removed from the engine rather than scored silently.

The definition of done requires every recommendation to carry at least one non-empty `reasons` entry (`README.md:407`).

## Consequences

- The user can argue with the engine, which is the stated point of the whole thing.
- Adding a scoring component now costs a sentence of copy, which is a healthy tax.
- Reason strings become user-visible copy that asserts facts — `avg 92 over 4 reviews` must be true, so each is a claim the tests have to hold to.
- A silent tiebreak is forbidden. Any ordering influence must be nameable.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Return the score only, let the agent invent the explanation | The agent would confabulate a plausible reason for a number it cannot see inside. Worse than no explanation. |
| Reasons as an optional debug field | Optional explanations do not get maintained, and the agent could not rely on them. |

## Where this is enforced

`src/engine/recommend.ts` (planned). Cite as `ADR-0005`.
