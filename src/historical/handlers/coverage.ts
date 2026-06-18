import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { HistoricalCoverageSnapshot, Timeframe } from '../../contract/historical-read/dto.js';

const ALL_TIMEFRAMES: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export function handleHistoricalCoverage(bundle: SnapshotBundle, asOf: number): HistoricalCoverageSnapshot {
  if (!bundle.historical) {
    return { entries: [], symbols: [], timeframes: [], availability: 'unavailable', asOf };
  }

  const hist = bundle.historical;
  const symbols = Object.keys(hist.barsBySymbolAndTimeframe).sort();
  const entries = symbols.flatMap((symbol) => {
    const byTf = hist.barsBySymbolAndTimeframe[symbol] ?? {};
    return Object.keys(byTf)
      .sort()
      .map((tf) => {
        const bars = byTf[tf] ?? [];
        return {
          symbol,
          timeframe: tf as Timeframe,
          fromMs: bars.length > 0 ? bars[0]!.tsMs : 0,
          toMs: bars.length > 0 ? bars[bars.length - 1]!.tsMs : 0,
          barCount: bars.length,
          availability: bars.length > 0 ? ('available' as const) : ('unavailable' as const),
        };
      });
  });

  const presentTimeframes = [...new Set(entries.map((e) => e.timeframe))].sort() as Timeframe[];

  return { entries, symbols, timeframes: presentTimeframes.length > 0 ? presentTimeframes : ALL_TIMEFRAMES, availability: 'available', asOf };
}
