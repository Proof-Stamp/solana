import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AsyncOperationGate } from '../src/lib/ui-state';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function commitIfCurrent<T>(
  gate: AsyncOperationGate,
  token: number,
  promise: Promise<T>,
  commit: (value: T) => void,
) {
  const value = await promise;
  if (gate.isCurrent(token)) commit(value);
}

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) {
    throw new Error(`Could not find source section: ${start} -> ${end}`);
  }
  return source.slice(from, to);
}

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

describe('receipt-loading interaction path', () => {
  it('keeps the newer receipt when an older read finishes late', async () => {
    const gate = new AsyncOperationGate();
    const receiptA = deferred<string>();
    const receiptB = deferred<string>();
    let committed = '';

    const tokenA = gate.begin();
    const pendingA = commitIfCurrent(gate, tokenA, receiptA.promise, (value) => {
      committed = value;
    });

    const tokenB = gate.begin();
    const pendingB = commitIfCurrent(gate, tokenB, receiptB.promise, (value) => {
      committed = value;
    });

    receiptB.resolve('receipt B');
    await pendingB;
    receiptA.resolve('receipt A');
    await pendingA;

    expect(committed).toBe('receipt B');
  });

  it('does not let a delayed receipt read overwrite pasted text', async () => {
    const gate = new AsyncOperationGate();
    const receiptRead = deferred<string>();
    let selectedInput = '';

    const token = gate.begin();
    const pendingRead = commitIfCurrent(gate, token, receiptRead.promise, (value) => {
      selectedInput = value;
    });

    selectedInput = 'pasted receipt';
    gate.invalidate();
    receiptRead.resolve('late file receipt');
    await pendingRead;

    expect(selectedInput).toBe('pasted receipt');
  });

  it('wires receipt selection, paste replacement, view exit, and read errors to the guard', () => {
    const receiptHandler = section(
      appSource,
      'async function handleReceiptFile',
      'function handlePastedReceipt',
    );
    const pasteHandler = section(
      appSource,
      'function handlePastedReceipt',
      'function handleCustomRpc',
    );
    const viewHandler = section(appSource, 'function handleViewChange', 'function handleCheckFile');

    expect(receiptHandler).toContain('receiptLoadGate.current.begin()');
    expect(receiptHandler).toContain('await file.text()');
    expect(receiptHandler).toContain('receiptLoadGate.current.isCurrent(loadToken)');
    expect(receiptHandler).toContain('Could not read this receipt file.');
    expect(pasteHandler).toContain('receiptLoadGate.current.invalidate()');
    expect(viewHandler).toContain("if (view === 'check')");
    expect(viewHandler).toContain('receiptLoadGate.current.invalidate()');
  });
});

describe('verification interaction path', () => {
  it('ignores a completed verification after its inputs were invalidated', async () => {
    const gate = new AsyncOperationGate();
    const result = deferred<string>();
    let visibleResult = '';

    const token = gate.begin();
    const pending = commitIfCurrent(gate, token, result.promise, (value) => {
      visibleResult = value;
    });

    gate.invalidate();
    result.resolve('old verification result');
    await pending;

    expect(visibleResult).toBe('');
  });

  it('wires the check handler to reject stale success and stale error results', () => {
    const checkHandler = section(appSource, 'async function handleCheck', '\n  return (');
    const guardMatches = checkHandler.match(/checkGate\.current\.isCurrent\(runToken\)/g) ?? [];

    expect(checkHandler).toContain('const runToken = checkGate.current.begin()');
    expect(guardMatches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('known-transaction recovery interaction path', () => {
  it('rechecks the known transaction without making a new submission request', () => {
    const resumeHandler = section(
      appSource,
      'async function handleResumeKnownTransaction',
      'async function handleCopyReceipt',
    );

    expect(resumeHandler).toContain('await finishSubmission(submission, createHash)');
    expect(resumeHandler).not.toContain('submitStamp(');
  });
});
