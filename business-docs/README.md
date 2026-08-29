# Wine Cellar MCP business docs

Three formats, one direction of authority. **`wiki/` is the source of truth for business rules.** When it disagrees with anything in `rules/`, the wiki is right and the other format gets regenerated.

| Format | Written by | Read when | Authority |
| --- | --- | --- | --- |
| [`wiki/`](wiki/README.md) | AI, human-reviewed | by default, by humans and agents alike | **source** |
| `rules/<feature>.json` | derived | an agent needs a rule by key, or a closed enum | derived |
| `index.tsv` | derived | an agent is looking for a page, a section, or what links to one | derived |

It is not "JSON first, then wiki". It is **wiki by default; JSON when you need precision.**

Decisions, divergences, and prose live **only** in the wiki and are never duplicated into the derived formats — a rule that exists only in a derived file is invisible to humans and unowned.

## No OpenAPI here, and why

There is no `openapi/` directory. This project's entire HTTP surface is a single `POST /mcp`
carrying MCP JSON-RPC; an OpenAPI document would describe one opaque endpoint and teach
nobody anything. The real contract is the **tool input schemas**, which live in each
feature's `api.md` page and are derived into `rules/<feature>.json`. See [ADR-0002](wiki/decisions/0002-no-openapi-for-an-mcp-surface.md).

## The state of this wiki

**Every page is `status: stub` and every rule is `aspirational`, because no implementation
exists yet.** At the time of writing the repository contains a specification (`README.md`)
and nothing else — the previous contents were an unrelated project, removed in
`chore: reset repo to the Wine Cellar MCP project`.

So `code_refs` on these pages point at `README.md` line ranges, not at source files. That is
deliberate and it is the honest trace: the authority for every claim here is a written
intent, not a running program. As code lands, each feature gets promoted with
`/business-wiki:feature <slug>`, its refs move to real files, and its rules move from
`aspirational` to `enforced`. The count of `status: stub` warnings from
`/business-wiki:check` is, for now, a build-progress meter.

Read these pages as **"what we decided to build"**, never as "what it does".

## Layout

```
README.md    this file — the authority story
wiki/        the source: features, decisions (ADRs), shared concerns
rules/       derived: one <feature>.json per feature, plus _schema.json
index.tsv    derived: the page index and link graph
```

## How this is maintained

The AI authors; the human approves the diff and points at gaps.

| Loop | Trigger | Effect |
| --- | --- | --- |
| Author / refresh a feature | code changed, or a gap was found | `/business-wiki:feature <slug>` |
| Record a decision | a choice closed off an alternative | `/business-wiki:adr` |
| Derive | the wiki changed | `/business-wiki:derive` |
| Detect drift | before a release, or nightly | `business-wiki:source-drift-watcher` |
| Harvest | end of a track | `/business-wiki:harvest` |
| Validate | every edit (hook) + CI | `/business-wiki:check` |

Rules for contributors, human or agent:

1. Every claim carries a `file:line`. If it cannot be traced, mark it unverified or leave the page `stub`.
2. Never hand-edit a file under `rules/`. Change the wiki and re-derive.
3. A rule found in code but not in the wiki is a **wiki** gap — fix it there, not in the JSON.
4. Document what is *not* real: stubs, no-ops, placeholder data, planned endpoints. Right now, that is everything.
5. Record contradictions in `wiki/shared/divergences.md` rather than quietly picking a side.
