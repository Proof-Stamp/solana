import { describe, expect, it } from 'vitest';
import worker from '../worker/index.mjs';

const APP = 'https://solana.example';
const VALID_REQUEST = {
  protocolVersion: 1,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  sha256: 'a'.repeat(64),
};

function request(body = VALID_REQUEST, init = {}) {
  return new Request(`${APP}/api/stamps`, {
    method: 'POST',
    headers: {
      origin: APP,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

async function body(response) {
  return response.json();
}

describe('sponsored submission endpoint', () => {
  it('keeps creation disabled unless explicitly enabled', async () => {
    const response = await worker.fetch(request(), { SUBMISSION_ENABLED: 'false' });
    expect(response.status).toBe(503);
    await expect(body(response)).resolves.toMatchObject({
      error: expect.stringMatching(/disabled/i),
    });
  });

  it('rejects cross-origin browser requests', async () => {
    const response = await worker.fetch(
      request(VALID_REQUEST, { headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }),
      { SUBMISSION_ENABLED: 'true', ALLOWED_ORIGIN: APP },
    );
    expect(response.status).toBe(403);
  });

  it('requires JSON content type', async () => {
    const response = await worker.fetch(
      request(JSON.stringify(VALID_REQUEST), { headers: { origin: APP, 'content-type': 'text/plain' } }),
      { SUBMISSION_ENABLED: 'true' },
    );
    expect(response.status).toBe(415);
  });

  it('rejects fields that could widen the transaction boundary', async () => {
    const response = await worker.fetch(
      request({ ...VALID_REQUEST, filename: 'private.pdf' }),
      { SUBMISSION_ENABLED: 'true' },
    );
    expect(response.status).toBe(400);
    await expect(body(response)).resolves.toMatchObject({
      error: expect.stringMatching(/unsupported fields/i),
    });
  });

  it('rejects uppercase or malformed digests before any RPC call', async () => {
    const response = await worker.fetch(
      request({ ...VALID_REQUEST, sha256: 'A'.repeat(64) }),
      { SUBMISSION_ENABLED: 'true' },
    );
    expect(response.status).toBe(400);
  });

  it('rejects oversized request bodies', async () => {
    const response = await worker.fetch(
      request(JSON.stringify({ ...VALID_REQUEST, padding: 'x'.repeat(2000) })),
      { SUBMISSION_ENABLED: 'true' },
    );
    expect(response.status).toBe(413);
  });
});
