import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('contract isolation', () => {
  it('verify script exits 0 on a clean contract layer', () => {
    const run = () => execFileSync('node', ['scripts/verify_contract_isolation.mjs'], { encoding: 'utf8' });
    expect(run).not.toThrow();
  });
});
