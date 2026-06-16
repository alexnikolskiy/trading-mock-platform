import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, paginate } from '../../src/ops/pagination.js';

describe('pagination', () => {
  it('round-trips an opaque cursor', () => {
    const c = encodeCursor({ offset: 50 });
    expect(typeof c).toBe('string');
    expect(decodeCursor(c)).toEqual({ offset: 50 });
  });
  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(/invalid cursor/i);
  });
  it('returns a page with nextCursor when more items remain', () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const p = paginate(items, undefined, 2);
    expect(p.items).toEqual([0, 1]);
    expect(p.nextCursor).not.toBeNull();
    const p2 = paginate(items, p.nextCursor!, 2);
    expect(p2.items).toEqual([2, 3]);
  });
  it('returns null nextCursor on the last page', () => {
    const items = [0, 1];
    const p = paginate(items, undefined, 2);
    expect(p.nextCursor).toBeNull();
  });
});
