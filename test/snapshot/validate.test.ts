import { describe, it, expect } from 'vitest';
import { assertValidManifest, assertValidBundle } from '../../src/snapshot/validate.js';

const versions = {
  snapshotSchemaVersion: 'snapshot.1', opsReadContractVersion: 'ops.3',
  researchReadContractVersion: 'research.1', analysisContractVersion: 'ops.4',
  exporterVersion: 'e', sourcePlatformCommit: 'x', redactionPolicyVersion: 'r',
};
const manifest = { ref: 't', createdAtMs: 1, bundleRef: 'ops/bundle.json', checksumsRef: 'checksums.json', versions };
const emptyBundle = {
  runs: [], tradesByRun: {}, eventsByRun: {}, decisionsByRun: {},
  runtimeHealth: { entries: [], asOf: 1 },
  marketHealth: { status: 'ok', diagnostics: {}, streamAgeMs: null, availability: 'available', asOf: 1 },
  executionHealth: { status: 'ok', recentCounts: {}, lastEventMs: null, availability: 'unavailable', asOf: 1 },
  coverage: { entries: [], availability: 'available', asOf: 1 },
  analysisByRun: {}, researchByRun: {}, replay: { frames: [] },
};

describe('snapshot schema validation', () => {
  it('accepts a well-formed manifest and bundle', () => {
    expect(() => assertValidManifest(manifest)).not.toThrow();
    expect(() => assertValidBundle(emptyBundle)).not.toThrow();
  });
  it('FAILS CLOSED on an unknown field in the manifest', () => {
    expect(() => assertValidManifest({ ...manifest, leaked: 'x' })).toThrow(/manifest failed schema/i);
  });
  it('FAILS CLOSED on an unknown field in the bundle', () => {
    expect(() => assertValidBundle({ ...emptyBundle, leaked: 'x' })).toThrow(/bundle failed schema/i);
  });
  it('FAILS CLOSED on an unknown field inside a run record', () => {
    const bad = { ...emptyBundle, runs: [{
      runId: 'r1', mode: 'live', status: 'running', strategy: { name: 's', version: '1' },
      startedAtMs: 1, finishedAtMs: null, lastSeenMs: 2, symbols: [], hostPath: '/home/op/x' }] };
    expect(() => assertValidBundle(bad)).toThrow(/bundle failed schema/i);
  });
});
