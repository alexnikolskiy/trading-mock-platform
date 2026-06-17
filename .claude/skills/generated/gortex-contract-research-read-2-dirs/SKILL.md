---
name: gortex-contract-research-read-2-dirs
description: "Work in the contract/research-read +2 dirs area — 11 symbols across 3 files (86% cohesion)"
---

# contract/research-read +2 dirs

11 symbols | 3 files | 86% cohesion

## When to Use

Use this skill when working on files in:
- `src/contract/research-read/dto.ts`
- `src/research-read/adapter.ts`
- `src/snapshot/readers/research.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/contract/research-read/dto.ts` | ResearchRunResult |
| `src/research-read/adapter.ts` | getResult, bundle, runId, listResults, bundle |
| `src/snapshot/readers/research.ts` | readResearchResult, listResearchResults, b, runId, b |

## Entry Points

- `src/research-read/adapter.ts::listResults`
- `src/snapshot/readers/research.ts::listResearchResults`

## How to Explore

```
get_communities with id: "community-28"
smart_context with task: "understand contract/research-read +2 dirs", format: "gcx"
find_usages with id: "src/research-read/adapter.ts::listResults", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
