import { SubmissionOutcomeUnknownError } from './api';
import { VerificationError } from './rpc';

export type CreationRecovery =
  | 'none'
  | 'submission-unknown'
  | 'recheck-known-signature'
  | 'known-signature-failed';

export function classifyCreationRecovery(error: unknown, hasKnownSignature: boolean): CreationRecovery {
  if (error instanceof SubmissionOutcomeUnknownError) return 'submission-unknown';
  if (!hasKnownSignature) return 'none';

  if (
    error instanceof VerificationError &&
    (error.code === 'transaction_failed' || error.code === 'expired')
  ) {
    return 'known-signature-failed';
  }

  // Once a signature is known, an RPC/read-back/timeout error must not make a fresh
  // submission the default recovery path. Re-check the known public transaction.
  return 'recheck-known-signature';
}

export class AsyncOperationGate {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(token: number): boolean {
    return token === this.generation;
  }
}
