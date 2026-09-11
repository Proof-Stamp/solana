import { PROTOCOL_PREFIX } from './config';

const SHA256_RE = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: string): boolean {
  return SHA256_RE.test(value);
}

export function encodeProofStampMemo(sha256: string): string {
  if (!isSha256Hex(sha256)) {
    throw new Error('SHA-256 must be 64 lowercase hexadecimal characters.');
  }
  return `${PROTOCOL_PREFIX}${sha256}`;
}

export function decodeProofStampMemo(value: string): string {
  if (!value.startsWith(PROTOCOL_PREFIX)) {
    throw new Error('Unsupported ProofStamp memo prefix.');
  }

  const digest = value.slice(PROTOCOL_PREFIX.length);
  if (!isSha256Hex(digest)) {
    throw new Error('Invalid SHA-256 in ProofStamp memo.');
  }

  if (value !== encodeProofStampMemo(digest)) {
    throw new Error('ProofStamp memo is not canonical.');
  }

  return digest;
}
