import { describe, expect, it } from 'vitest';
import { bytesToLowerHex } from '../src/lib/hash';

describe('hash adapter', () => {
  it('returns lowercase hex without 0x', () => {
    expect(bytesToLowerHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
  });
});
