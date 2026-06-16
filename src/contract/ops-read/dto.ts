import type {
  PageEnvelope,
  SourceAvailability,
  OpsResourceAvailability,
} from '../common/envelopes.js';
import type { OpsCapabilities } from '../common/capabilities.js';

// --- runs ---
export type BotMode = 'live' | 'paper' | 'backtest';
export type BotRunStatus = 'running' | 'finished' | 'crashed' | 'aborted';
export interface BotRunStrategyRef { readonly name: string; readonly version: string; }
export interface BotRunRecord {
  readonly runId: string;          // opaque
  readonly mode: BotMode;
  readonly status: BotRunStatus;
  readonly strategy: BotRunStrategyRef;
  readonly startedAtMs: number;
  readonly finishedAtMs: number | null;
  readonly lastSeenMs: number;
  readonly symbols: readonly string[];
}

// --- trades + summary ---
export type TradeSide = 'long' | 'short';
export interface ClosedTrade {
  readonly tradeId: string;        // opaque
  readonly runId: string;          // opaque
  readonly symbol: string;
  readonly side: TradeSide;
  readonly openedAtMs: number;
  readonly closedAtMs: number | null;
  readonly realizedPnl: string;    // numeric-as-string
  readonly pnlPct: string;
  readonly isWin: boolean | null;
  readonly closeReason: string | null;
}
export interface ClosedTradesAggregate {
  readonly closedTrades: number;
  readonly wins: number;
  readonly losses: number;
  readonly breakeven: number;
  readonly winratePct: number;
  readonly pnlUsd: string;
  readonly avgPnl: string;
  readonly exitReasons: Record<string, number>;
}
export interface RunSummary extends ClosedTradesAggregate {
  readonly runId: string;          // opaque
  readonly excludesReconcile: boolean;
  readonly asOf: number;
}

// --- events + decisions ---
export type OpsSeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface OperationalEvent {
  readonly category: string;
  readonly severity: OpsSeverity | null;
  readonly runId: string;          // opaque
  readonly tradeId: string | null; // opaque
  readonly tsMs: number;
  readonly safeMessage: string;
}
export interface DecisionLogEntry {
  readonly category: string;
  readonly runId: string;          // opaque
  readonly botId: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly reason: string;
  readonly tsMs: number;
  readonly safeMessage: string;
}

// --- health + coverage ---
export type OpsHealthStatus = 'ok' | 'degraded' | 'down';
export interface RuntimeHealthIndicators {
  readonly ready: boolean;
  readonly freshnessOk: boolean;
  readonly pipelineOk: boolean;
  readonly serviceOk: boolean;
  readonly botOk: boolean;
}
export interface RuntimeHealthEntry {
  readonly source: string;
  readonly status: OpsHealthStatus;
  readonly indicators: RuntimeHealthIndicators;
  readonly availability: SourceAvailability;
  readonly capturedAtMs: number;
}
export interface RuntimeHealthCollection {
  readonly entries: readonly RuntimeHealthEntry[];
  readonly asOf: number;
}
export interface MarketServiceHealthSnapshot {
  readonly status: OpsHealthStatus;
  readonly diagnostics: Record<string, unknown>;
  readonly streamAgeMs: number | null;
  readonly availability: SourceAvailability;
  readonly asOf: number;
}
export interface ExecutionHealthSnapshot {
  readonly status: OpsHealthStatus;
  readonly recentCounts: Record<string, number>;
  readonly lastEventMs: number | null;
  readonly availability: SourceAvailability;
  readonly asOf: number;
}
export type OpsMarketDataKind = 'openInterest' | 'liquidations' | 'funding' | 'taker';
export type OpsCoverageState = 'present' | 'missing' | 'stale' | 'unsupported';
export interface SourceCoverageEntry {
  readonly source: string;
  readonly kind: OpsMarketDataKind;
  readonly state: OpsCoverageState;
  readonly freshnessAgeMs: number | null;
}
export interface SourceCoverageSnapshot {
  readonly entries: readonly SourceCoverageEntry[];
  readonly availability: SourceAvailability;
  readonly asOf: number;
}

// --- discover ---
export interface OpsResourcePagination {
  readonly cursor: true;
  readonly maxPageItems: number;
  readonly maxWindowMs?: number;
}
export interface OpsResourceDescriptor {
  readonly name: string;
  readonly supportedFilters: readonly string[];
  readonly pagination: OpsResourcePagination | null;
  readonly fields: readonly string[];
  readonly availability?: OpsResourceAvailability;
}
export interface OpsCapabilityDescriptor {
  readonly opsContractVersion: string;
  readonly capabilities: OpsCapabilities;
  readonly resources: readonly OpsResourceDescriptor[];
}

// convenience aliases for handlers
export type RunsPage = PageEnvelope<BotRunRecord>;
export type TradesPage = PageEnvelope<ClosedTrade>;
export type EventsPage = PageEnvelope<OperationalEvent>;
export type DecisionsPage = PageEnvelope<DecisionLogEntry>;
