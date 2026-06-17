import { describe, it, expect } from 'vitest';
import { violationFor } from '../../scripts/verify_contract_isolation.js';

describe('verify_contract_isolation: A3 SDK-seam rule', () => {
  it('allows @trading-platform/sdk ONLY in the seam file', () => {
    expect(violationFor('src/contract/ops-read/dto.sdk.ts', '@trading-platform/sdk/ops-read')).toBeNull();
  });

  it('rejects @trading-platform/sdk in research-read (it must stay extractable)', () => {
    const v = violationFor('src/contract/research-read/dto.ts', '@trading-platform/sdk/ops-read');
    expect(v).toContain('ONLY in src/contract/ops-read/dto.sdk.ts');
  });

  it('rejects @trading-platform/sdk even in a sibling ops-read file', () => {
    expect(violationFor('src/contract/ops-read/dto.local.ts', '@trading-platform/sdk')).not.toBeNull();
  });

  it('still rejects any other bare package anywhere in the contract layer', () => {
    expect(violationFor('src/contract/ops-read/dto.sdk.ts', 'lodash')).toContain('dependency-free');
  });

  it('allows node: and in-tree relative imports', () => {
    expect(violationFor('src/contract/ops-read/dto.local.ts', './dto.sdk.js')).toBeNull();
    expect(violationFor('src/contract/snapshot/bundle.ts', '../ops-read/dto.js')).toBeNull();
    expect(violationFor('src/contract/ops-read/version.ts', 'node:path')).toBeNull();
  });

  it('flags a relative import that escapes the contract root', () => {
    expect(violationFor('src/contract/ops-read/dto.ts', '../../snapshot/loader.js')).toContain('escapes');
  });
});
