---
adr: 0004
title: The recommendation engine is deterministic and rule-based
status: accepted
date: 2026-08-29
affects:
  - recommendation-engine
supersedes:
superseded_by:
source: business-docs/wiki/shared/mvp-spec.md:318
---

# ADR-0004 — The recommendation engine is deterministic and rule-based

**Decision.** Scoring is hard filters plus a weighted sum of components in `0..1`. No LLM runs inside the engine, and the same input always produces the same output.

## Context

The obvious way to build a wine recommender in 2026 is embeddings, or to ask a model. But the caller here *is* a model: the agent asks `wine_recommend` and then explains the answer to a person. If the engine were also a model, the explanation would be a second guess about a first guess, and there would be nothing to argue with.

## Decision

Two stages — hard filters, then a weighted score across six components (`business-docs/wiki/shared/mvp-spec.md:304-313`). Deterministic. Weights live in one config object so they can be tuned without touching the logic (`business-docs/wiki/shared/mvp-spec.md:321`).

## Consequences

- Recommendations are reproducible, testable, and debuggable: a wrong answer has a component responsible for it.
- Tuning is editing numbers in one place.
- Quality is bounded by the pairing table and the weights. It will not surprise anyone pleasantly.
- No semantic "wines like this one" — that needs embeddings and is explicitly post-MVP (`business-docs/wiki/shared/mvp-spec.md:433`).
- Enables [[ADR-0005]]: every point of score maps to a reason string, which only works because every point of score has a stated cause.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Embeddings + pgvector similarity | Post-MVP. Cannot explain itself, and has nothing to explain from until there is data. |
| Ask an LLM to rank | Non-deterministic, unexplainable, and the caller is already an LLM. |

## Where this is enforced

`src/engine/recommend.ts`, `src/engine/weights.ts` (planned). Cite as `ADR-0004`.
