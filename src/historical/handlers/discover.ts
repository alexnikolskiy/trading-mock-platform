import type { SnapshotBundle } from '../../contract/snapshot/bundle.js';
import type { HistoricalCapabilityDescriptor, HistoricalCapabilities, HistoricalResourceDescriptor, Timeframe } from '../../contract/historical-read/dto.js';
import { HISTORICAL_READ_CONTRACT_VERSION } from '../../contract/historical-read/version.js';
import { MAX_PAGE } from '../../ops/pagination.js';

const CAPABILITIES: HistoricalCapabilities = {
  readOnly: true,
  execution: false,
  mutation: false,
  liveIngestion: false,
};

const RESOURCES: readonly HistoricalResourceDescriptor[] = [
  {
    name: 'bars',
    supportedFilters: ['symbol', 'timeframe', 'fromMs', 'toMs', 'cursor'],
    pagination: { cursor: true, maxPageItems: MAX_PAGE },
    fields: ['tsMs', 'open', 'high', 'low', 'close', 'volume'],
    availability: 'available',
  },
  {
    name: 'funding',
    supportedFilters: ['symbol', 'fromMs', 'toMs', 'cursor'],
    pagination: { cursor: true, maxPageItems: MAX_PAGE },
    fields: ['tsMs', 'symbol', 'rate'],
    availability: 'available',
  },
  {
    name: 'open-interest',
    supportedFilters: ['symbol', 'fromMs', 'toMs', 'cursor'],
    pagination: { cursor: true, maxPageItems: MAX_PAGE },
    fields: ['tsMs', 'symbol', 'openInterestUsd'],
    availability: 'available',
  },
  {
    name: 'liquidations',
    supportedFilters: ['symbol', 'fromMs', 'toMs', 'cursor'],
    pagination: { cursor: true, maxPageItems: MAX_PAGE },
    fields: ['tsMs', 'symbol', 'side', 'sizeUsd'],
    availability: 'available',
  },
  {
    name: 'historical-coverage',
    supportedFilters: [],
    pagination: null,
    fields: ['entries', 'symbols', 'timeframes', 'availability', 'asOf'],
    availability: 'available',
  },
];

const ALL_TIMEFRAMES: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export function buildHistoricalDiscover(bundle: SnapshotBundle): HistoricalCapabilityDescriptor {
  const hist = bundle.historical;
  const symbols = hist ? Object.keys(hist.barsBySymbolAndTimeframe).sort() : [];

  const presentTimeframes = hist
    ? ([...new Set(
        Object.values(hist.barsBySymbolAndTimeframe).flatMap((byTf) => Object.keys(byTf)),
      )].sort() as Timeframe[])
    : ALL_TIMEFRAMES;

  return {
    historicalContractVersion: HISTORICAL_READ_CONTRACT_VERSION,
    capabilities: CAPABILITIES,
    resources: hist ? RESOURCES : RESOURCES.map((r) => ({ ...r, availability: 'unavailable' as const })),
    symbols,
    timeframes: presentTimeframes,
  };
}
