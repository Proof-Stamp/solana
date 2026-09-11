import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker/index.mjs';

const APP = 'https://solana.example';
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const VALID_REQUEST = {
  protocolVersion: 1,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  sha256: 'a'.repeat(64),
};

function request(body = VALID_REQUEST, init = {}) {
  const { headers: extraHeaders = {}, ...rest } = init;
  return new Request(`${APP}/api/stamps`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...rest,
    headers: {
      origin: APP,
      'content-type': 'application/json',
      ...extraHeaders,
    },
  });
}

async function body(response) {
  return response.json();
}

function rpcResult(result) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function encodeBase58(bytes) {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) + BigInt(byte);

  let encoded = '';
  while (value > 0) {
    const remainder = Number(value % BigInt(58));
    encoded = BASE58_ALPHABET[remainder] + encoded;
    value /= BigInt(58);
  }

  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1;
  return '1'.repeat(leadingZeros) + encoded;
}

function base64Secret32() {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  return btoa(String.fromCharCode(...bytes));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('constructs, signs, and broadcasts the fixed sponsored transaction server-side', async () => {
    const rpcFetch = vi.fn(async (_url, init) => {
      const payload = JSON.parse(String(init?.body));

      if (payload.method === 'getGenesisHash') {
        return rpcResult(DEVNET_GENESIS);
      }
      if (payload.method === 'getLatestBlockhash') {
        return rpcResult({
          context: { slot: 50 },
          value: {
            blockhash: '11111111111111111111111111111111',
            lastValidBlockHeight: 123,
          },
        });
      }
      if (payload.method === 'sendTransaction') {
        const wire = Uint8Array.from(atob(payload.params[0]), (char) => char.charCodeAt(0));
        expect(wire[0]).toBe(1);
        const signature = encodeBase58(wire.slice(1, 65));
        expect(payload.params[1]).toMatchObject({
          encoding: 'base64',
          preflightCommitment: 'confirmed',
          skipPreflight: false,
          maxRetries: 3,
        });
        return rpcResult(signature);
      }
      throw new Error(`Unexpected RPC method: ${payload.method}`);
    });
    vi.stubGlobal('fetch', rpcFetch);

    const response = await worker.fetch(request(), {
      SUBMISSION_ENABLED: 'true',
      SOLANA_RPC_URL: 'https://rpc.example',
      SOLANA_EXPECTED_GENESIS_HASH: DEVNET_GENESIS,
      SOLANA_FEE_PAYER_SECRET: base64Secret32(),
    });

    expect(response.status).toBe(200);
    await expect(body(response)).resolves.toMatchObject({
      requestId: VALID_REQUEST.requestId,
      sha256: VALID_REQUEST.sha256,
      status: 'submitted',
      lastValidBlockHeight: 123,
      signature: expect.stringMatching(/^[1-9A-HJ-NP-Za-km-z]+$/),
    });
    expect(rpcFetch).toHaveBeenCalledTimes(3);
  });
});
