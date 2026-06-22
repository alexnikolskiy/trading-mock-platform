import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { openSnapshot } from '../../src/snapshot/registry.js';
import { createApp } from '../../src/http/app.js';
import { readRows } from '../../src/snapshot/readers/rows.js';
import type { LoadedSnapshot } from '../../src/snapshot/loader.js';
import type { CanonicalRowV2 } from '../../src/contract/historical-read/dto.js';
// Vendored copy of the platform's shared harness (import-free ESM). The sync gate
// (scripts/verify_harness_sync.mjs) proves this byte-matches the platform source.
import { runHistoricalConformance } from './_vendored/historical.conformance.mjs';

let snap: LoadedSnapshot;
let server: ReturnType<typeof serve>;
let baseUrl: string;
let goldenRows: readonly CanonicalRowV2[];

beforeAll(async () => {
  snap = openSnapshot('data/snapshots/fixtures', 'historical-golden');
  goldenRows = readRows(snap.bundle, { symbol: 'BTCUSDT' });
  const { app } = createApp({ snapshot: snap, tokenAllowlist: [], replay: { mode: 'once', speed: 1 } });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('mock == real: shared historical conformance harness over the golden snapshot', () => {
  it('passes the platform harness (discover historical.2, rows resource, 19 fields, pagination union, open-toMs, unknown-symbol graceful) + byte-identity', async () => {
    expect(goldenRows.length).toBe(30);
    const result = await runHistoricalConformance({ baseUrl }, { goldenRows });
    expect(result).toEqual({ ok: true });
  });
});
