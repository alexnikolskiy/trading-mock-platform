import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { OpenInterestEntry } from '../../contract/historical-read/dto.js';

export interface OpenInterestFilter {
  readonly symbol: string;
  readonly fromMs?: number;
  readonly toMs?: number;
}

export function readOpenInterest(bundle: SnapshotBundle, f: OpenInterestFilter): readonly OpenInterestEntry[] {
  const entries = bundle.historical?.openInterestBySymbol[f.symbol] ?? [];
  return entries.filter((e) =>
    (f.fromMs === undefined || e.tsMs >= f.fromMs) &&
    (f.toMs === undefined || e.tsMs <= f.toMs),
  );
}
