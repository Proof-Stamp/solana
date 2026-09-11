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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROTOCOL_PREFIX = 'proofstamp:v1:sha256:';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

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
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function publicRow(row) {
  return {
    requestId: row.request_id,
    sha256: row.digest,
    signature: row.signature ?? null,
    status: row.status,
    lastValidBlockHeight: row.last_valid_block_height ?? null,
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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

async function signatureStatus(env, signature) {
  const result = await rpcCall(env, 'getSignatureStatuses', [
    [signature],
    { searchTransactionHistory: true },
  ]);
  return result?.value?.[0] ?? null;
}

async function reserveRateLimit(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const salt = env.RATE_LIMIT_SALT || 'proofstamp-solana-devnet-local';
  const bucketStart = Math.floor(Date.now() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
  const material = new TextEncoder().encode(`${salt}:${ip}:${bucketStart}`);
  const digest = await crypto.subtle.digest('SHA-256', material);
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const limit = parsePositiveInt(env.REQUESTS_PER_5_MINUTES, 12);
  const expiresAt = new Date(bucketStart + FIVE_MINUTES_MS * 2).toISOString();

  const row = await env.DB.prepare(
    `INSERT INTO rate_buckets (bucket, request_count, expires_at)
     VALUES (?, 1, ?)
     ON CONFLICT(bucket) DO UPDATE SET request_count = request_count + 1
     WHERE request_count < ?
     RETURNING request_count`,
  )
    .bind(key, expiresAt, limit)
    .first();

  return !!row;
}

async function reserveDailyBudget(env) {
  const day = new Date().toISOString().slice(0, 10);
  const cap = parsePositiveInt(env.DAILY_TRANSACTION_CAP, 250);
  const row = await env.DB.prepare(
    `INSERT INTO daily_budget (day, tx_count)
     VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET tx_count = tx_count + 1
     WHERE tx_count < ?
     RETURNING tx_count`,
  )
    .bind(day, cap)
    .first();
  return !!row;
}

async function getRequest(env, requestId) {
  return env.DB.prepare('SELECT * FROM stamp_requests WHERE request_id = ?').bind(requestId).first();
}

async function cleanup(env) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM stamp_requests WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM rate_buckets WHERE expires_at < ?').bind(now),
  ]);
}

async function recoverExisting(row, env) {
  if (!row.signature || !row.signed_tx_base64 || !row.last_valid_block_height) {
    const age = Date.now() - Date.parse(row.updated_at);
    if (row.status === 'building' && age > 15_000) {
      return { action: 'rebuild', row };
    }
    return { action: 'return', row };
  }

  const status = await signatureStatus(env, row.signature);
  if (status) {
    if (status.err) {
      await env.DB.prepare(
        `UPDATE stamp_requests SET status = 'failed', updated_at = ? WHERE request_id = ?`,
      )
        .bind(new Date().toISOString(), row.request_id)
        .run();
      return { action: 'return', row: { ...row, status: 'failed' } };
    }
    if (row.status !== 'submitted') {
      await env.DB.prepare(
        `UPDATE stamp_requests SET status = 'submitted', updated_at = ? WHERE request_id = ?`,
      )
        .bind(new Date().toISOString(), row.request_id)
        .run();
    }
    return { action: 'return', row: { ...row, status: 'submitted' } };
  }

  const currentBlockHeight = Number(await rpcCall(env, 'getBlockHeight', [{ commitment: 'confirmed' }]));
  if (currentBlockHeight <= Number(row.last_valid_block_height)) {
    try {
      await broadcastSignedTransaction(env, row.signed_tx_base64);
      await env.DB.prepare(
        `UPDATE stamp_requests SET status = 'submitted', updated_at = ? WHERE request_id = ?`,
      )
        .bind(new Date().toISOString(), row.request_id)
        .run();
      return { action: 'return', row: { ...row, status: 'submitted' } };
    } catch {
      return { action: 'return', row };
    }
  }

  await env.DB.prepare(
    `UPDATE stamp_requests SET status = 'uncertain', updated_at = ? WHERE request_id = ?`,
  )
    .bind(new Date().toISOString(), row.request_id)
    .run();
  return { action: 'return', row: { ...row, status: 'uncertain' } };
}

