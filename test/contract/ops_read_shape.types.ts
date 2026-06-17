// Compile-time guard (checked by `pnpm typecheck`, NOT vitest): the ops-read barrel must keep
// re-exporting the lifted bot-results types with their exact shapes. A dropped re-export or a silent
// shape drift through the SDK lift becomes a tsc error here. The SDK conformance gate already pins
// SDK ≡ operations/dto.ts; this pins the mock barrel ≡ the lifted shapes.
import type {
  BotMode, BotRunStatus, TradeSide, OpsSeverity, BotRunStrategyRef,
  BotRunRecord, ClosedTrade, ClosedTradesAggregate, RunSummary,
  OperationalEvent, DecisionLogEntry,
} from '../../src/contract/ops-read/dto.js';

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

type _BotRunRecord = Assert<Mutual<BotRunRecord, {
  readonly runId: string; readonly mode: BotMode; readonly status: BotRunStatus;
  readonly strategy: BotRunStrategyRef;
  readonly startedAtMs: number; readonly finishedAtMs: number | null;
  readonly lastSeenMs: number; readonly symbols: readonly string[];
}>>;

type _ClosedTrade = Assert<Mutual<ClosedTrade, {
  readonly tradeId: string; readonly runId: string; readonly symbol: string; readonly side: TradeSide;
  readonly openedAtMs: number; readonly closedAtMs: number | null;
  readonly realizedPnl: string; readonly pnlPct: string;
  readonly isWin: boolean | null; readonly closeReason: string | null;
}>>;

// RunSummary extends ClosedTradesAggregate — the RHS models that inheritance as an intersection.
type _RunSummary = Assert<Mutual<RunSummary, ClosedTradesAggregate & {
  readonly runId: string; readonly excludesReconcile: boolean; readonly asOf: number;
}>>;

type _DecisionLogEntry = Assert<Mutual<DecisionLogEntry, {
  readonly category: string; readonly runId: string; readonly botId: string; readonly symbol: string;
  readonly side: TradeSide; readonly reason: string; readonly tsMs: number; readonly safeMessage: string;
}>>;

// Touch the remaining re-exports so a missing barrel export is a compile error.
export type _Touch = [OpsSeverity, OperationalEvent, _BotRunRecord, _ClosedTrade, _RunSummary, _DecisionLogEntry];
