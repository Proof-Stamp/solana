import {
  appendTransactionMessageInstruction,
  blockhash,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit';
import { getAddMemoInstruction } from '@solana-program/memo';

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const SHA256_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const PROTOCOL_PREFIX = 'proofstamp:v1:sha256:';

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function assertRpcUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('SOLANA_RPC_URL must use HTTPS.');
  }
  return url.toString();
}

async function rpcCall(env, method, params = []) {
  const rpcUrl = assertRpcUrl(env.SOLANA_RPC_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Solana RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'Solana RPC error');
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertDevnet(env) {
  if (!env.SOLANA_EXPECTED_GENESIS_HASH) {
    throw new Error('SOLANA_EXPECTED_GENESIS_HASH is not configured.');
  }
  const genesisHash = await rpcCall(env, 'getGenesisHash');
  if (genesisHash !== env.SOLANA_EXPECTED_GENESIS_HASH) {
    throw new Error(`RPC genesis hash mismatch. Expected ${env.SOLANA_EXPECTED_GENESIS_HASH}.`);
  }
  return genesisHash;
}

function parseSecretBytes(raw) {
  if (!raw) throw new Error('SOLANA_FEE_PAYER_SECRET is not configured.');
  const value = raw.trim();
  let bytes;
  if (value.startsWith('[')) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Fee payer secret must be a byte array or base64 string.');
    bytes = Uint8Array.from(parsed);
  } else {
    const binary = atob(value);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (bytes.length !== 64) {
    throw new Error(`Fee payer secret must contain 64 bytes; received ${bytes.length}.`);
  }
  return bytes;
}

async function buildSignedTransaction(env, digest) {
  const latest = await rpcCall(env, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const signer = await createKeyPairSignerFromBytes(parseSecretBytes(env.SOLANA_FEE_PAYER_SECRET));
  const memo = `${PROTOCOL_PREFIX}${digest}`;

  const message = pipe(
    createTransactionMessage({ version: 'legacy' }),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash(latest.value.blockhash),
          lastValidBlockHeight: BigInt(latest.value.lastValidBlockHeight),
        },
        tx,
      ),
    (tx) => appendTransactionMessageInstruction(getAddMemoInstruction({ memo }), tx),
  );

  const transaction = await signTransactionMessageWithSigners(message);
  return {
    signature: getSignatureFromTransaction(transaction),
    signedTxBase64: getBase64EncodedWireTransaction(transaction),
    lastValidBlockHeight: Number(latest.value.lastValidBlockHeight),
  };
}

async function broadcastSignedTransaction(env, signedTxBase64) {
  return rpcCall(env, 'sendTransaction', [
    signedTxBase64,
    {
      encoding: 'base64',
      preflightCommitment: 'confirmed',
      skipPreflight: false,
      maxRetries: 3,
    },
  ]);
}

async function createStamp(request, env, cors) {
  if (env.SUBMISSION_ENABLED !== 'true') {
    return json(
      { error: 'ProofStamp creation is temporarily disabled. Verification remains available.' },
      503,
      cors,
    );
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 1024) return json({ error: 'Request body is too large.' }, 413, cors);

  const text = await request.text();
  if (new TextEncoder().encode(text).length > 1024) {
    return json({ error: 'Request body is too large.' }, 413, cors);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400, cors);
  }

  const { protocolVersion, requestId, sha256 } = body ?? {};
  if (protocolVersion !== 1) return json({ error: 'Unsupported protocol version.' }, 400, cors);
  if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) {
    return json({ error: 'requestId must be a UUID v4.' }, 400, cors);
  }
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) {
    return json({ error: 'sha256 must be 64 lowercase hexadecimal characters.' }, 400, cors);
  }

  await assertDevnet(env);

  const signed = await buildSignedTransaction(env, sha256);
  const returnedSignature = await broadcastSignedTransaction(env, signed.signedTxBase64);
  if (returnedSignature !== signed.signature) {
    throw new Error('RPC returned an unexpected transaction signature.');
  }

  return json(
    {
      requestId,
      sha256,
      signature: signed.signature,
      status: 'submitted',
      lastValidBlockHeight: signed.lastValidBlockHeight,
    },
    200,
    cors,
  );
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (cors === null) return json({ error: 'Origin is not allowed.' }, 403);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/stamps') {
      return json({ error: 'Not found.' }, 404, cors);
    }

    try {
      if (request.method === 'POST') return await createStamp(request, env, cors);
      return json({ error: 'Method not allowed.' }, 405, { ...cors, allow: 'POST, OPTIONS' });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Submission service error.' },
        500,
        cors,
      );
    }
  },
};

export { MEMO_PROGRAM_ID };
