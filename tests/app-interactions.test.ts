// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { DEVNET_GENESIS_HASH, MEMO_PROGRAM_ID, NETWORK_LABEL, RECEIPT_VERSION } from '../src/lib/config';
import { formatReceipt, type ProofStampReceipt } from '../src/lib/receipt';

const HASH_HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const BLOCK_TIME = 1_789_000_000;
const SLOT = 123456;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
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
  return '1'.repeat(leadingZeros) + (encoded || (leadingZeros === 0 ? '1' : ''));
}

const SIGNATURE_A = encodeBase58(Uint8Array.from({ length: 64 }, (_, index) => index + 1));
const SIGNATURE_B = encodeBase58(Uint8Array.from({ length: 64 }, (_, index) => 64 - index));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function receipt(signature: string, hash = HASH_HELLO): string {
  const value: ProofStampReceipt = {
    receiptVersion: RECEIPT_VERSION,
    network: NETWORK_LABEL,
    genesisHash: DEVNET_GENESIS_HASH,
    transaction: signature,
    instructionIndex: 0,
    program: MEMO_PROGRAM_ID,
    sha256: hash,
    slot: SLOT,
    blockTime: new Date(BLOCK_TIME * 1000).toISOString(),
  };
  return formatReceipt(value);
}

function rpcResult(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function transaction(signature: string, hash: string) {
  const memo = `proofstamp:v1:sha256:${hash}`;
  return {
    slot: SLOT,
    blockTime: BLOCK_TIME,
    meta: { err: null, loadedAddresses: null },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [MEMO_PROGRAM_ID],
        instructions: [
          {
            programIdIndex: 0,
            accounts: [],
            data: encodeBase58(new TextEncoder().encode(memo)),
          },
        ],
      },
    },
    version: 'legacy',
  };
}

function fetchPayload(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

function receiptInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"][accept=".txt,text/plain"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Receipt input not found.');
  return input;
}

function fileInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll('input[type="file"]')].filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement,
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitFor<T>(read: () => T | null | undefined, timeoutMs = 1000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error('Timed out waiting for UI state.');
}

async function click(label: string) {
  await act(async () => {
    button(label).click();
  });
  await flush();
}

async function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

async function setText(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('Input value setter is unavailable.');

  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}

