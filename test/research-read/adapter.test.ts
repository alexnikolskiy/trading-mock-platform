import { describe, it, expect } from 'vitest';
import { researchCapabilities } from '../../src/research-read/capabilities.js';
import { listResults, getResult } from '../../src/research-read/adapter.js';
import type { SnapshotBundle } from '../../src/contract/snapshot/bundle.js';

const bundle = {
  researchByRun: {
    r1: {
      summary: { runRef: 'r1', mode: 'paper',
        metrics: { netPnlUsd: '6', winRate: 50, maxDrawdownPct: '4', sharpe: { available: false }, totalTrades: 2 },
        asOf: 1 },
      trades: [], decisions: [], analysisContext: 'ok',
    },
  },
} as unknown as SnapshotBundle;

describe('research-read seam', () => {
  it('capability descriptor marks mutation + backtest unavailable with the migration reason', () => {
    const cap = researchCapabilities();
    expect(cap.capabilities).toEqual({ read: true, mutation: false, backtestSubmission: false, backtestResults: false });
    expect(cap.note).toBe('backtesting_moved_to_trading_backtester');
  });
  it('projects a research run result from the snapshot', () => {
    const r = getResult(bundle, 'r1');
    expect(r?.summary.metrics.netPnlUsd).toBe('6');
  });
  it('lists results', () => {
    expect(listResults(bundle)).toHaveLength(1);
  });
});
