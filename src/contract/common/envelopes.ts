export type FreshnessMarker = 'fresh' | 'stale' | 'degraded';
export type SourceAvailability = 'available' | 'degraded' | 'unavailable';
export type OpsResourceAvailability = SourceAvailability | 'unsupported';

export interface PageWindow {
  readonly fromMs?: number;
  readonly toMs?: number;
}

export interface PageEnvelope<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly asOf: number;
  readonly window: PageWindow;
  readonly freshness: FreshnessMarker;
}
