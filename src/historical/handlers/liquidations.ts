import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { LiquidationsPage } from '../../contract/historical-read/dto.js';
import type { OpsError } from '../../contract/common/errors.js';
import { readLiquidations } from '../../snapshot/readers/liquidations.js';
import { paginate, invalidCursor } from '../../ops/pagination.js';

function unavailable(): OpsError {
  return { category: 'not_found', code: 'historical_unavailable', message: 'historical data not present in this snapshot' };
}

function missingParam(name: string): OpsError {
  return { category: 'validation_error', code: 'missing_param', message: `required query param '${name}' is missing` };
}

export function handleLiquidations(
  bundle: SnapshotBundle,
  params: { symbol?: string; fromMs?: number; toMs?: number },
  asOf: number,
  cursor?: string,
): LiquidationsPage | OpsError {
  if (!bundle.historical) return unavailable();
  if (!params.symbol) return missingParam('symbol');

  const symbol = params.symbol;
  const { fromMs, toMs } = params;

  const entries = readLiquidations(bundle, {
    symbol,
    ...(fromMs !== undefined ? { fromMs } : {}),
    ...(toMs !== undefined ? { toMs } : {}),
  });

  try {
    return paginate(entries, cursor, undefined, {
      asOf,
      window: {
        ...(fromMs !== undefined ? { fromMs } : {}),
        ...(toMs !== undefined ? { toMs } : {}),
      },
    });
  } catch {
    return invalidCursor();
  }
}
