import { describe, expect, it } from 'vitest';
import { bytesToLowerHex, sha256File } from '../src/lib/hash';

describe('hash adapter', () => {
  it('returns lowercase hex without 0x', () => {
    expect(bytesToLowerHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
  });

  it('hashes the exact selected bytes with SHA-256', async () => {
    const file = new File([new Uint8Array([0x61, 0x62, 0x63])], 'abc.bin');
    await expect(sha256File(file)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
