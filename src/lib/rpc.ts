import { decodeBase58 } from './base58';
import { DEVNET_GENESIS_HASH, FALLBACK_RPC, MEMO_PROGRAM_ID, PRIMARY_RPC } from './config';
import { decodeProofStampMemo } from './protocol';

export type VerificationErrorCode =
  | 'rpc_unavailable'
  | 'pending'
  | 'record_not_found'
  | 'wrong_network'
  | 'unsupported_transaction'
  | 'invalid_record'
  | 'transaction_failed'
  | 'expired';

export class VerificationError extends Error {
  constructor(
    public readonly code: VerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

interface RpcErrorShape {
  code?: number;
  message?: string;
}

interface RpcEnvelope<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: RpcErrorShape;
}

interface CompiledInstruction {
  programIdIndex: number;
  accounts: number[];
  data: string;
}

interface TransactionResponse {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    loadedAddresses?: {
      writable?: string[];
      readonly?: string[];
    } | null;
  } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: string[];
      instructions: CompiledInstruction[];
    };
  };
  version?: 'legacy' | number;
}

interface SignatureStatusesResponse {
  value: Array<SignatureStatus | null>;
}

export interface SignatureStatus {
  slot: number;
  confirmations: number | null;
  err: unknown;
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized' | null;
}

export interface ChainRecord {
  signature: string;
  instructionIndex: number;
  program: string;
  sha256: string;
  slot: number;
  blockTime: number | null;
  genesisHash: string;
  rpcUrl: string;
}

function assertHttpsRpc(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new VerificationError('rpc_unavailable', 'RPC URL is invalid.');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new VerificationError('rpc_unavailable', 'RPC must use HTTPS.');
  }
}

async function rpcCall<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  assertHttpsRpc(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const envelope = (await response.json()) as RpcEnvelope<T>;
    if (envelope.error) {
      const message = envelope.error.message || 'RPC returned an error.';
      if (/unsupported transaction version/i.test(message)) {
        throw new VerificationError('unsupported_transaction', message);
      }
      throw new Error(message);
    }
    return envelope.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertExpectedNetwork(rpcUrl: string): Promise<string> {
  let genesisHash: string;
  try {
    genesisHash = await rpcCall<string>(rpcUrl, 'getGenesisHash');
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw new VerificationError('rpc_unavailable', 'Could not read the Solana network identity.');
  }

  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new VerificationError('wrong_network', 'The selected RPC is not the configured Solana devnet.');
  }
  return genesisHash;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new VerificationError('invalid_record', 'Memo is not valid UTF-8.');
  }
}

async function verifyWithRpc(
  rpcUrl: string,
  signature: string,
  expectedInstructionIndex?: number,
): Promise<ChainRecord> {
  const genesisHash = await assertExpectedNetwork(rpcUrl);

  let response: TransactionResponse | null;
  try {
    response = await rpcCall<TransactionResponse | null>(rpcUrl, 'getTransaction', [
      signature,
      {
        commitment: 'finalized',
        encoding: 'json',
        maxSupportedTransactionVersion: 0,
      },
    ]);
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw new VerificationError('rpc_unavailable', 'Could not read the public Solana record.');
  }

  if (!response) {
    throw new VerificationError('record_not_found', 'No finalized transaction was found for this signature.');
  }
  if (!response.meta) {
    throw new VerificationError('invalid_record', 'The transaction does not include execution metadata.');
  }
  if (response.meta.err !== null) {
    throw new VerificationError('transaction_failed', 'The Solana transaction failed and cannot be a ProofStamp.');
  }
  if (response.transaction.signatures[0] !== signature) {
    throw new VerificationError('invalid_record', 'The returned transaction signature does not match the requested record.');
  }
  if (response.version !== undefined && response.version !== 'legacy' && response.version !== 0) {
    throw new VerificationError('unsupported_transaction', 'This transaction version is not supported.');
  }

  const staticKeys = response.transaction.message.accountKeys;
  const loaded = response.meta.loadedAddresses;
  const allKeys = [...staticKeys, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])];
  const instructions = response.transaction.message.instructions;

  const indexes = expectedInstructionIndex === undefined
    ? instructions.map((_, index) => index)
    : [expectedInstructionIndex];

  const candidates: ChainRecord[] = [];
  for (const index of indexes) {
    const instruction = instructions[index];
    if (!instruction) continue;
    const program = allKeys[instruction.programIdIndex];
    if (program !== MEMO_PROGRAM_ID) continue;

    let text: string;
    try {
      text = decodeUtf8(decodeBase58(instruction.data));
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      continue;
    }

    let sha256: string;
    try {
      sha256 = decodeProofStampMemo(text);
    } catch {
      continue;
    }

    candidates.push({
      signature,
      instructionIndex: index,
      program,
      sha256,
      slot: response.slot,
      blockTime: response.blockTime,
      genesisHash,
      rpcUrl,
    });
  }

  if (candidates.length !== 1) {
    throw new VerificationError(
      'invalid_record',
      expectedInstructionIndex === undefined
        ? 'The transaction does not contain exactly one supported ProofStamp Memo.'
        : 'The receipt does not point to a supported ProofStamp Memo.',
    );
  }

  return candidates[0];
}

