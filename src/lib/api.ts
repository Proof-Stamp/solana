import { SUBMIT_API_BASE } from './config';

export interface StampSubmission {
  requestId: string;
  sha256: string;
  signature: string | null;
  status: 'building' | 'submitted';
  lastValidBlockHeight: number | null;
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

async function parseResponse(response: Response): Promise<StampSubmission> {
  const body = (await response.json().catch(() => null)) as
    | (StampSubmission & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok) {
    const message = body?.error || `Submission service returned HTTP ${response.status}.`;
    if (response.status >= 500) {
      throw new SubmissionOutcomeUnknownError(
        `${message} The request may already have reached Solana, so it will not be retried automatically.`,
      );
    }
    throw new Error(message);
  }

  if (!body || !('requestId' in body) || !('sha256' in body) || !('status' in body)) {
    throw new SubmissionOutcomeUnknownError(
      'The submission service returned an incomplete response. The request may already have reached Solana.',
    );
  }

  return body as StampSubmission;
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

  return parseResponse(response);
}
