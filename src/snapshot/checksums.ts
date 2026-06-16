import { createHash } from 'node:crypto';

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function verifyChecksum(name: string, data: Buffer, expectedHex: string): void {
  const actual = sha256Hex(data);
  if (actual !== expectedHex) {
    throw new Error(`snapshot checksum mismatch for ${name}: expected ${expectedHex}, got ${actual}`);
  }
}
