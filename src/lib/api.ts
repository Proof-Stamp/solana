import { SUBMIT_API_BASE } from './config';

export interface StampSubmission {
  requestId: string;
  sha256: string;
  signature: string | null;
  status: 'building' | 'signed' | 'submitted' | 'uncertain' | 'failed';
  lastValidBlockHeight: number | null;
}

function endpoint(path = ''): string {
  return `${SUBMIT_API_BASE}/api/stamps${path}`;
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
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 1, requestId, sha256 }),
  });
  return parseResponse(response);
}

export async function recoverStamp(requestId: string): Promise<StampSubmission> {
  const response = await fetch(endpoint(`?requestId=${encodeURIComponent(requestId)}`), {
    method: 'GET',
  });
  return parseResponse(response);
}
