import type { FreshnessMarker } from '../common/envelopes.js';
import type { BotMode, BotRunStrategyRef, TradeSide } from '../ops-read/dto.js';

/** Capability-aware omission: a field that cannot be safely/reliably sourced. Never fabricate instead. */
export interface CapabilityAbsent {
  readonly available: false;
  readonly reason?: string;
}
export type Capable<T> = T | CapabilityAbsent;

export interface AnalysisIdentity {
  readonly mode: BotMode;
  readonly strategy: BotRunStrategyRef;
  readonly symbols: readonly string[];
}
export interface AnalysisPeriod {
  readonly fromMs: number;
  readonly toMs: number;
}
export interface AnalysisMetrics {
  readonly pnl: string;
  readonly winRate: number;
  readonly maxDrawdown: string;
  readonly totalTrades: number;
  /** OMITTED (field absent) when absolute gross loss == 0 — do not emit Infinity. */
  readonly profitFactor?: string;
  readonly topTradeContributionPct: number;
}
export interface AnalysisTrade {
  readonly tradeId: string;        // opaque
  readonly symbol: string;
  readonly side: TradeSide;
  readonly openedAtMs: number;
  readonly closedAtMs: number | null;
  readonly realizedPnl: string;
  readonly entryReason: string | null;
  readonly exitReason: string | null;
}
export interface AnalysisFeatures {
  readonly oi: boolean;
  readonly liquidation: boolean;
  readonly dump: boolean;
  readonly bounce: boolean;
}
export interface SlTpBeEvent {
  readonly tradeId: string;        // opaque
  readonly kind: 'sl' | 'tp' | 'be';
  readonly tsMs: number;
}
export interface AnalysisSnapshot {
  readonly runRef: string;         // opaque
  readonly opsContractVersion: string;   // 'ops.4'
  readonly asOf: number;
  readonly freshness: FreshnessMarker;
  readonly identity: AnalysisIdentity;
  readonly period: AnalysisPeriod;
  readonly healthContext: string;
  readonly metrics: AnalysisMetrics;
  readonly trades: readonly AnalysisTrade[];
  readonly strategyConfig: Capable<Record<string, unknown>>;
  readonly dcaCount: Capable<number>;
  readonly slTpBeEvents: Capable<readonly SlTpBeEvent[]>;
  readonly features: Capable<AnalysisFeatures>;
  readonly summaryPatterns: readonly string[];
}
