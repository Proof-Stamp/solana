import { RECEIPT_VERSION } from './config';
import { decodeBase58 } from './base58';
import { isSha256Hex } from './protocol';

export interface ProofStampReceipt {
  receiptVersion: number;
  network: string;
  genesisHash: string;
  transaction: string;
  instructionIndex: number;
  program: string;
  sha256: string;
  slot: number;
  blockTime: string;
}

const HEADER = 'ProofStamp via Solana receipt';

export function formatReceipt(receipt: ProofStampReceipt): string {
  return [
    HEADER,
    `receipt_version: ${receipt.receiptVersion}`,
    `network: ${receipt.network}`,
    `genesis_hash: ${receipt.genesisHash}`,
    `transaction: ${receipt.transaction}`,
    `instruction_index: ${receipt.instructionIndex}`,
    `program: ${receipt.program}`,
    `sha256: ${receipt.sha256}`,
    `slot: ${receipt.slot}`,
    `block_time: ${receipt.blockTime}`,
    '',
    'The file stays on your device. This receipt points to a public Solana record.',
    'ProofStamp shows existence and integrity of exact bytes. It does not prove that the content is true.',
  ].join('\n');
}

function validateMetadata(value: string, field: string): void {
  if (!value || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid ${field} in receipt.`);
  }
}

export function parseReceipt(text: string): ProofStampReceipt {
  if (text.length > 16_384) {
    throw new Error('Receipt is too large.');
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0]?.trim() !== HEADER) {
    throw new Error('This is not a supported ProofStamp receipt.');
  }

  const fields = new Map<string, string>();
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line || !line.includes(':')) continue;
    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    if (fields.has(key)) {
      throw new Error(`Receipt contains duplicate field: ${key}.`);
    }
    fields.set(key, value);
  }

  const required = (key: string): string => {
    const value = fields.get(key);
    if (!value) throw new Error(`Receipt is missing ${key}.`);
    return value;
  };

  const receiptVersion = Number(required('receipt_version'));
  const network = required('network');
  const genesisHash = required('genesis_hash');
  const transaction = required('transaction');
  const instructionIndex = Number(required('instruction_index'));
  const program = required('program');
  const sha256 = required('sha256');
  const slot = Number(required('slot'));
  const blockTime = required('block_time');

  if (receiptVersion !== RECEIPT_VERSION) throw new Error('Unsupported receipt version.');
  validateMetadata(network, 'network');
  validateMetadata(genesisHash, 'genesis hash');
  validateMetadata(program, 'program');

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase58(transaction);
  } catch {
    throw new Error('Invalid Solana transaction signature.');
  }
  if (signatureBytes.length !== 64) {
    throw new Error('Invalid Solana transaction signature.');
  }

  if (!Number.isInteger(instructionIndex) || instructionIndex < 0 || instructionIndex > 255) {
    throw new Error('Invalid instruction index.');
  }
  if (!isSha256Hex(sha256)) throw new Error('Invalid SHA-256 in receipt.');
  if (!Number.isSafeInteger(slot) || slot < 0) throw new Error('Invalid slot in receipt.');
  if (blockTime !== 'unavailable' && Number.isNaN(Date.parse(blockTime))) {
    throw new Error('Invalid block time in receipt.');
  }

  return {
    receiptVersion,
    network,
    genesisHash,
    transaction,
    instructionIndex,
    program,
    sha256,
    slot,
    blockTime,
  };
}