function rpcCandidates(customRpc?: string): string[] {
  const urls = [customRpc?.trim() || '', PRIMARY_RPC, FALLBACK_RPC].filter(Boolean);
  return [...new Set(urls)];
}

export async function fetchChainRecord(
  signature: string,
  expectedInstructionIndex?: number,
  customRpc?: string,
): Promise<ChainRecord> {
  let lastError: VerificationError | null = null;
  for (const rpcUrl of rpcCandidates(customRpc)) {
    try {
      return await verifyWithRpc(rpcUrl, signature, expectedInstructionIndex);
    } catch (error) {
      if (!(error instanceof VerificationError)) {
        lastError = new VerificationError('rpc_unavailable', 'Could not check the public record.');
        continue;
      }
      if (
        error.code === 'wrong_network' ||
        error.code === 'invalid_record' ||
        error.code === 'unsupported_transaction' ||
        error.code === 'transaction_failed'
      ) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError ?? new VerificationError('rpc_unavailable', 'No RPC endpoint is configured.');
}

export async function fetchSignatureStatus(
  signature: string,
  customRpc?: string,
): Promise<SignatureStatus | null> {
  let lastError: VerificationError | null = null;
  for (const rpcUrl of rpcCandidates(customRpc)) {
    try {
      await assertExpectedNetwork(rpcUrl);
      const result = await rpcCall<SignatureStatusesResponse>(rpcUrl, 'getSignatureStatuses', [
        [signature],
        { searchTransactionHistory: true },
      ]);
      return result.value[0] ?? null;
    } catch (error) {
      if (error instanceof VerificationError && error.code === 'wrong_network') throw error;
      lastError = error instanceof VerificationError
        ? error
        : new VerificationError('rpc_unavailable', 'Could not read transaction status.');
    }
  }
  throw lastError ?? new VerificationError('rpc_unavailable', 'No RPC endpoint is configured.');
}

export async function fetchBlockHeight(customRpc?: string): Promise<number> {
  let lastError: VerificationError | null = null;
  for (const rpcUrl of rpcCandidates(customRpc)) {
    try {
      await assertExpectedNetwork(rpcUrl);
      return await rpcCall<number>(rpcUrl, 'getBlockHeight', [{ commitment: 'confirmed' }]);
    } catch (error) {
      if (error instanceof VerificationError && error.code === 'wrong_network') throw error;
      lastError = error instanceof VerificationError
        ? error
        : new VerificationError('rpc_unavailable', 'Could not read the current Solana block height.');
    }
  }
  throw lastError ?? new VerificationError('rpc_unavailable', 'No RPC endpoint is configured.');
}
