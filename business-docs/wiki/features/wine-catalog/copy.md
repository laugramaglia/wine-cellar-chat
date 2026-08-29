---
feature: wine-catalog
page: copy
status: stub
source_of_truth: wiki
code_refs:
  - README.md:139
  - README.md:166
updated: 2026-08-29
---

# Wine catalogue — copy

**This page is thin, and that is correct.** There is no UI (`README.md:39`), so there are no labels, no buttons, and no localized strings. What reaches a human is whatever their agent writes, and the agent writes it from **field names and values in the tool result**. The result schema is therefore this feature's entire copy surface.

| Key | Source text | Placeholders | Where it appears |
| --- | --- | --- | --- |
| permission denial | `Permission denied: '<tool>' requires '<permission>'; your role is '<role>'.` | tool, permission, role | Any catalogue tool call the caller may not make (`README.md:139`) |

That is the only literal user-facing string in the specification.

## Field names as copy

These names are what an agent paraphrases to the user. Renaming one changes what users are told, so they are a contract, not an implementation detail.

| Field | What an agent will say | Where |
| --- | --- | --- |
| `created` | "I added a new wine" vs. "I updated the one you already had" | `README.md:166` |
| `fields_filled` | "I filled in the region and the grapes" — the only report of what a write actually changed | `README.md:166` |
| `owned` | "you have this one" | `README.md:172` |
| `quantity` | "you have 3 bottles" | `README.md:172` |

## Copy that asserts a rule

| Claim | Enforced or copy? |
| --- | --- |
| The permission-denial message states the required permission and the caller's role | **Enforced** — the handler re-checks the permission before doing any work, and the message is generated from the same `TOOL_PERMISSIONS` table (`README.md:136`, `README.md:147`) |
| `fields_filled` implies "everything else was left alone" | **Enforced** by [ADR-0007](../../decisions/0007-upsert-fills-blanks-and-never-overwrites.md) — but the list names only what changed, never what was *refused*, so an agent cannot truthfully tell the user "your region was rejected because one is already recorded" |

## Not localized

Nothing is. There is no localization system, and the one specified string is English with interpolated identifiers. For a server whose clients are language models, this is defensible; record it here so nobody mistakes it for an oversight.

## Unused keys

None — there is no string table to hold unused keys.
