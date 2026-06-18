import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { OhlcvBar, Timeframe } from '../../contract/historical-read/dto.js';

export interface BarsFilter {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly fromMs?: number;
  readonly toMs?: number;
}

export function readBars(bundle: SnapshotBundle, f: BarsFilter): readonly OhlcvBar[] {
  const byTf = bundle.historical?.barsBySymbolAndTimeframe[f.symbol];
  if (!byTf) return [];
  const bars = byTf[f.timeframe] ?? [];
  return bars.filter((b) =>
    (f.fromMs === undefined || b.tsMs >= f.fromMs) &&
    (f.toMs === undefined || b.tsMs <= f.toMs),
  );
}
