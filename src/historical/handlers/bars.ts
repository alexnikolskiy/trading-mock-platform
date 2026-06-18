import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { BarsPage, Timeframe } from '../../contract/historical-read/dto.js';
import type { OpsError } from '../../contract/common/errors.js';
import { readBars } from '../../snapshot/readers/bars.js';
import { paginate, invalidCursor } from '../../ops/pagination.js';

const VALID_TIMEFRAMES = new Set<Timeframe>(['1m', '5m', '15m', '1h', '4h', '1d']);

function unavailable(): OpsError {
  return { category: 'not_found', code: 'historical_unavailable', message: 'historical data not present in this snapshot' };
}

function unsupportedTimeframe(tf: string): OpsError {
  return { category: 'validation_error', code: 'unsupported_timeframe', message: `unsupported timeframe '${tf}'; valid: ${[...VALID_TIMEFRAMES].join(', ')}` };
}

function missingParam(name: string): OpsError {
  return { category: 'validation_error', code: 'missing_param', message: `required query param '${name}' is missing` };
}

export function handleBars(
  bundle: SnapshotBundle,
  params: { symbol?: string; timeframe?: string; fromMs?: number; toMs?: number },
  asOf: number,
  cursor?: string,
): BarsPage | OpsError {
  if (!bundle.historical) return unavailable();
  if (!params.symbol) return missingParam('symbol');
  if (!params.timeframe) return missingParam('timeframe');
  if (!VALID_TIMEFRAMES.has(params.timeframe as Timeframe)) return unsupportedTimeframe(params.timeframe);

  const symbol = params.symbol;
  const timeframe = params.timeframe as Timeframe;
  const { fromMs, toMs } = params;

  const bars = readBars(bundle, {
    symbol,
    timeframe,
    ...(fromMs !== undefined ? { fromMs } : {}),
    ...(toMs !== undefined ? { toMs } : {}),
  });

  try {
    return paginate(bars, cursor, undefined, {
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
