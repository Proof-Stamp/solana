import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVNET_GENESIS_HASH, MEMO_PROGRAM_ID } from '../src/lib/config';
import {
  fetchBlockHeight,
  fetchChainRecord,
  fetchSignatureStatus,
} from '../src/lib/rpc';

const SIGNATURE = '2'.repeat(88);
const HASH = 'a'.repeat(64);
const MEMO = `proofstamp:v1:sha256:${HASH}`;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) + BigInt(byte);

  let encoded = '';
  while (value > 0) {
    const remainder = Number(value % BigInt(58));
    encoded = BASE58_ALPHABET[remainder] + encoded;
    value /= BigInt(58);
  }

  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1;
  return '1'.repeat(leadingZeros) + (encoded || (leadingZeros === 0 ? '1' : ''));
}

function rpcResult(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function rpcError(message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    slot: 123456,
    blockTime: 1_789_000_000,
    meta: { err: null, loadedAddresses: null },
    transaction: {
      signatures: [SIGNATURE],
      message: {
        accountKeys: [MEMO_PROGRAM_ID],
        instructions: [
          {
            programIdIndex: 0,
            accounts: [],
            data: encodeBase58(new TextEncoder().encode(MEMO)),
          },
        ],
      },
    },
    version: 'legacy',
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchChainRecord', () => {
  it('validates a finalized canonical ProofStamp memo', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(transaction()));

    await expect(fetchChainRecord(SIGNATURE, 0)).resolves.toMatchObject({
      signature: SIGNATURE,
      instructionIndex: 0,
      program: MEMO_PROGRAM_ID,
      sha256: HASH,
      slot: 123456,
      genesisHash: DEVNET_GENESIS_HASH,
    });
  });

  it('validates a v0 transaction whose Memo program is in loaded addresses', async () => {
    const tx = transaction({
      version: 0,
      meta: {
        err: null,
        loadedAddresses: { writable: [], readonly: [MEMO_PROGRAM_ID] },
      },
      transaction: {
        signatures: [SIGNATURE],
        message: {
          accountKeys: ['11111111111111111111111111111111'],
          instructions: [
            {
              programIdIndex: 1,
              accounts: [],
              data: encodeBase58(new TextEncoder().encode(MEMO)),
            },
          ],
        },
      },
    });

    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(tx));

    await expect(fetchChainRecord(SIGNATURE, 0)).resolves.toMatchObject({
      program: MEMO_PROGRAM_ID,
      sha256: HASH,
    });
  });

  it('reports a missing finalized record separately', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(null));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({
      code: 'record_not_found',
    });
  });

  it('reports a failed transaction separately', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(transaction({ meta: { err: { InstructionError: [0, 'Custom'] } } })));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({
      code: 'transaction_failed',
    });
  });

  it('rejects an RPC on the wrong Solana network', async () => {
    fetchMock.mockResolvedValueOnce(rpcResult('wrong-genesis'));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({
      code: 'wrong_network',
    });
  });

  it('rejects an unsupported transaction version', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(transaction({ version: 1 })));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({
      code: 'unsupported_transaction',
    });
  });

  it('maps an RPC unsupported-version error distinctly', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcError('Unsupported transaction version'));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({
      code: 'unsupported_transaction',
    });
  });

  it('requires the requested transaction signature to match the returned transaction', async () => {
    const tx = transaction({
      transaction: {
        signatures: ['3'.repeat(88)],
        message: {
          accountKeys: [MEMO_PROGRAM_ID],
          instructions: [
            {
              programIdIndex: 0,
              accounts: [],
              data: encodeBase58(new TextEncoder().encode(MEMO)),
            },
          ],
        },
      },
    });

    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(tx));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({ code: 'invalid_record' });
  });

  it('requires the receipt instruction index to point to the ProofStamp memo', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(transaction()));

    await expect(fetchChainRecord(SIGNATURE, 1)).rejects.toMatchObject({
      code: 'invalid_record',
    });
  });

  it('rejects the wrong instruction program even if the data looks like ProofStamp', async () => {
    const tx = transaction({
      transaction: {
        signatures: [SIGNATURE],
        message: {
          accountKeys: ['11111111111111111111111111111111'],
          instructions: [
            {
              programIdIndex: 0,
              accounts: [],
              data: encodeBase58(new TextEncoder().encode(MEMO)),
            },
          ],
        },
      },
    });

    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(tx));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({ code: 'invalid_record' });
  });

  it('rejects malformed Memo instruction data', async () => {
    const tx = transaction();
    tx.transaction.message.instructions[0].data = '0';

    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(tx));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({ code: 'invalid_record' });
  });

  it('rejects ambiguous transactions containing more than one ProofStamp memo', async () => {
    const tx = transaction();
    const instruction = tx.transaction.message.instructions[0];
    tx.transaction.message.instructions.push({ ...instruction });

    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(tx));

    await expect(fetchChainRecord(SIGNATURE)).rejects.toMatchObject({
      code: 'invalid_record',
    });
  });

  it('reports an unavailable RPC separately', async () => {
    fetchMock.mockRejectedValue(new TypeError('network unavailable'));

    await expect(fetchChainRecord(SIGNATURE, 0)).rejects.toMatchObject({
      code: 'rpc_unavailable',
    });
  });
});

describe('confirmation helpers', () => {
  it('reads signature confirmation status with transaction history enabled', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(
        rpcResult({
          context: { slot: 123 },
          value: [{ slot: 123, confirmations: null, err: null, confirmationStatus: 'finalized' }],
        }),
      );

    await expect(fetchSignatureStatus(SIGNATURE)).resolves.toMatchObject({
      confirmationStatus: 'finalized',
      err: null,
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(requestBody.method).toBe('getSignatureStatuses');
    expect(requestBody.params[1]).toEqual({ searchTransactionHistory: true });
  });

  it('reads confirmed block height for expiry decisions', async () => {
    fetchMock
      .mockResolvedValueOnce(rpcResult(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(rpcResult(999));

    await expect(fetchBlockHeight()).resolves.toBe(999);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(requestBody.method).toBe('getBlockHeight');
    expect(requestBody.params).toEqual([{ commitment: 'confirmed' }]);
  });
});
