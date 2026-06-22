import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSnapshot } from '../../src/snapshot/registry.js';
import { readRows } from '../../src/snapshot/readers/rows.js';
import type { CanonicalRowV2 } from '../../src/contract/historical-read/dto.js';

// The platform-side golden is the byte-identity source of truth. We read the *vendored*,
// committed copy (symmetric to the conformance harness) so this test is self-contained and
// passes in CI without the platform repo co-located. Cross-repo drift is caught separately
// by scripts/verify_harness_sync.mjs (hard sha + soft byte-compare against the live repo).
const VENDORED_GOLDEN = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../conformance/_vendored/platform-historical-golden.json',
);

const golden = JSON.parse(readFileSync(VENDORED_GOLDEN, 'utf8')) as CanonicalRowV2[];

describe('golden snapshot fixture (fixtures/historical-golden)', () => {
  // loadSnapshot runs verifyChecksum → assertValidManifest → assertSnapshotCompatible
  // → scanForSecrets → assertValidBundle; any failure throws here.
  const snap = openSnapshot('data/snapshots', 'fixtures/historical-golden');

  it('loads with the expected manifest ref', () => {
    expect(snap.manifest.ref).toBe('historical-golden');
  });

  it('surfaces exactly the 30 golden BTCUSDT rows through readRows', () => {
    const rows = readRows(snap.bundle, { symbol: 'BTCUSDT' });
    expect(rows).toHaveLength(30);
    expect(golden).toHaveLength(30);
  });

  it('is byte-identical to the platform golden, row by row', () => {
    const rows = readRows(snap.bundle, { symbol: 'BTCUSDT' });
    // structural equality across all 19 fields, in order, for every row
    expect(rows).toEqual(golden);
    // serialized equality is the strict byte-identity check
    expect(JSON.stringify(rows)).toBe(JSON.stringify(golden));
  });
});