function delayedTextFile(name: string, pending: Promise<string>): File {
  const file = new File(['placeholder'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { configurable: true, value: () => pending });
  return file;
}

function verificationFetch(
  transactionResponse: (signature: string, call: number) => Response | Promise<Response>,
) {
  let transactionCalls = 0;
  const seenSignatures: string[] = [];

  const mock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = fetchPayload(init);
    if (payload.method === 'getGenesisHash') return rpcResult(DEVNET_GENESIS_HASH);
    if (payload.method === 'getTransaction') {
      transactionCalls += 1;
      const params = payload.params as unknown[];
      const signature = String(params[0]);
      seenSignatures.push(signature);
      return transactionResponse(signature, transactionCalls);
    }
    throw new Error(`Unexpected RPC method: ${String(payload.method)}`);
  });

  vi.stubGlobal('fetch', mock);
  return { mock, seenSignatures };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(App));
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('real app interaction paths', () => {
  it('keeps the newer receipt when an older receipt-file read finishes late', async () => {
    await click('Check a ProofStamp');
    await selectFile(fileInputs()[0], new File(['hello'], 'hello.txt', { type: 'text/plain' }));

    const older = deferred<string>();
    const newer = deferred<string>();
    await selectFile(receiptInput(), delayedTextFile('older.txt', older.promise));
    await selectFile(receiptInput(), delayedTextFile('newer.txt', newer.promise));

    const network = verificationFetch((signature) => rpcResult(transaction(signature, HASH_HELLO)));

    newer.resolve(receipt(SIGNATURE_B));
    await flush();
    older.resolve(receipt(SIGNATURE_A));
    await flush();

    await click('Check ProofStamp');
    await waitFor(() => document.querySelector('.status-match'));

    expect(network.seenSignatures).toEqual([SIGNATURE_B]);
    expect(document.body.textContent).toContain('newer.txt');
  });

  it('keeps pasted receipt text when a delayed receipt-file read completes', async () => {
    await click('Check a ProofStamp');
    await selectFile(fileInputs()[0], new File(['hello'], 'hello.txt', { type: 'text/plain' }));

    const delayed = deferred<string>();
    await selectFile(receiptInput(), delayedTextFile('delayed.txt', delayed.promise));

    const textarea = document.querySelector('#receipt-text');
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Receipt textarea not found.');
    const pasted = receipt(SIGNATURE_B);
    await setText(textarea, pasted);

    const network = verificationFetch((signature) => rpcResult(transaction(signature, HASH_HELLO)));
    delayed.resolve(receipt(SIGNATURE_A));
    await flush();

    expect(textarea.value).toBe(pasted);
    await click('Check ProofStamp');
    await waitFor(() => document.querySelector('.status-match'));
    expect(network.seenSignatures).toEqual([SIGNATURE_B]);
  });

  it('shows a usable error when a receipt file cannot be read', async () => {
    await click('Check a ProofStamp');
    const failed = deferred<string>();
    await selectFile(receiptInput(), delayedTextFile('broken.txt', failed.promise));

    failed.reject(new Error('read failed'));
    await flush();

    const status = await waitFor(() => document.querySelector('.status-error'));
    expect(status.textContent).toMatch(/could not read this receipt file/i);
    expect(document.body.textContent).toContain('Upload receipt');
    expect(document.querySelector('#receipt-text')).not.toBeNull();
  });

  it('clears results when inputs change and ignores a pending result after leaving Check', async () => {
    const delayedTransaction = deferred<Response>();
    const network = verificationFetch((signature, call) => {
      if (call === 1) return rpcResult(transaction(signature, HASH_HELLO));
      return delayedTransaction.promise;
    });

    await click('Check a ProofStamp');
    await selectFile(fileInputs()[0], new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    await selectFile(receiptInput(), new File([receipt(SIGNATURE_A)], 'proof.txt', { type: 'text/plain' }));
    await click('Check ProofStamp');
    await waitFor(() => document.querySelector('.status-match'));

    await selectFile(fileInputs()[0], new File(['changed'], 'changed.txt', { type: 'text/plain' }));
    expect(document.querySelector('.status-match')).toBeNull();

    await selectFile(fileInputs()[0], new File(['hello'], 'hello-again.txt', { type: 'text/plain' }));
    await click('Check ProofStamp');
    await waitFor(() => network.seenSignatures.length === 2 ? document.body : null);
    await click('ProofStamp a file');

    delayedTransaction.resolve(rpcResult(transaction(SIGNATURE_A, HASH_HELLO)));
    await flush();
    await click('Check a ProofStamp');

    expect(document.querySelector('.status-match')).toBeNull();
    expect(document.querySelector('.status-metadata-diff')).toBeNull();
  });

  it('rechecks a known transaction without sending another stamp request', async () => {
    let postCount = 0;
    let transactionReads = 0;
    let submittedHash = '';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/stamps')) {
        postCount += 1;
        const body = fetchPayload(init);
        submittedHash = String(body.sha256);
        return new Response(
          JSON.stringify({
            requestId: body.requestId,
            sha256: body.sha256,
            signature: SIGNATURE_A,
            status: 'submitted',
            lastValidBlockHeight: 999999,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      const payload = fetchPayload(init);
      if (payload.method === 'getGenesisHash') return rpcResult(DEVNET_GENESIS_HASH);
      if (payload.method === 'getSignatureStatuses') {
        return rpcResult({
          context: { slot: SLOT },
          value: [{ slot: SLOT, confirmations: null, err: null, confirmationStatus: 'finalized' }],
        });
      }
      if (payload.method === 'getTransaction') {
        transactionReads += 1;
        const hash = transactionReads === 1 ? 'b'.repeat(64) : submittedHash;
        return rpcResult(transaction(SIGNATURE_A, hash));
      }
      throw new Error(`Unexpected RPC method: ${String(payload.method)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await selectFile(fileInputs()[0], new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    await click('Create ProofStamp');
    await waitFor(() => [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Check this transaction again')) ?? null);

    expect(postCount).toBe(1);
    await click('Check this transaction again');
    await waitFor(() => document.querySelector('.success-panel'));

    expect(postCount).toBe(1);
    expect(transactionReads).toBe(2);
    expect(document.body.textContent).toContain('Public record verified');
  });

  it('shows the existing receipt fallback when clipboard access fails', async () => {
    let submittedHash = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('clipboard blocked')) },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/stamps')) {
        const body = fetchPayload(init);
        submittedHash = String(body.sha256);
        return new Response(
          JSON.stringify({
            requestId: body.requestId,
            sha256: body.sha256,
            signature: SIGNATURE_A,
            status: 'submitted',
            lastValidBlockHeight: 999999,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      const payload = fetchPayload(init);
      if (payload.method === 'getGenesisHash') return rpcResult(DEVNET_GENESIS_HASH);
      if (payload.method === 'getSignatureStatuses') {
        return rpcResult({
          context: { slot: SLOT },
          value: [{ slot: SLOT, confirmations: null, err: null, confirmationStatus: 'finalized' }],
        });
      }
      if (payload.method === 'getTransaction') return rpcResult(transaction(SIGNATURE_A, submittedHash));
      throw new Error(`Unexpected RPC method: ${String(payload.method)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await selectFile(fileInputs()[0], new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    await click('Create ProofStamp');
    await waitFor(() => document.querySelector('.success-panel'));
    await click('Copy receipt');

    const fallback = await waitFor(() => document.querySelector('textarea[aria-label="ProofStamp receipt text"]'));
    expect(fallback).toBeInstanceOf(HTMLTextAreaElement);
    expect((fallback as HTMLTextAreaElement).value).toContain('ProofStamp via Solana receipt');
    expect(document.body.textContent).toMatch(/copy failed/i);
  });
});
