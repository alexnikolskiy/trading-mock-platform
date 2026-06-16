import { describe, it, expect } from 'vitest';
import { inScope, scanFiles } from '../../scripts/verify_no_secrets.js';

describe('no-secrets scope (clarification #2)', () => {
  it('includes committed snapshot data and stray data files anywhere', () => {
    expect(inScope('data/snapshots/fixtures/x/ops/bundle.json')).toBe(true);
    expect(inScope('some/dir/dump.parquet')).toBe(true);
    expect(inScope('config/leaked.env')).toBe(true);
    expect(inScope('whatever/data.ndjson')).toBe(true);
  });
  it('excludes source/test/docs/scripts/config and .gitkeep', () => {
    expect(inScope('src/safety/secret-scan.ts')).toBe(false);
    expect(inScope('test/safety/secret-scan.test.ts')).toBe(false);
    expect(inScope('docs/contracts/sanitization-policy.md')).toBe(false);
    expect(inScope('scripts/verify_no_secrets.ts')).toBe(false);
    expect(inScope('package.json')).toBe(false);
    expect(inScope('pnpm-lock.yaml')).toBe(false);
    expect(inScope('data/snapshots/.gitkeep')).toBe(false);
  });
});

describe('no-secrets matching (reuses scanText)', () => {
  it('flags an in-scope data file containing a forbidden pattern, ignores clean', () => {
    const v = scanFiles([
      { path: 'data/x.json', content: '{"k":"AKIA1234567890ABCDEF"}' },
      { path: 'data/y.json', content: '{"runId":"r_opaque"}' },
    ]);
    expect(v).toEqual(['data/x.json: aws access key']);
  });
});
