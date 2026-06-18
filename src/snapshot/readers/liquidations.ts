import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { LiquidationEntry } from '../../contract/historical-read/dto.js';

export interface LiquidationsFilter {
  readonly symbol: string;
  readonly fromMs?: number;
  readonly toMs?: number;
}

export function readLiquidations(bundle: SnapshotBundle, f: LiquidationsFilter): readonly LiquidationEntry[] {
  const entries = bundle.historical?.liquidationsBySymbol[f.symbol] ?? [];
  return entries.filter((e) =>
    (f.fromMs === undefined || e.tsMs >= f.fromMs) &&
    (f.toMs === undefined || e.tsMs <= f.toMs),
  );
}
