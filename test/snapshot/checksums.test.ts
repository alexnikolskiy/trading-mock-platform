import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { verifyChecksum } from '../../src/snapshot/checksums.js';

describe('verifyChecksum', () => {
  it('passes when sha256 matches', () => {
    const buf = Buffer.from('hello');
    const want = createHash('sha256').update(buf).digest('hex');
    expect(() => verifyChecksum('a.json', buf, want)).not.toThrow();
  });
  it('throws a clear error when sha256 mismatches', () => {
    expect(() => verifyChecksum('a.json', Buffer.from('hello'), 'deadbeef'))
      .toThrow(/checksum mismatch.*a\.json/i);
  });
});
