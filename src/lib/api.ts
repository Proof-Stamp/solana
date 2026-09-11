import { decodeBase58 } from './base58';
import { SUBMIT_API_BASE } from './config';

export interface StampSubmission {
  requestId: string;
  sha256: string;
  signature: string;
  status: 'submitted';
  lastValidBlockHeight: number;
}

export class SubmissionOutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionOutcomeUnknownError';
  }
}

function endpoint(): string {
  return `${SUBMIT_API_BASE}/api/stamps`;
}

function hasValidSignature(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return decodeBase58(value).length === 64;
  } catch {
    return false;
  }
}

function responseIsValid(
  body: unknown,
  expectedRequestId: string,
  expectedSha256: string,
): body is StampSubmission {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const candidate = body as Record<string, unknown>;
  return (
    candidate.requestId === expectedRequestId &&
    candidate.sha256 === expectedSha256 &&
    candidate.status === 'submitted' &&
    hasValidSignature(candidate.signature) &&
    Number.isSafeInteger(candidate.lastValidBlockHeight) &&
    Number(candidate.lastValidBlockHeight) >= 0
  );
}

async function parseResponse(
  response: Response,
  expectedRequestId: string,
  expectedSha256: string,
): Promise<StampSubmission> {
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const errorMessage =
      body && typeof body === 'object' && !Array.isArray(body) && typeof (body as Record<string, unknown>).error === 'string'
        ? String((body as Record<string, unknown>).error)
        : `Submission service returned HTTP ${response.status}.`;
    const creationDefinitelyDisabled =
      response.status === 503 && /creation is temporarily disabled/i.test(errorMessage);

    if (response.status >= 500 && !creationDefinitelyDisabled) {
      throw new SubmissionOutcomeUnknownError(
        `${errorMessage} The request may already have reached Solana, so it will not be retried automatically.`,
      );
    }
    throw new Error(errorMessage);
  }

  if (!responseIsValid(body, expectedRequestId, expectedSha256)) {
    throw new SubmissionOutcomeUnknownError(
      'The submission service returned an invalid response. The request may already have reached Solana, so it will not be retried automatically.',
    );
  }

  return body;
}

export async function submitStamp(requestId: string, sha256: string): Promise<StampSubmission> {
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, requestId, sha256 }),
    });
  } catch {
    throw new SubmissionOutcomeUnknownError(
      'The submission response was lost. The request may already have reached Solana, so it will not be retried automatically.',
    );
  }

  return parseResponse(response, requestId, sha256);
}
