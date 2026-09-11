import { describe, expect, it, vi } from 'vitest';
import type { StampSubmission } from '../src/lib/api';
import {
  waitForFinalizedProofStamp,
  type ConfirmationDependencies,
} from '../src/lib/confirmation';
import { VerificationError, type ChainRecord, type SignatureStatus } from '../src/lib/rpc';

const HASH = 'a'.repeat(64);
const SIGNATURE = '2'.repeat(88);

const submission: StampSubmission = {
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  sha256: HASH,
  signature: SIGNATURE,
  status: 'submitted',
  lastValidBlockHeight: 100,
};

const finalizedStatus: SignatureStatus = {
  slot: 50,
  confirmations: null,
  err: null,
  confirmationStatus: 'finalized',
};

const record: ChainRecord = {
  signature: SIGNATURE,
  instructionIndex: 0,
  program: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  sha256: HASH,
  slot: 50,
  blockTime: 1_789_000_000,
  genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  rpcUrl: 'https://api.devnet.solana.com',
};

function deps(overrides: Partial<ConfirmationDependencies> = {}): ConfirmationDependencies {
  return {
    getSignatureStatus: vi.fn().mockResolvedValue(finalizedStatus),
    getBlockHeight: vi.fn().mockResolvedValue(50),
    getChainRecord: vi.fn().mockResolvedValue(record),
    sleep: vi.fn().mockResolvedValue(undefined),
    isCancelled: () => false,
    ...overrides,
  };
}

describe('waitForFinalizedProofStamp', () => {
  it('returns only after finalized chain read-back matches the expected digest', async () => {
    await expect(waitForFinalizedProofStamp(submission, HASH, deps(), 2)).resolves.toEqual(record);
  });

  it('reports a transaction execution failure', async () => {
    const failed: SignatureStatus = {
      ...finalizedStatus,
      err: { InstructionError: [0, 'Custom'] },
    };

    await expect(
      waitForFinalizedProofStamp(
        submission,
        HASH,
        deps({ getSignatureStatus: vi.fn().mockResolvedValue(failed) }),
        1,
      ),
    ).rejects.toMatchObject({ code: 'transaction_failed' });
  });

  it('reports expiry only when the signature is absent past lastValidBlockHeight', async () => {
    await expect(
      waitForFinalizedProofStamp(
        submission,
        HASH,
        deps({
          getSignatureStatus: vi.fn().mockResolvedValue(null),
          getBlockHeight: vi.fn().mockResolvedValue(101),
        }),
        1,
      ),
    ).rejects.toMatchObject({ code: 'expired' });
  });

  it('retries a temporary finalized read-back lag', async () => {
    const getChainRecord = vi
      .fn()
      .mockRejectedValueOnce(new VerificationError('record_not_found', 'not indexed yet'))
      .mockResolvedValueOnce(record);
    const dependencies = deps({ getChainRecord });

    await expect(waitForFinalizedProofStamp(submission, HASH, dependencies, 2)).resolves.toEqual(record);
    expect(getChainRecord).toHaveBeenCalledTimes(2);
    expect(dependencies.sleep).toHaveBeenCalledTimes(1);
  });

  it('retries a temporary RPC outage', async () => {
    const getSignatureStatus = vi
      .fn()
      .mockRejectedValueOnce(new VerificationError('rpc_unavailable', 'temporary outage'))
      .mockResolvedValueOnce(finalizedStatus);

    await expect(
      waitForFinalizedProofStamp(submission, HASH, deps({ getSignatureStatus }), 2),
    ).resolves.toEqual(record);
  });

  it('refuses success when public read-back returns a different digest', async () => {
    await expect(
      waitForFinalizedProofStamp(
        submission,
        HASH,
        deps({ getChainRecord: vi.fn().mockResolvedValue({ ...record, sha256: 'b'.repeat(64) }) }),
        1,
      ),
    ).rejects.toThrow(/different SHA-256/i);
  });

  it('stops if the caller cancels confirmation polling', async () => {
    await expect(
      waitForFinalizedProofStamp(submission, HASH, deps({ isCancelled: () => true }), 1),
    ).rejects.toThrow(/cancelled/i);
  });
});
