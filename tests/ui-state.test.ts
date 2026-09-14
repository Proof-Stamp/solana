import { describe, expect, it } from 'vitest';
import { SubmissionOutcomeUnknownError } from '../src/lib/api';
import { VerificationError } from '../src/lib/rpc';
import { AsyncOperationGate, classifyCreationRecovery } from '../src/lib/ui-state';

describe('AsyncOperationGate', () => {
  it('prevents an older async result from being treated as current after input changes', () => {
    const gate = new AsyncOperationGate();
    const firstRun = gate.begin();
    expect(gate.isCurrent(firstRun)).toBe(true);

    gate.invalidate();
    expect(gate.isCurrent(firstRun)).toBe(false);

    const secondRun = gate.begin();
    expect(gate.isCurrent(secondRun)).toBe(true);
    expect(gate.isCurrent(firstRun)).toBe(false);
  });
});

describe('classifyCreationRecovery', () => {
  it('blocks blind retry when submission outcome is unknown', () => {
    expect(
      classifyCreationRecovery(new SubmissionOutcomeUnknownError('response lost'), false),
    ).toBe('submission-unknown');
  });

  it('rechecks a known signature after pending or RPC failures', () => {
    expect(
      classifyCreationRecovery(new VerificationError('pending', 'still pending'), true),
    ).toBe('recheck-known-signature');
    expect(
      classifyCreationRecovery(new VerificationError('rpc_unavailable', 'offline'), true),
    ).toBe('recheck-known-signature');
  });

  it('allows a new submission only after a known transaction has definitely failed or expired', () => {
    expect(
      classifyCreationRecovery(new VerificationError('transaction_failed', 'failed'), true),
    ).toBe('known-signature-failed');
    expect(
      classifyCreationRecovery(new VerificationError('expired', 'expired'), true),
    ).toBe('known-signature-failed');
  });
});
