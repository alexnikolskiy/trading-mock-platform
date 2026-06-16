import type { Capable } from '../analysis/dto.js';

/** Read-only capability descriptor for Surface B. Mutating tools are explicitly false. */
export interface ResearchCapabilityDescriptor {
  readonly researchReadContractVersion: string;
  readonly capabilities: {
    readonly read: true;
    readonly mutation: false;
    readonly backtestSubmission: false;
    readonly backtestResults: false;
  };
  /** Why mutating/backtest surfaces are absent here. */
  readonly note: 'backtesting_moved_to_trading_backtester';
}

export interface ResearchMetrics {
  readonly netPnlUsd: string;
  readonly winRate: number;
  readonly maxDrawdownPct: string;
  readonly profitFactor?: string;   // omitted when gross loss == 0
  readonly sharpe: Capable<string>; // not always safely derivable
  readonly totalTrades: number;
}
export interface ResearchTrade {
  readonly tradeId: string;         // opaque
  readonly symbol: string;
  readonly side: 'long' | 'short';
  readonly openedAtMs: number;
  readonly closedAtMs: number | null;
  readonly realizedPnl: string;
}
export interface ResearchDecision {
  readonly category: string;
  readonly symbol: string;
  readonly reason: string;
  readonly tsMs: number;
}
export interface ResearchRunSummary {
  readonly runRef: string;          // opaque
  readonly mode: 'live' | 'paper' | 'backtest';
  readonly metrics: ResearchMetrics;
  readonly asOf: number;
}
export interface ResearchRunResult {
  readonly summary: ResearchRunSummary;
  readonly trades: readonly ResearchTrade[];
  readonly decisions: readonly ResearchDecision[];
  readonly analysisContext: string;
}
