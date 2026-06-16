import type { PageEnvelope, PageWindow, FreshnessMarker } from '../contract/common/envelopes.js';
import type { OpsError } from '../contract/common/errors.js';

interface CursorState { readonly offset: number; }

export function encodeCursor(s: CursorState): string {
  return Buffer.from(JSON.stringify(s), 'utf8').toString('base64url');
}
export function decodeCursor(cursor: string): CursorState {
  try {
    const obj = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorState;
    if (typeof obj.offset !== 'number' || obj.offset < 0) throw new Error('bad offset');
    return obj;
  } catch {
    throw new Error(`invalid cursor`);
  }
}

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 200;

export function paginate<T>(
  all: readonly T[],
  cursor: string | undefined,
  limit = DEFAULT_PAGE,
  opts: { asOf?: number; window?: PageWindow; freshness?: FreshnessMarker } = {},
): PageEnvelope<T> {
  const lim = Math.min(Math.max(1, limit), MAX_PAGE);
  const offset = cursor ? decodeCursor(cursor).offset : 0;
  const items = all.slice(offset, offset + lim);
  const nextCursor = offset + lim < all.length ? encodeCursor({ offset: offset + lim }) : null;
  return {
    items,
    nextCursor,
    asOf: opts.asOf ?? 0,
    window: opts.window ?? {},
    freshness: opts.freshness ?? 'fresh',
  };
}

/** Shared OpsError for a malformed cursor — handlers return this instead of letting paginate throw
 *  across the transport boundary (which would surface as a 500). */
export function invalidCursor(): OpsError {
  return { category: 'validation_error', code: 'invalid_cursor', message: 'invalid cursor' };
}
