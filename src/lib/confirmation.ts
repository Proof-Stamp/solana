import type { StampSubmission } from './api';
import {
  fetchBlockHeight,
  fetchChainRecord,
  fetchSignatureStatus,
  VerificationError,
  type ChainRecord,
  type SignatureStatus,
} from './rpc';

export interface ConfirmationDependencies {
  getSignatureStatus: (signature: string) => Promise<SignatureStatus | null>;
  getBlockHeight: () => Promise<number>;
  getChainRecord: (signature: string) => Promise<ChainRecord>;
  sleep: () => Promise<void>;
  isCancelled: () => boolean;
  onStatus?: (status: SignatureStatus | null) => void;
}

const defaultDependencies: ConfirmationDependencies = {
  getSignatureStatus: (signature) => fetchSignatureStatus(signature),
  getBlockHeight: () => fetchBlockHeight(),
  getChainRecord: (signature) => fetchChainRecord(signature),
  sleep: () => new Promise((resolve) => setTimeout(resolve, 2000)),
  isCancelled: () => false,
};

export async function waitForFinalizedProofStamp(
  current: StampSubmission,
  expectedHash: string,
  dependencies: ConfirmationDependencies = defaultDependencies,
  maxAttempts = 90,
): Promise<ChainRecord> {
  if (!current.signature) {
    throw new Error('The submission service did not return a transaction signature.');
  }

  let lastTransientError: VerificationError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (dependencies.isCancelled()) throw new Error('Checking was cancelled.');

    let status: SignatureStatus | null;
    try {
      status = await dependencies.getSignatureStatus(current.signature);
      dependencies.onStatus?.(status);
    } catch (error) {
      if (error instanceof VerificationError && error.code === 'rpc_unavailable') {
        lastTransientError = error;
        await dependencies.sleep();
        continue;
      }
      throw error;
    }

    if (status?.err != null) {
      throw new VerificationError('transaction_failed', 'The Solana transaction failed.');
    }

    if (status?.confirmationStatus === 'finalized') {
      try {
        const record = await dependencies.getChainRecord(current.signature);
        if (record.sha256 !== expectedHash) {
          throw new Error('Public read-back returned a different SHA-256. Creation stopped.');
        }
        return record;
      } catch (error) {
        if (
          error instanceof VerificationError &&
          (error.code === 'record_not_found' || error.code === 'rpc_unavailable')
        ) {
          lastTransientError = error;
          await dependencies.sleep();
          continue;
        }
        throw error;
      }
    }

    if (!status && current.lastValidBlockHeight !== null) {
      try {
        const blockHeight = await dependencies.getBlockHeight();
        if (blockHeight > current.lastValidBlockHeight) {
          throw new VerificationError('expired', 'The transaction was not found before its blockhash expired.');
        }
      } catch (error) {
        if (error instanceof VerificationError && error.code === 'rpc_unavailable') {
          lastTransientError = error;
          await dependencies.sleep();
          continue;
        }
        throw error;
      }
    }

    await dependencies.sleep();
  }

  throw lastTransientError ?? new VerificationError('pending', 'The transaction is still waiting for final confirmation.');
}
