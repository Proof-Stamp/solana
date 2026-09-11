import { SUBMIT_API_BASE } from './config';

export interface StampSubmission {
  requestId: string;
  sha256: string;
  signature: string | null;
  status: 'submitted';
  lastValidBlockHeight: number | null;
}

const attemptedRequestIds = new Set<string>();

function endpoint(): string {
  return `${SUBMIT_API_BASE}/api/stamps`;
}

async function parseResponse(response: Response): Promise<StampSubmission> {
  const body = (await response.json().catch(() => null)) as
    | (StampSubmission & { error?: string })
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(body?.error || `Submission service returned HTTP ${response.status}.`);
  }
  return body as StampSubmission;
}

export async function submitStamp(requestId: string, sha256: string): Promise<StampSubmission> {
  if (attemptedRequestIds.has(requestId)) {
    throw new Error(
      'This submission will not be retried automatically because v1 does not keep server-side recovery state.',
    );
  }
  attemptedRequestIds.add(requestId);

  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 1, requestId, sha256 }),
  });
  return parseResponse(response);
}
