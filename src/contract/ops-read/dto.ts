// Ops Read contract barrel. Bot-results primitives come from the SDK (dto.sdk.ts, A3 source of truth);
// health/coverage/discover/page-envelope stay mock-local (dto.local.ts) until a future lift. The import
// path '../ops-read/dto.js' is unchanged for all consumers (bundle.ts, handlers, readers).
export type * from './dto.sdk.js';
export type * from './dto.local.js';
