import { useEffect, useMemo, useRef, useState } from 'react';
import { submitStamp, type StampSubmission } from './lib/api';
import {
  APP_VERSION,
  DEVNET_GENESIS_HASH,
  MAX_FILE_BYTES,
  MEMO_PROGRAM_ID,
  NETWORK_LABEL,
  RECEIPT_VERSION,
  explorerUrl,
} from './lib/config';
import { FileTooLargeError, sha256File } from './lib/hash';
import { formatReceipt, parseReceipt, type ProofStampReceipt } from './lib/receipt';
import { fetchChainRecord, VerificationError, type ChainRecord } from './lib/rpc';
import { clearPendingStamp, loadPendingStamp, savePendingStamp } from './lib/storage';

type View = 'stamp' | 'check';
type CreateState = 'idle' | 'hashing' | 'submitting' | 'waiting' | 'ready' | 'error';
type CheckState = 'idle' | 'checking' | 'match' | 'mismatch' | 'metadata-diff' | 'error';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBlockTime(unixSeconds: number | null): string {
  if (unixSeconds === null) return 'unavailable';
  return new Date(unixSeconds * 1000).toISOString();
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function receiptFromRecord(record: ChainRecord): ProofStampReceipt {
  return {
    receiptVersion: RECEIPT_VERSION,
    network: NETWORK_LABEL,
    genesisHash: record.genesisHash,
    transaction: record.signature,
    instructionIndex: record.instructionIndex,
    program: record.program,
    sha256: record.sha256,
    slot: record.slot,
    blockTime: formatBlockTime(record.blockTime),
  };
}

function metadataDiffers(receipt: ProofStampReceipt, chain: ChainRecord): boolean {
  return (
    receipt.genesisHash !== chain.genesisHash ||
    receipt.program !== chain.program ||
    receipt.sha256 !== chain.sha256 ||
    receipt.slot !== chain.slot ||
    receipt.blockTime !== formatBlockTime(chain.blockTime)
  );
}

function userMessageForError(error: unknown): string {
  if (error instanceof FileTooLargeError) {
    return `This file is too large for this prototype. The limit is ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  if (error instanceof VerificationError) {
    switch (error.code) {
      case 'pending':
        return 'The public record is not finalized yet. Try again shortly.';
      case 'rpc_unavailable':
        return 'We cannot check the public record right now. Try again.';
      case 'wrong_network':
        return 'The RPC is connected to the wrong Solana network.';
      case 'unsupported_transaction':
        return 'This Solana transaction version is not supported by this ProofStamp checker.';
      case 'invalid_record':
        return 'This is not a supported ProofStamp record.';
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export default function App() {
  const [view, setView] = useState<View>('stamp');
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [createState, setCreateState] = useState<CreateState>('idle');
  const [createMessage, setCreateMessage] = useState('');
  const [createHash, setCreateHash] = useState('');
  const [submission, setSubmission] = useState<StampSubmission | null>(null);
  const [chainRecord, setChainRecord] = useState<ChainRecord | null>(null);
  const [receiptText, setReceiptText] = useState('');
  const [copied, setCopied] = useState(false);

  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [receiptInput, setReceiptInput] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [checkMessage, setCheckMessage] = useState('');
  const [checkedRecord, setCheckedRecord] = useState<ChainRecord | null>(null);
  const [customRpc, setCustomRpc] = useState('');

  const createPollCancelled = useRef(false);
  const canStamp =
    !!createFile && createState !== 'hashing' && createState !== 'submitting' && createState !== 'waiting';
  const canCheck = !!checkFile && !!receiptInput.trim() && checkState !== 'checking';
  const pendingOnLoad = useMemo(() => loadPendingStamp(), []);

  useEffect(() => {
    return () => {
      createPollCancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingOnLoad || createState !== 'idle') return;
    setCreateHash(pendingOnLoad.sha256);
    setSubmission({
      requestId: pendingOnLoad.requestId,
      sha256: pendingOnLoad.sha256,
      signature: pendingOnLoad.signature,
      status: pendingOnLoad.signature ? 'submitted' : 'building',
      lastValidBlockHeight: null,
    });
    setCreateMessage(
      pendingOnLoad.signature
        ? 'A previous ProofStamp is still waiting for final confirmation. Reselect the original file to validate it after completion.'
        : 'A previous ProofStamp request was interrupted. You can recover it below.',
    );
  }, [pendingOnLoad, createState]);

  async function waitForFinalized(signature: string, expectedHash: string): Promise<ChainRecord> {
    let lastPendingError: VerificationError | null = null;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      if (createPollCancelled.current) throw new Error('Checking was cancelled.');
      try {
        const record = await fetchChainRecord(signature);
        if (record.sha256 !== expectedHash) {
          throw new Error('Public read-back returned a different SHA-256. Creation stopped.');
        }
        return record;
      } catch (error) {
        if (error instanceof VerificationError && error.code === 'pending') {
          lastPendingError = error;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        throw error;
      }
    }
    throw lastPendingError ?? new Error('The transaction is still waiting for final confirmation.');
  }

  async function finishSubmission(current: StampSubmission, expectedHash: string) {
    if (!current.signature) {
      throw new Error('The submission service did not return a transaction signature.');
    }

    setCreateState('waiting');
    setCreateMessage('Waiting for final confirmation…');
    savePendingStamp({ requestId: current.requestId, sha256: expectedHash, signature: current.signature });

    const record = await waitForFinalized(current.signature, expectedHash);
    const formatted = formatReceipt(receiptFromRecord(record));
    setChainRecord(record);
    setReceiptText(formatted);
    setCreateState('ready');
    setCreateMessage('Your ProofStamp is ready.');
    clearPendingStamp();
  }

  async function handleStamp() {
    if (!createFile) return;
    createPollCancelled.current = false;
    setCreateState('hashing');
    setCreateMessage('Creating SHA-256 on this device…');
    setChainRecord(null);
    setReceiptText('');
    setSubmission(null);
    setCopied(false);

    try {
      const digest = await sha256File(createFile);
      setCreateHash(digest);
      setCreateState('submitting');
      setCreateMessage('Recording your ProofStamp…');

      const requestId = crypto.randomUUID();
      savePendingStamp({ requestId, sha256: digest, signature: null });

      let current: StampSubmission;
      try {
        current = await submitStamp(requestId, digest);
      } catch (submitError) {
        try {
          current = await submitStamp(requestId, digest);
        } catch {
          throw submitError;
        }
      }

      setSubmission(current);
      savePendingStamp({ requestId, sha256: digest, signature: current.signature });
      await finishSubmission(current, digest);
    } catch (error) {
      setCreateState('error');
      setCreateMessage(userMessageForError(error));
    }
  }

  async function handleRecover() {
    const pending = loadPendingStamp();
    if (!pending) return;
    setCreateState('submitting');
    setCreateMessage('Recovering the previous request…');
    try {
      const current = await submitStamp(pending.requestId, pending.sha256);
      setSubmission(current);
      savePendingStamp({ requestId: current.requestId, sha256: pending.sha256, signature: current.signature });
      await finishSubmission(current, pending.sha256);
    } catch (error) {
      setCreateState('error');
      setCreateMessage(userMessageForError(error));
    }
  }

  async function handleReceiptFile(file: File | null) {
    if (!file) return;
    if (file.size > 16_384) {
      setCheckMessage('Receipt is too large.');
      setCheckState('error');
      return;
    }
    setReceiptInput(await file.text());
    setCheckState('idle');
    setCheckMessage('');
  }

  async function handleCheck() {
    if (!checkFile || !receiptInput.trim()) return;
    setCheckState('checking');
    setCheckMessage('Checking the public record and this file…');
    setCheckedRecord(null);

    try {
      const receipt = parseReceipt(receiptInput);
      const [digest, record] = await Promise.all([
        sha256File(checkFile),
        fetchChainRecord(receipt.transaction, receipt.instructionIndex, customRpc || undefined),
      ]);
      setCheckedRecord(record);

      const fileMatchesChain = digest === record.sha256;
      const receiptDiffers = metadataDiffers(receipt, record);

      if (!fileMatchesChain) {
        setCheckState('mismatch');
        setCheckMessage('This file does not match the public record.');
        return;
      }

      if (receiptDiffers) {
        setCheckState('metadata-diff');
        setCheckMessage('This file matches the public record, but receipt details differ from the public record.');
        return;
      }

      setCheckState('match');
      setCheckMessage('This file matches the public record.');
    } catch (error) {
      setCheckState('error');
      setCheckMessage(userMessageForError(error));
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="https://proofstamp.org" target="_blank" rel="noreferrer" aria-label="ProofStamp.org">
          <span className="brand-word">
            ProofStamp<span aria-hidden="true" className="brand-dot">●</span>
          </span>
        </a>
        <span className="via-label">via Solana</span>
        <span className="devnet-pill">Devnet</span>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Private file. Public proof.</p>
          <h1 id="hero-title">Record a file without uploading it.</h1>
          <p className="hero-copy">
            ProofStamp creates SHA-256 in your browser and records only that hash on Solana devnet. Your file stays on your device.
          </p>
        </section>

        <div className="mode-switch" role="tablist" aria-label="ProofStamp mode">
          <button role="tab" aria-selected={view === 'stamp'} className={view === 'stamp' ? 'active' : ''} onClick={() => setView('stamp')}>
            ProofStamp a file
          </button>
          <button role="tab" aria-selected={view === 'check'} className={view === 'check' ? 'active' : ''} onClick={() => setView('check')}>
            Check a ProofStamp
          </button>
        </div>

        {view === 'stamp' ? (
          <section className="card" aria-labelledby="stamp-title">
            <div className="card-heading">
              <span className="proof-point" aria-hidden="true" />
              <div>
                <h2 id="stamp-title">Choose the file you want to record</h2>
                <p>Maximum {formatBytes(MAX_FILE_BYTES)}. The file is hashed locally.</p>
              </div>
            </div>

            <label className="file-picker">
              <span>{createFile ? createFile.name : 'Choose file'}</span>
              <input
                type="file"
                onChange={(event) => {
                  setCreateFile(event.target.files?.[0] ?? null);
                  setCreateState('idle');
                  setCreateMessage('');
                }}
              />
            </label>
            {createFile && <p className="file-meta">{formatBytes(createFile.size)} · {createFile.type || 'unknown media type'}</p>}

            <button className="primary-button" disabled={!canStamp} onClick={handleStamp}>
              {createState === 'hashing'
                ? 'Creating SHA-256…'
                : createState === 'submitting'
                  ? 'Recording…'
                  : createState === 'waiting'
                    ? 'Waiting for confirmation…'
                    : 'Create ProofStamp'}
            </button>

            {submission && createState !== 'ready' && (
              <details className="details-block">
                <summary>Request details</summary>
                <dl>
                  <dt>Request ID</dt>
                  <dd>{submission.requestId}</dd>
                  {submission.signature && (
                    <>
                      <dt>Transaction</dt>
                      <dd className="mono break-all">{submission.signature}</dd>
                    </>
                  )}
                </dl>
              </details>
            )}

            {createMessage && <div className={`status status-${createState}`} role="status" aria-live="polite">{createMessage}</div>}

            {createState === 'error' && loadPendingStamp() && (
              <button className="secondary-button" onClick={handleRecover}>Recover previous request</button>
            )}

            {createHash && (
              <details className="details-block">
                <summary>See SHA-256</summary>
                <code className="mono break-all">{createHash}</code>
              </details>
            )}

            {createState === 'ready' && chainRecord && (
              <div className="success-panel">
                <div className="success-title"><span className="success-mark" aria-hidden="true">✓</span> Public record verified</div>
                <p>Keep the receipt with the original file.</p>
                <div className="action-row">
                  <button className="primary-button" onClick={() => downloadText('proofstamp-solana-receipt.txt', receiptText)}>Download receipt</button>
                  <button className="secondary-button" onClick={async () => { await copyText(receiptText); setCopied(true); }}>
                    {copied ? 'Copied' : 'Copy receipt'}
                  </button>
                </div>
                <a href={explorerUrl(chainRecord.signature)} target="_blank" rel="noreferrer" className="text-link">View public transaction</a>
                <details className="details-block">
                  <summary>Proof details</summary>
                  <dl>
                    <dt>Network</dt><dd>{NETWORK_LABEL}</dd>
                    <dt>Transaction</dt><dd className="mono break-all">{chainRecord.signature}</dd>
                    <dt>Instruction</dt><dd>{chainRecord.instructionIndex}</dd>
                    <dt>Slot</dt><dd>{chainRecord.slot}</dd>
                    <dt>Blockchain time</dt><dd>{formatBlockTime(chainRecord.blockTime)}</dd>
                    <dt>SHA-256</dt><dd className="mono break-all">{chainRecord.sha256}</dd>
                  </dl>
                </details>
              </div>
            )}
          </section>
        ) : (
          <section className="card" aria-labelledby="check-title">
            <div className="card-heading">
              <span className="proof-point" aria-hidden="true" />
              <div>
                <h2 id="check-title">Check the exact file later</h2>
                <p>Select the original file and its ProofStamp receipt.</p>
              </div>
            </div>

            <div className="two-column-inputs">
              <div>
                <label className="field-label" htmlFor="check-file">File</label>
                <input id="check-file" className="native-input" type="file" onChange={(event) => setCheckFile(event.target.files?.[0] ?? null)} />
              </div>
              <div>
                <label className="field-label" htmlFor="receipt-file">Receipt</label>
                <input id="receipt-file" className="native-input" type="file" accept=".txt,text/plain" onChange={(event) => handleReceiptFile(event.target.files?.[0] ?? null)} />
              </div>
            </div>

            <label className="field-label" htmlFor="receipt-text">Or paste receipt text</label>
            <textarea id="receipt-text" value={receiptInput} onChange={(event) => setReceiptInput(event.target.value)} rows={7} placeholder="ProofStamp via Solana receipt…" />

            <details className="details-block advanced">
              <summary>Advanced: use another devnet RPC</summary>
              <label className="field-label" htmlFor="custom-rpc">HTTPS RPC URL</label>
              <input id="custom-rpc" className="text-input" type="url" inputMode="url" placeholder="https://…" value={customRpc} onChange={(event) => setCustomRpc(event.target.value)} />
              <p className="help-text">The app still checks the RPC genesis hash before trusting the result.</p>
            </details>

            <button className="primary-button" disabled={!canCheck} onClick={handleCheck}>{checkState === 'checking' ? 'Checking…' : 'Check ProofStamp'}</button>

            {checkMessage && <div className={`status status-${checkState}`} role="status" aria-live="polite">{checkMessage}</div>}

            {checkedRecord && (
              <details className="details-block">
                <summary>Public record</summary>
                <dl>
                  <dt>Transaction</dt><dd className="mono break-all">{checkedRecord.signature}</dd>
                  <dt>Instruction</dt><dd>{checkedRecord.instructionIndex}</dd>
                  <dt>Slot</dt><dd>{checkedRecord.slot}</dd>
                  <dt>SHA-256</dt><dd className="mono break-all">{checkedRecord.sha256}</dd>
                </dl>
                <a href={explorerUrl(checkedRecord.signature)} target="_blank" rel="noreferrer" className="text-link">View public transaction</a>
              </details>
            )}
          </section>
        )}

        <section className="limits-card" aria-labelledby="limits-title">
          <h2 id="limits-title">What this proves</h2>
          <p>A matching result shows that the exact file bytes match the SHA-256 recorded in the selected public Solana transaction. It does not prove who created the file or whether the content is true.</p>
          <p className="devnet-note">This is a Solana devnet prototype. Devnet can be reset, so records are not suitable for permanent evidence.</p>
        </section>
      </main>

      <footer>
        <span>ProofStamp via Solana v{APP_VERSION}</span><span>·</span>
        <span className="mono short-hash">{DEVNET_GENESIS_HASH.slice(0, 8)}…</span><span>·</span>
        <span className="mono short-hash">{MEMO_PROGRAM_ID.slice(0, 8)}…</span>
      </footer>
    </div>
  );
}
