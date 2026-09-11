import { describe, expect, it } from 'vitest';
import {
  DEVNET_GENESIS_HASH,
  MEMO_PROGRAM_ID,
  NETWORK_LABEL,
  RECEIPT_VERSION,
} from '../src/lib/config';
import { formatReceipt, parseReceipt, type ProofStampReceipt } from '../src/lib/receipt';

const RECEIPT: ProofStampReceipt = {
  receiptVersion: RECEIPT_VERSION,
  network: NETWORK_LABEL,
  genesisHash: DEVNET_GENESIS_HASH,
  transaction: '2'.repeat(88),
  instructionIndex: 0,
  program: MEMO_PROGRAM_ID,
  sha256: 'b'.repeat(64),
  slot: 123456,
  blockTime: '2026-09-11T15:00:00.000Z',
};

describe('receipt', () => {
  it('round trips the supported fields', () => {
    expect(parseReceipt(formatReceipt(RECEIPT))).toEqual(RECEIPT);
  });

  it('rejects duplicate keys', () => {
    const text = `${formatReceipt(RECEIPT)}\nsha256: ${'c'.repeat(64)}\n`;
    expect(() => parseReceipt(text)).toThrow(/duplicate field/i);
  });

  it('rejects the wrong network', () => {
    const text = formatReceipt(RECEIPT).replace('network: solana-devnet', 'network: solana-mainnet');
    expect(() => parseReceipt(text)).toThrow(/network/i);
  });
});
