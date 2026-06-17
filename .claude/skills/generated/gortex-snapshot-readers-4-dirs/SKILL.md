---
name: gortex-snapshot-readers-4-dirs
description: "Work in the snapshot/readers +4 dirs area — 36 symbols across 10 files (82% cohesion)"
---

# snapshot/readers +4 dirs

36 symbols | 10 files | 82% cohesion

## When to Use

Use this skill when working on files in:
- `src/contract/ops-read/dto.local.ts`
- `src/contract/snapshot/bundle.ts`
- `src/events/replay.ts`
- `src/ops/handlers/coverage.ts`
- `src/ops/handlers/health.ts`
- `src/snapshot/readers/coverage.ts`
- `src/snapshot/readers/decisions.ts`
- `src/snapshot/readers/events.ts`
- `src/snapshot/readers/health.ts`
- `src/snapshot/readers/trades.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/contract/ops-read/dto.local.ts` | RuntimeHealthCollection, SourceCoverageSnapshot, MarketServiceHealthSnapshot, ExecutionHealthSnapshot |
| `src/contract/snapshot/bundle.ts` | SnapshotBundle |
| `src/events/replay.ts` | bundle, bundle |
| `src/ops/handlers/coverage.ts` | handleCoverage, b, kind, source |
| `src/ops/handlers/health.ts` | handleMarketHealth, handleRuntimeHealth, b, handleExecutionHealth, b, ... |
| `src/snapshot/readers/coverage.ts` | kind, b, readCoverage, source |
| `src/snapshot/readers/decisions.ts` | runId, bundle, readDecisions |
| `src/snapshot/readers/events.ts` | bundle, readEvents, runId |
| `src/snapshot/readers/health.ts` | b, readRuntimeHealth, b, readMarketHealth, b, ... |
| `src/snapshot/readers/trades.ts` | bundle, readTrades, runId |

## Entry Points

- `src/ops/handlers/health.ts::handleExecutionHealth`
- `src/ops/handlers/health.ts::handleRuntimeHealth`
- `src/ops/handlers/coverage.ts::handleCoverage`
- `src/ops/handlers/health.ts::handleMarketHealth`
- `src/snapshot/readers/coverage.ts::readCoverage`

## How to Explore

```
get_communities with id: "community-13"
smart_context with task: "understand snapshot/readers +4 dirs", format: "gcx"
find_usages with id: "src/ops/handlers/health.ts::handleExecutionHealth", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
