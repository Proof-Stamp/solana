import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubmissionOutcomeUnknownError, submitStamp } from '../src/lib/api';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
const HASH = 'a'.repeat(64);
const SIGNATURE = '1'.repeat(64);

function submittedResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      requestId: REQUEST_ID,
      sha256: HASH,
      signature: SIGNATURE,
      status: 'submitted',
      lastValidBlockHeight: 123,
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('submitStamp', () => {
  it('returns a validated submitted response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(submittedResponse()));

    await expect(submitStamp(REQUEST_ID, HASH)).resolves.toEqual({
      requestId: REQUEST_ID,
      sha256: HASH,
      signature: SIGNATURE,
      status: 'submitted',
      lastValidBlockHeight: 123,
    });
  });

  it('rejects a success response bound to a different request or digest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(submittedResponse({ sha256: 'b'.repeat(64) })));

    await expect(submitStamp(REQUEST_ID, HASH)).rejects.toBeInstanceOf(SubmissionOutcomeUnknownError);
  });

  it('rejects a malformed transaction signature in a success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(submittedResponse({ signature: 'not-a-signature' })));

    await expect(submitStamp(REQUEST_ID, HASH)).rejects.toBeInstanceOf(SubmissionOutcomeUnknownError);
  });

  it('rejects an invalid blockhash lifetime in a success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(submittedResponse({ lastValidBlockHeight: -1 })));

    await expect(submitStamp(REQUEST_ID, HASH)).rejects.toBeInstanceOf(SubmissionOutcomeUnknownError);
  });

  it('treats the explicit sponsor-disabled response as a known failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'ProofStamp creation is temporarily disabled. Verification remains available.',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    try {
      await submitStamp(REQUEST_ID, HASH);
      throw new Error('Expected submission to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SubmissionOutcomeUnknownError);
      expect((error as Error).message).toMatch(/temporarily disabled/i);
    }
  });

  it('treats a generic server failure as an unknown submission outcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Submission service error.' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(submitStamp(REQUEST_ID, HASH)).rejects.toBeInstanceOf(SubmissionOutcomeUnknownError);
  });

  it('treats a lost HTTP response as an unknown submission outcome', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')));

    await expect(submitStamp(REQUEST_ID, HASH)).rejects.toBeInstanceOf(SubmissionOutcomeUnknownError);
  });
});
