---
adr: 0001
title: The wiki is the source of truth; other formats are derived
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
  - cellar
  - reviews
  - preferences
  - recommendation-engine
  - authentication
  - authorization
  - user-administration
  - token-administration
supersedes:
superseded_by:
source: human decision
---

# ADR-0001 — The wiki is the source of truth; other formats are derived

**Decision.** `business-docs/wiki/` is authoritative for every business rule in this project. `rules/*.json` and `index.tsv` are generated from it and are never hand-edited.

## Context

A business rule tends to end up in three places at once — prose in a README, a constant in code, and a schema somewhere — and when they disagree there is no stated winner, so each reader picks the one nearest to hand. This project starts with that risk maximised: a 424-line specification and no code, which guarantees drift the moment the first handler is written.

Without a declared direction of authority, "the docs are out of date" becomes a permanent condition nobody owns.

## Decision

The wiki is the source. Derived formats are regenerated, never edited. A rule discovered in code but absent from the wiki is a **wiki gap**, fixed in the wiki and then re-derived — not patched into the JSON where no human will see it.

Decisions, divergences, and prose live only in the wiki. They are never duplicated into a derived format, because a rule that exists only in a generated file is invisible and unowned.

## Consequences

- One place to change a rule, and one command to propagate it.
- Agents can read `rules/<feature>.json` for precision without the wiki and the JSON disagreeing.
- Editing a derived file is now a mistake with a name, catchable by `/business-wiki:check`.
- It costs a derive step. A wiki edit that is not followed by `/business-wiki:derive` leaves the JSON stale — which the drift watcher reports, but only if someone runs it.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| JSON first, wiki generated from it | Rules would be authored in a format humans do not read for pleasure, so the reasoning behind each rule — the part that ages worst — would have nowhere to live. |
| Code as the only source | Answers "what does it do", never "what was decided and why". Cannot express an aspirational or a deliberately-unimplemented rule, which is most of this project today. |
| No system; keep the README | Precisely the failure this ADR exists to prevent. |

## Where this is enforced

`business-docs/README.md` states the authority order. `/business-wiki:check` validates it.
