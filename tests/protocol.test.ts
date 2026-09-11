import { describe, expect, it } from 'vitest';
import { decodeBase58 } from '../src/lib/base58';
import { decodeProofStampMemo, encodeProofStampMemo } from '../src/lib/protocol';

const HASH = 'a'.repeat(64);

describe('ProofStamp memo protocol', () => {
  it('encodes the exact canonical payload', () => {
    expect(encodeProofStampMemo(HASH)).toBe(`proofstamp:v1:sha256:${HASH}`);
  });

  it('rejects uppercase and malformed hashes', () => {
    expect(() => encodeProofStampMemo('A'.repeat(64))).toThrow();
    expect(() => decodeProofStampMemo(`proofstamp:v1:sha256:${'a'.repeat(63)}`)).toThrow();
    expect(() => decodeProofStampMemo(`proofstamp:v1:sha256:${HASH}:extra`)).toThrow();
  });
});

describe('base58 decoder', () => {
  it('preserves leading zero bytes', () => {
    expect(Array.from(decodeBase58('1112'))).toEqual([0, 0, 0, 1]);
  });

  it('rejects characters outside the Bitcoin/Solana alphabet', () => {
    expect(() => decodeBase58('0OIl')).toThrow();
  });
});