async function createOrRecover(request, env, cors) {
  if (env.SUBMISSION_ENABLED !== 'true') {
    return json({ error: 'ProofStamp creation is temporarily disabled. Verification remains available.' }, 503, cors);
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

  const allowed = await reserveRateLimit(request, env);
  if (!allowed) return json({ error: 'Too many requests. Try again later.' }, 429, cors);

  await assertDevnet(env);

  const existing = await getRequest(env, requestId);
  if (existing) {
    if (existing.digest !== sha256) {
      return json({ error: 'This requestId is already bound to a different SHA-256.' }, 409, cors);
    }
    const recovered = await recoverExisting(existing, env);
    if (recovered.action === 'return') {
      return json(publicRow(recovered.row), recovered.row.status === 'building' ? 202 : 200, cors);
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ONE_DAY_MS).toISOString();

  if (!existing) {
    const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO stamp_requests
       (request_id, digest, status, created_at, updated_at, expires_at)
       VALUES (?, ?, 'building', ?, ?, ?)`,
    )
      .bind(requestId, sha256, now.toISOString(), now.toISOString(), expiresAt)
      .run();

    if (!inserted.meta?.changes) {
      const raced = await getRequest(env, requestId);
      if (!raced) return json({ error: 'Could not create request state.' }, 500, cors);
      if (raced.digest !== sha256) return json({ error: 'This requestId is already in use.' }, 409, cors);
      return json(publicRow(raced), 202, cors);
    }

    const budgetAvailable = await reserveDailyBudget(env);
    if (!budgetAvailable) {
      await env.DB.prepare('DELETE FROM stamp_requests WHERE request_id = ?').bind(requestId).run();
      return json({ error: 'The devnet transaction budget for today has been reached.' }, 429, cors);
    }
  } else {
    await env.DB.prepare(
      `UPDATE stamp_requests SET status = 'building', updated_at = ? WHERE request_id = ?`,
    )
      .bind(now.toISOString(), requestId)
      .run();
  }

  try {
    const signed = await buildSignedTransaction(env, sha256);
    const updatedAt = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE stamp_requests
       SET status = 'signed', signature = ?, signed_tx_base64 = ?, last_valid_block_height = ?, updated_at = ?
       WHERE request_id = ? AND digest = ?`,
    )
      .bind(
        signed.signature,
        signed.signedTxBase64,
        signed.lastValidBlockHeight,
        updatedAt,
        requestId,
        sha256,
      )
      .run();

    try {
      const returnedSignature = await broadcastSignedTransaction(env, signed.signedTxBase64);
      if (returnedSignature !== signed.signature) {
        throw new Error('RPC returned an unexpected transaction signature.');
      }
      await env.DB.prepare(
        `UPDATE stamp_requests SET status = 'submitted', updated_at = ? WHERE request_id = ?`,
      )
        .bind(new Date().toISOString(), requestId)
        .run();
      return json(
        publicRow({
          request_id: requestId,
          digest: sha256,
          signature: signed.signature,
          status: 'submitted',
          last_valid_block_height: signed.lastValidBlockHeight,
        }),
        200,
        cors,
      );
    } catch {
      return json(
        publicRow({
          request_id: requestId,
          digest: sha256,
          signature: signed.signature,
          status: 'signed',
          last_valid_block_height: signed.lastValidBlockHeight,
        }),
        202,
        cors,
      );
    }
  } catch (error) {
    await env.DB.prepare(
      `UPDATE stamp_requests SET status = 'failed', updated_at = ? WHERE request_id = ?`,
    )
      .bind(new Date().toISOString(), requestId)
      .run();
    return json({ error: error instanceof Error ? error.message : 'Could not build the Solana transaction.' }, 500, cors);
  }
}

async function getStatus(url, env, cors) {
  const requestId = url.searchParams.get('requestId') || '';
  if (!UUID_RE.test(requestId)) return json({ error: 'Invalid requestId.' }, 400, cors);
  const row = await getRequest(env, requestId);
  if (!row) return json({ error: 'Request not found.' }, 404, cors);
  return json(publicRow(row), 200, cors);
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (cors === null) return json({ error: 'Origin is not allowed.' }, 403);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/stamps') {
      return json({ error: 'Not found.' }, 404, cors);
    }

    ctx.waitUntil(cleanup(env).catch(() => undefined));

    try {
      if (request.method === 'POST') return await createOrRecover(request, env, cors);
      if (request.method === 'GET') return await getStatus(url, env, cors);
      return json({ error: 'Method not allowed.' }, 405, { ...cors, allow: 'GET, POST, OPTIONS' });
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
