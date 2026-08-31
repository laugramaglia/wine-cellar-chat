---
adr: 0014
title: Repurpose this repository rather than start a new one
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
supersedes:
superseded_by:
source: human decision
---

# ADR-0014 — Repurpose this repository rather than start a new one

**Decision.** The Wine Cellar MCP project is built in the existing `wine-cellar-chat` repository. The previous Go chat/telegram microservice stack was deleted in full in `chore: reset repo to the Wine Cellar MCP project`, and its history is retained but disowned.

## Context

This repository held an unrelated project: a Go microservice stack with chat and telegram services, RabbitMQ handlers, a KrakenD gateway, and Postgres migrations. All of it was deleted from the working tree, and the `.gitignore` had already been retargeted at TypeScript and Cloudflare Workers before this decision was recorded — the intent was established, just uncommitted.

## Decision

Keep the repository and its remote; wipe the contents. Record the discontinuity here so nobody reads the old history as context.

## Consequences

- The remote, any existing clones, and the repository URL keep working.
- **Git history before the reset commit describes a different program.** Blame, bisect, and archaeology across that boundary are meaningless. This is recorded in [[divergences]].
- The directory is still named `wine-cellar-chat`, which now misleads — the project is not a chat application. Renaming is unresolved.
- A tracked `.env` and a committed `main` binary existed in the old tree and are now removed. Anything secret in that `.env` remains in git history and should be treated as compromised.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A new repository | Loses the remote and the existing name; the old history has no value worth preserving separately either way. |
| `git checkout --orphan` for a clean root | Cleaner history, but rewrites what collaborators may have pulled, for a cosmetic gain. |

## Where this is enforced

The reset commit itself. See [[divergences]].
