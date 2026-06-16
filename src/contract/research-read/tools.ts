export interface ResearchToolDescriptor {
  readonly name: string;
  readonly available: boolean;
  readonly reason?: string;
}

/** Surface B tool catalog: read tools available; every mutating/backtest tool unavailable. */
export const RESEARCH_TOOLS: readonly ResearchToolDescriptor[] = [
  { name: 'listBotResults', available: true },
  { name: 'getRunSummary', available: true },
  { name: 'listTrades', available: true },
  { name: 'listDecisions', available: true },
  { name: 'getAnalysisContext', available: true },
  { name: 'submitOverlayRun', available: false, reason: 'backtesting_moved_to_trading_backtester' },
  { name: 'validateModule', available: false, reason: 'backtesting_moved_to_trading_backtester' },
  { name: 'getBacktestResult', available: false, reason: 'backtesting_moved_to_trading_backtester' },
];
