import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadSnapshot } from '../../src/snapshot/loader.js';

const FIXTURE = join(process.cwd(), 'data/snapshots/fixtures/2026-06-18-real-all');

// The loss-heavy taker-era demo default: a single real VPS day (2026-06-18) carrying
// all symbols traded that day, full per-minute taker flow (feature 028) + funding,
// and a realistic loss-bearing trade set (winrate ~59%, the worst day of the taker era).
describe('real-data demo fixture (2026-06-18-real-all, taker loss-day)', () => {
  const snap = loadSnapshot(FIXTURE); // throws on schema / checksum / secret-scan failure

  it('loads with the expected manifest ref', () => {
    expect(snap.manifest.ref).toBe('2026-06-18-real-all');
  });

  it('carries per-minute CanonicalRowV2 rows with raw taker flow (feature 028)', () => {
    const h = snap.bundle.historical;
    expect(h).toBeDefined();
    const rowsBySymbol = h!.rowsBySymbol;
    expect(rowsBySymbol).toBeDefined();
    const symbols = Object.keys(rowsBySymbol!);
    expect(symbols.length).toBeGreaterThan(0);

    let totalRows = 0;
    let takerRows = 0;
    for (const rows of Object.values(rowsBySymbol!)) {
      for (const r of rows) {
        totalRows += 1;
        expect(r.schema_version).toBe(2);
        if (r.has_taker_flow) {
          takerRows += 1;
          expect(r.taker_buy_volume_usd).not.toBeNull();
          expect(r.taker_sell_volume_usd).not.toBeNull();
        }
      }
    }
    expect(totalRows).toBeGreaterThan(0);
    // The whole real day is post-028: essentially every minute carries taker flow
    // (a stray minute may lack a recorded taker print, so allow a tiny gap).
    expect(takerRows / totalRows).toBeGreaterThan(0.99);
  });

  it('carries funding for every historical symbol (feature 027)', () => {
    const h = snap.bundle.historical!;
    const rowSyms = Object.keys(h.rowsBySymbol!).sort();
    expect(Object.keys(h.fundingBySymbol).sort()).toEqual(rowSyms);
    for (const sym of rowSyms) {
      expect(h.fundingBySymbol[sym]!.length).toBeGreaterThan(0);
    }
  });

  it('is a loss-bearing slice (realistic winrate, not top-skewed)', () => {
    const trades = Object.values(snap.bundle.tradesByRun).flat() as { isWin: boolean | null }[];
    expect(trades.length).toBe(22);
    const losses = trades.filter((t) => t.isWin === false).length;
    const wins = trades.filter((t) => t.isWin === true).length;
    expect(losses).toBe(9);
    expect(wins).toBe(13);
  });

  it('every historical symbol has at least one trade (coherent demo)', () => {
    const traded = new Set<string>();
    for (const arr of Object.values(snap.bundle.tradesByRun)) {
      for (const t of arr) traded.add((t as { symbol: string }).symbol);
    }
    for (const sym of Object.keys(snap.bundle.historical!.rowsBySymbol!)) {
      expect(traded.has(sym)).toBe(true);
    }
  });
});
