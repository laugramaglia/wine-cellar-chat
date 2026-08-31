# Wine Cellar MCP wiki

The source of truth for this project's business rules. How this relates to the derived formats, and how the whole thing is maintained, is one level up: [`../README.md`](../README.md).

> **Nothing here is implemented yet.** Every page is `status: stub`, every rule is
> `aspirational`, and `code_refs` cite [[mvp-spec]] — the archived specification — because there is
> no source code in this repository. Read this as intent, not as behaviour.

## Layout

```
README.md          this file
decisions/         ADRs — NNNN-slug.md, citable from code as ADR-NNNN
features/<x>/      index, flow, screens, states, errors, copy, validations,
                   api, decisions, related
shared/            glossary, data types, error codes, divergences, the archived
                   MVP specification, and the cross-cutting concerns this project has
shared/templates/  the page templates, for humans
```

## Features

| Feature | Owns | Status |
| --- | --- | --- |
| [[wine-catalog-index]] | The shared bottling catalogue and the upsert merge rule | stub |
| [[cellar-index]] | Which bottles a user owns, in what quantity, drinkable when | stub |
| [[reviews-index]] | Tasting records and ratings, and their feedback into scoring | stub |
| [[preferences-index]] | The palate profile that follows a user across MCP clients | stub |
| [[recommendation-engine-index]] | Hard filters, weighted scoring, and the `reasons` contract | stub |
| [[authentication-index]] | Bearer tokens, hashing, and the per-request 401 flow | stub |
| [[authorization-index]] | Roles, permissions, and two-layer enforcement | stub |
| [[user-administration-index]] | Account lifecycle and the last-admin guards | stub |
| [[token-administration-index]] | Issuing, scoping, and revoking API keys | stub |

## Start here

- New to the project? [[glossary]], then the feature you are about to change.
- About to change a rule? Find it in the feature's pages, change it **here** first, then `/business-wiki:derive`.
- Something looks wrong? [[divergences]] — it may already be a known, accepted contradiction.
- Need a rule by key instead of by page? `../rules/<feature>.json`, regenerated from these pages.
- Writing a tool handler? [[mcp-protocol]] first — it governs naming, errors, and tool visibility for every feature.
- Touching auth? [[security]] holds the rules that are not any one feature's property.
- Chasing a `code_refs` citation? It points into [[mvp-spec]] — the original `README.md`, archived here verbatim.

## What belongs here

Every claim carries a `file:line`. A rule that cannot be traced to code, a migration, a test, or an explicit human decision is marked unverified or left `stub` — never smoothed over with plausible prose. Documenting an absence (a stub, a no-op, a planned-but-absent endpoint) is as valuable as documenting a behaviour.
