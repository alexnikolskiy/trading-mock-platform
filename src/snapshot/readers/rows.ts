import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { CanonicalRowV2 } from '../../contract/historical-read/dto.js';

export interface RowsFilter {
  readonly symbol?: string;
  readonly fromMs?: number;
  readonly toMs?: number;
}

export function readRows(bundle: SnapshotBundle, f: RowsFilter): readonly CanonicalRowV2[] {
  if (f.symbol === undefined) return [];
  const rows = bundle.historical?.rowsBySymbol?.[f.symbol];
  if (!rows) return [];
  return rows.filter((r) =>
    (f.fromMs === undefined || r.minute_ts >= f.fromMs) &&
    (f.toMs === undefined || r.minute_ts <= f.toMs),
  );
}
