import { useEffect, useRef, useState } from 'react';
import { submitStamp, type StampSubmission } from './lib/api';
import { waitForFinalizedProofStamp } from './lib/confirmation';
import {
  APP_VERSION,
  MAX_FILE_BYTES,
  NETWORK_LABEL,
  RECEIPT_VERSION,
  explorerUrl,
} from './lib/config';
import { FileTooLargeError, sha256File } from './lib/hash';
import { formatReceipt, parseReceipt, type ProofStampReceipt } from './lib/receipt';
import {
  fetchBlockHeight,
  fetchChainRecord,
  fetchSignatureStatus,
  VerificationError,
  type ChainRecord,
} from './lib/rpc';
import {
  AsyncOperationGate,
  classifyCreationRecovery,
  type CreationRecovery,
} from './lib/ui-state';

type View = 'stamp' | 'check';
type CreateState = 'idle' | 'hashing' | 'submitting' | 'waiting' | 'ready' | 'error';
type CheckState = 'idle' | 'checking' | 'match' | 'mismatch' | 'metadata-diff' | 'error';
type CopyState = 'idle' | 'copied' | 'error';

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
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard access is unavailable.');
  }
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
    receipt.network !== NETWORK_LABEL ||
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
        return 'The public transaction is still confirming. Check this transaction again shortly.';
      case 'record_not_found':
        return 'No finalized Solana record was found for this transaction.';
      case 'transaction_failed':
        return 'The Solana transaction failed and did not create a ProofStamp.';
      case 'expired':
        return 'The submission expired before Solana recorded it. No ProofStamp was created.';
      case 'rpc_unavailable':
        return 'We cannot check the public record right now. Try the same transaction again.';
      case 'wrong_network':
        return 'The RPC is connected to the wrong Solana network.';
      case 'unsupported_transaction':
        return 'This Solana transaction version is not supported by this ProofStamp checker.';
      case 'invalid_record':
        return 'This transaction is not a supported ProofStamp record.';
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
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [createRecovery, setCreateRecovery] = useState<CreationRecovery>('none');

  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileText, setReceiptFileText] = useState('');
  const [pastedReceiptText, setPastedReceiptText] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [checkMessage, setCheckMessage] = useState('');
  const [checkedRecord, setCheckedRecord] = useState<ChainRecord | null>(null);
  const [customRpc, setCustomRpc] = useState('');

  const createPollCancelled = useRef(false);
  const checkGate = useRef(new AsyncOperationGate());
  const createBusy = createState === 'hashing' || createState === 'submitting' || createState === 'waiting';
  const createProgressStep =
    createState === 'hashing' ? 0 : createState === 'submitting' ? 1 : createState === 'waiting' ? 2 : -1;
  const receiptInput = receiptFile ? receiptFileText : pastedReceiptText;
  const hasPastedReceipt = !receiptFile && !!pastedReceiptText.trim();
  const checkBusy = checkState === 'checking';
  const canStamp =
    !!createFile &&
    !createBusy &&
    createState !== 'ready' &&
    createRecovery !== 'submission-unknown' &&
    createRecovery !== 'recheck-known-signature';
  const canResumeKnownTransaction =
    createRecovery === 'recheck-known-signature' &&
    !!submission?.signature &&
    !!createHash &&
    !createBusy;
  const canCheck = !!checkFile && !!receiptInput.trim() && !checkBusy;

  useEffect(() => {
    return () => {
      createPollCancelled.current = true;
      checkGate.current.invalidate();
    };
  }, []);

  function handleCreateFile(file: File | null) {
    setCreateFile(file);
    setCreateState('idle');
    setCreateMessage('');
    setCreateHash('');
    setSubmission(null);
    setChainRecord(null);
    setReceiptText('');
    setCopyState('idle');
    setCreateRecovery('none');
  }

  function clearCheckResult() {
    setCheckState('idle');
    setCheckMessage('');
    setCheckedRecord(null);
  }

  function invalidateCheckResult() {
    checkGate.current.invalidate();
    clearCheckResult();
  }

  function handleViewChange(nextView: View) {
    if (nextView === view) return;
    if (view === 'check') invalidateCheckResult();
    setView(nextView);
  }

  function handleCheckFile(file: File | null) {
    setCheckFile(file);
    invalidateCheckResult();
  }

  async function finishSubmission(current: StampSubmission, expectedHash: string) {
    if (!current.signature) {
      throw new Error('The submission service did not return a transaction signature.');
    }

    setCreateState('waiting');
    setCreateMessage('Submitted to Solana ✓. Waiting for network confirmation…');

    const record = await waitForFinalizedProofStamp(current, expectedHash, {
      getSignatureStatus: (signature) => fetchSignatureStatus(signature),
      getBlockHeight: () => fetchBlockHeight(),
      getChainRecord: (signature) => fetchChainRecord(signature),
      sleep: () => new Promise((resolve) => setTimeout(resolve, 2000)),
      isCancelled: () => createPollCancelled.current,
      onStatus: (status) => {
        if (status?.confirmationStatus === 'confirmed') {
          setCreateMessage('Confirmed by Solana ✓. Finalizing public proof…');
        } else if (status?.confirmationStatus === 'finalized') {
          setCreateMessage('Finalized on Solana ✓. Verifying public record…');
        }
      },
    });

    const formatted = formatReceipt(receiptFromRecord(record));
    setChainRecord(record);
    setReceiptText(formatted);
    setCreateState('ready');
    setCreateRecovery('none');
    setCreateMessage('Your ProofStamp is ready.');
  }

  async function handleStamp() {
    if (!createFile) return;

    createPollCancelled.current = false;
    setCreateRecovery('none');
    setCreateState('hashing');
    setCreateMessage('Creating SHA-256 on this device…');
    setChainRecord(null);
    setReceiptText('');
    setSubmission(null);
    setCopyState('idle');

    let current: StampSubmission | null = null;

    try {
      const digest = await sha256File(createFile);
      setCreateHash(digest);
      setCreateState('submitting');
      setCreateMessage('Recording your ProofStamp…');

      current = await submitStamp(crypto.randomUUID(), digest);
      setSubmission(current);
      await finishSubmission(current, digest);
    } catch (error) {
      setCreateState('error');
      setCreateRecovery(classifyCreationRecovery(error, !!current?.signature));
      setCreateMessage(userMessageForError(error));
    }
  }

  async function handleResumeKnownTransaction() {
    if (!submission?.signature || !createHash) return;

    createPollCancelled.current = false;
    setCreateRecovery('none');

    try {
      await finishSubmission(submission, createHash);
    } catch (error) {
      setCreateState('error');
      setCreateRecovery(classifyCreationRecovery(error, true));
      setCreateMessage(userMessageForError(error));
    }
  }

  async function handleCopyReceipt() {
    try {
      await copyText(receiptText);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  async function handleReceiptFile(file: File | null) {
    if (!file) return;

    invalidateCheckResult();
    if (file.size > 16_384) {
      setReceiptFile(null);
      setReceiptFileText('');
      setCheckMessage('Receipt is too large.');
      setCheckState('error');
      return;
    }

    const text = await file.text();
    setReceiptFile(file);
    setReceiptFileText(text);
    setPastedReceiptText('');
  }

  function handlePastedReceipt(value: string) {
    setPastedReceiptText(value);
    if (value.length > 0) {
      setReceiptFile(null);
      setReceiptFileText('');
    }
    invalidateCheckResult();
  }

  function handleCustomRpc(value: string) {
    setCustomRpc(value);
    invalidateCheckResult();
  }

  async function handleCheck() {
    if (!checkFile || !receiptInput.trim()) return;

    const runToken = checkGate.current.begin();
    const fileForRun = checkFile;
    const receiptForRun = receiptInput;
    const rpcForRun = customRpc.trim() || undefined;

    setCheckState('checking');
    setCheckMessage('Checking the public record and this file…');
    setCheckedRecord(null);

    try {
      const receipt = parseReceipt(receiptForRun);
      const [digest, record] = await Promise.all([
        sha256File(fileForRun),
        fetchChainRecord(receipt.transaction, receipt.instructionIndex, rpcForRun),
      ]);

      if (!checkGate.current.isCurrent(runToken)) return;
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
      if (!checkGate.current.isCurrent(runToken)) return;
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

        <div className="mode-switch" aria-label="ProofStamp mode">
          <button
            type="button"
            aria-pressed={view === 'stamp'}
            className={view === 'stamp' ? 'active' : ''}
            onClick={() => handleViewChange('stamp')}
          >
            ProofStamp a file
          </button>
          <button
            type="button"
            aria-pressed={view === 'check'}
            className={view === 'check' ? 'active' : ''}
            onClick={() => handleViewChange('check')}
          >
            Check a ProofStamp
          </button>
        </div>

        {view === 'stamp' ? (
          <section className="card" aria-labelledby="stamp-title" aria-busy={createBusy}>
            <div className="card-heading">
              <span className="proof-point" aria-hidden="true" />
              <div>
                <h2 id="stamp-title">Choose the file you want to record</h2>
                <p>Maximum {formatBytes(MAX_FILE_BYTES)}. The file is hashed locally.</p>
              </div>
            </div>

            {createFile ? (
              <div className="selected-file">
                <div className="selected-file-row">
                  <span className="selected-file-name" title={createFile.name}>{createFile.name}</span>
                  <label className={`file-change-button${createBusy ? ' is-disabled' : ''}`}>
                    Choose another file
                    <input
                      className="visually-hidden"
                      type="file"
                      disabled={createBusy}
                      onChange={(event) => handleCreateFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <p className="file-meta">{formatBytes(createFile.size)} · {createFile.type || 'unknown media type'}</p>
              </div>
            ) : (
              <label className="file-picker">
                <span>Choose file</span>
                <span className="file-picker-note">Nothing is uploaded</span>
                <input
                  className="visually-hidden"
                  type="file"
                  onChange={(event) => handleCreateFile(event.target.files?.[0] ?? null)}
                />
              </label>
            )}

            <button type="button" className="primary-button" disabled={!canStamp} onClick={handleStamp}>
              {createState === 'hashing'
                ? 'Creating SHA-256…'
                : createState === 'submitting'
                  ? 'Recording…'
                  : createState === 'waiting'
                    ? 'Confirming public proof…'
                    : createState === 'ready'
                      ? 'ProofStamp created ✓'
                      : createRecovery === 'submission-unknown'
                        ? 'Submission outcome unknown'
                        : createRecovery === 'recheck-known-signature'
                          ? 'Transaction needs recheck'
                          : 'Create ProofStamp'}
            </button>

            {createProgressStep >= 0 && (
              <div className="creation-progress" aria-hidden="true">
                {['Hash file', 'Record on Solana', 'Finalize public proof'].map((label, index) => (
                  <div
                    className={`progress-step${index < createProgressStep ? ' done' : ''}${index === createProgressStep ? ' active' : ''}`}
                    key={label}
                  >
                    <span className="progress-marker">{index < createProgressStep ? '✓' : index + 1}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {submission && createState !== 'ready' && (
              <details className="details-block">
                <summary>Request details</summary>
                <dl>
                  <dt>Request ID</dt>
                  <dd>{submission.requestId}</dd>
                  <dt>Transaction</dt>
                  <dd className="mono break-all">{submission.signature}</dd>
                </dl>
              </details>
            )}

            {createMessage && (
              <div className={`status status-${createState}`} role="status" aria-live="polite">
                <div>{createMessage}</div>
                {(createState === 'waiting' || createState === 'error') && submission?.signature && (
                  <a href={explorerUrl(submission.signature)} target="_blank" rel="noreferrer" className="text-link">
                    View this transaction on Solana Explorer
                  </a>
                )}
                {canResumeKnownTransaction && (
                  <div className="recovery-actions">
                    <button type="button" className="secondary-button" onClick={handleResumeKnownTransaction}>
                      Check this transaction again
                    </button>
                  </div>
                )}
                {createRecovery === 'known-signature-failed' && (
                  <p className="status-note">This outcome is definite. Creating again will send a new transaction.</p>
                )}
              </div>
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
                <p>Keep this receipt with the original file. You need both to check it later.</p>
                <div className="action-row">
                  <button type="button" className="primary-button" onClick={() => downloadText('proofstamp-solana-receipt.txt', receiptText)}>Download receipt</button>
                  <button type="button" className="secondary-button" onClick={handleCopyReceipt}>
                    {copyState === 'copied' ? 'Copied' : 'Copy receipt'}
                  </button>
                </div>
                {copyState === 'error' && (
                  <div className="copy-fallback" role="status">
                    <p>Copy failed. Download the receipt or select the text below.</p>
                    <textarea readOnly rows={7} value={receiptText} aria-label="ProofStamp receipt text" />
                  </div>
                )}
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
          <section className="card" aria-labelledby="check-title" aria-busy={checkBusy}>
            <div className="card-heading">
              <span className="proof-point" aria-hidden="true" />
              <div>
                <h2 id="check-title">Check the exact file later</h2>
                <p>Select the file, then upload its ProofStamp receipt or paste the receipt text.</p>
              </div>
            </div>

            <div className="check-input-section">
              <div className="field-label field-label-first">File to check</div>
              {checkFile ? (
                <div className="selected-file">
                  <div className="selected-file-row">
                    <span className="selected-file-name" title={checkFile.name}>{checkFile.name}</span>
                    <label className={`file-change-button${checkBusy ? ' is-disabled' : ''}`}>
                      Choose another file
                      <input
                        className="visually-hidden"
                        type="file"
                        disabled={checkBusy}
                        onChange={(event) => handleCheckFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                  <p className="file-meta">{formatBytes(checkFile.size)} · {checkFile.type || 'unknown media type'}</p>
                </div>
              ) : (
                <label className="file-picker">
                  <span>Choose file</span>
                  <span className="file-picker-note">Hashed locally</span>
                  <input
                    className="visually-hidden"
                    type="file"
                    disabled={checkBusy}
                    onChange={(event) => handleCheckFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>

            <div className="check-input-section receipt-input-section">
              <div className="field-label field-label-first">Receipt</div>
              <p className="input-help">Use either a receipt file or pasted receipt text.</p>

              {receiptFile ? (
                <div className="selected-file">
                  <div className="selected-file-row">
                    <span className="selected-file-name" title={receiptFile.name}>{receiptFile.name}</span>
                    <label className={`file-change-button${checkBusy ? ' is-disabled' : ''}`}>
                      Choose another receipt
                      <input
                        className="visually-hidden"
                        type="file"
                        accept=".txt,text/plain"
                        disabled={checkBusy}
                        onChange={(event) => handleReceiptFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                  <p className="file-meta">{formatBytes(receiptFile.size)} · {receiptFile.type || 'text/plain'}</p>
                </div>
              ) : (
                <label className={`file-picker receipt-picker${hasPastedReceipt ? ' has-pasted-receipt' : ''}`}>
                  <span>Upload receipt</span>
                  <span className={`file-picker-note${hasPastedReceipt ? ' ready-note' : ''}`}>
                    {hasPastedReceipt ? 'Pasted receipt ready ✓' : '.txt file'}
                  </span>
                  <input
                    className="visually-hidden"
                    type="file"
                    accept=".txt,text/plain"
                    disabled={checkBusy}
                    onChange={(event) => handleReceiptFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}

              <div className="input-divider" aria-hidden="true"><span>or</span></div>
              <label className="field-label receipt-text-label" htmlFor="receipt-text">Paste receipt text</label>
              <textarea
                id="receipt-text"
                value={pastedReceiptText}
                disabled={checkBusy}
                onChange={(event) => handlePastedReceipt(event.target.value)}
                rows={7}
                placeholder={receiptFile ? 'Paste receipt text here to use it instead of the selected receipt file…' : 'ProofStamp via Solana receipt…'}
              />
            </div>

            <details className="details-block advanced">
              <summary>Advanced: use another devnet RPC</summary>
              <label className="field-label" htmlFor="custom-rpc">HTTPS RPC URL</label>
              <input
                id="custom-rpc"
                className="text-input"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={customRpc}
                disabled={checkBusy}
                onChange={(event) => handleCustomRpc(event.target.value)}
              />
              <p className="help-text">The app checks the RPC genesis hash, but verification still depends on the RPC returning accurate Solana history.</p>
            </details>

            <button type="button" className="primary-button" disabled={!canCheck} onClick={handleCheck}>{checkBusy ? 'Checking…' : 'Check ProofStamp'}</button>

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
          <p>A match shows that the exact file bytes match the SHA-256 recorded in the selected public Solana transaction.</p>
          <p>It does not prove authorship, truth, photo capture time, delivery, or acceptance. Solana's reported block time is not a date written inside the file.</p>
          <p>Keep the original file and receipt. Verification depends on an RPC with the relevant Solana history, and a public digest can be tested against a guessed candidate file.</p>
          <p className="devnet-note">This is a Solana devnet prototype. Devnet may reset and historical RPC access may disappear, so this is not permanent evidence.</p>
        </section>
      </main>

      <footer>
        <span>ProofStamp via Solana v{APP_VERSION}</span><span>·</span>
        <a href="https://github.com/Proof-Stamp/solana#how-it-works" target="_blank" rel="noreferrer">How it works</a><span>·</span>
        <a href="https://github.com/Proof-Stamp/solana/blob/main/PRIVACY.md" target="_blank" rel="noreferrer">Privacy</a><span>·</span>
        <a href="https://github.com/Proof-Stamp/solana" target="_blank" rel="noreferrer">Source</a>
      </footer>
    </div>
  );
}
