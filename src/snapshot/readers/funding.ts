import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { FundingEntry } from '../../contract/historical-read/dto.js';

export interface FundingFilter {
  readonly symbol: string;
  readonly fromMs?: number;
  readonly toMs?: number;
}

export function readFunding(bundle: SnapshotBundle, f: FundingFilter): readonly FundingEntry[] {
  const entries = bundle.historical?.fundingBySymbol[f.symbol] ?? [];
  return entries.filter((e) =>
    (f.fromMs === undefined || e.tsMs >= f.fromMs) &&
    (f.toMs === undefined || e.tsMs <= f.toMs),
  );
}
