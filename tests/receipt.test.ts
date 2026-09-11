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
  transaction: '1'.repeat(64),
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

  it('parses changed metadata so it can be compared with the public record', () => {
    const text = formatReceipt(RECEIPT)
      .replace('network: solana-devnet', 'network: edited-network')
      .replace(`program: ${MEMO_PROGRAM_ID}`, 'program: edited-program')
      .replace(`sha256: ${RECEIPT.sha256}`, `sha256: ${'c'.repeat(64)}`);

    expect(parseReceipt(text)).toMatchObject({
      network: 'edited-network',
      program: 'edited-program',
      sha256: 'c'.repeat(64),
    });
  });

  it('requires a Solana signature that decodes to exactly 64 bytes', () => {
    const text = formatReceipt(RECEIPT).replace(
      `transaction: ${RECEIPT.transaction}`,
      `transaction: ${'1'.repeat(63)}`,
    );
    expect(() => parseReceipt(text)).toThrow(/transaction signature/i);
  });

  it('rejects malformed block time metadata', () => {
    const text = formatReceipt(RECEIPT).replace(
      `block_time: ${RECEIPT.blockTime}`,
      'block_time: definitely-not-a-time',
    );
    expect(() => parseReceipt(text)).toThrow(/block time/i);
  });
});
