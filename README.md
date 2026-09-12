# ProofStamp via Solana

ProofStamp via Solana is a small Solana **devnet** prototype. A user selects a file, the browser calculates SHA-256 locally, and a restricted Cloudflare Pages Function records only that digest in a Solana Memo transaction paid by an operator-controlled devnet fee payer.

**Live devnet app:** https://solana.proofstamp.org

There is no user wallet, seed phrase, token balance, faucet step, passkey, ZeroDev dependency, custom Solana program, or application database in v1.

## v1 flow

```text
file on device
     |
     | exact-byte SHA-256 in browser
     v
64 lowercase hex digest
     |
     | POST protocolVersion + requestId + digest only
     v
Cloudflare Pages Function
     |
     | constructs + signs one fixed Memo transaction
     v
Solana devnet
     |
     | signature status + blockhash lifetime
     | finalized independent browser read-back
     v
human-readable receipt
     |
     +--> later: file + receipt -> public transaction -> match / mismatch
```

The selected file never leaves the browser through application code. The public chain record contains the digest, transaction timing, fee-payer activity, and normal Solana transaction metadata.

## Protocol

The on-chain Memo payload is exactly:

```text
proofstamp:v1:sha256:<64 lowercase hexadecimal characters>
```

The canonical Memo program is:

```text
MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
```

The checker accepts legacy and v0 transactions and requests `maxSupportedTransactionVersion: 0` from RPC.

## Architecture

- React + TypeScript + Vite frontend hosted on Cloudflare Pages
- Web Crypto SHA-256 over the exact selected file bytes
- independent browser JSON-RPC verification
- Cloudflare Pages Function at `/api/stamps` for restricted transaction construction and signing
- shared server implementation in `worker/index.mjs`
- `@solana/kit` and `@solana-program/memo` for the server transaction path
- dedicated operator-controlled devnet fee payer
- no D1 or other application database in v1

The submission endpoint accepts exactly `protocolVersion`, a UUID v4 `requestId`, and a lowercase SHA-256 digest. It rejects extra fields and does not accept filenames, file bytes, serialized transactions, arbitrary instructions, addresses, RPC URLs, programs, or fee settings.

## Confirmation and failure model

A submission response is not proof of success. After receiving the transaction signature, the browser checks `getSignatureStatuses`, follows the transaction's `lastValidBlockHeight`, and waits for finalization. Only then does it call `getTransaction` and validate the actual public Memo before showing **Public record verified**.

Creation has distinct outcomes for a failed transaction, an expired blockhash, an unavailable RPC, and a transaction that is still confirming.

v1 deliberately does not provide exactly-once submission or server-side recovery. If the HTTP response is lost or the server returns an ambiguous 5xx error, the browser does not automatically retry. A transaction may already have reached Solana, and blindly repeating it could create a second valid ProofStamp for the same digest.

## Local setup

Requirements: Node 24.15+ and npm 12.0.2+.

```bash
npm install --global npm@12.0.2
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev
```

Public frontend configuration:

```text
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_RPC_FALLBACK_URL=
VITE_SUBMIT_API_BASE=
```

On Cloudflare Pages, leave `VITE_SUBMIT_API_BASE` empty so the frontend uses the same-origin `/api/stamps` Pages Function.

## Cloudflare Pages deployment

Current public devnet deployment: https://solana.proofstamp.org

Recommended Git deployment settings:

```text
Repository: Proof-Stamp/solana
Production branch: main
Build command: npm install --global npm@12.0.2 && npm ci --ignore-scripts && npm run build
Build output directory: dist
Root directory: /
```

The repository pins Node 24.15.0 in `.nvmrc` and commits `package-lock.json` for reproducible installs. `wrangler.jsonc` is configured for Pages with `pages_build_output_dir: "dist"`.

Cloudflare Pages automatically provides `CF_PAGES_COMMIT_SHA` and `CF_PAGES_URL` during builds. Vite embeds those values as `proofstamp-build` and `proofstamp-deployment` meta tags in the generated HTML so a deployed build can be tied back to source.

The repository contains `functions/api/stamps.mjs`, so Cloudflare Pages exposes the submission endpoint at `/api/stamps`. `public/_routes.json` limits Pages Functions routing to `/api/*`.

### Pages environment configuration

The checked-in Wrangler configuration is explicit about creation state:

- local/default: `SUBMISSION_ENABLED=false`
- preview: `SUBMISSION_ENABLED=false`
- production: `SUBMISSION_ENABLED=true`
- all environments pin the Solana devnet genesis hash

RPC credentials and signer material are not committed. Production supplies `SOLANA_RPC_URL` and `SOLANA_FEE_PAYER_SECRET` as Cloudflare secrets. Preview does not receive the production fee-payer secret.

The fee payer must remain a Cloudflare secret, never a public `VITE_*` variable:

```text
SOLANA_FEE_PAYER_SECRET=<32- or 64-byte Solana key material in a supported encoding>
```

`ALLOWED_ORIGIN` is not required when the frontend and `/api/stamps` are served from the same Cloudflare Pages origin. For local development where the Vite frontend and Worker run on different ports, set:

```text
ALLOWED_ORIGIN=http://localhost:5173
```

No D1 binding is required.

Sponsored creation should be enabled only when the devnet network check succeeds, the dedicated signer is funded with a small amount of devnet SOL, and an edge rate limit or equivalent abuse control protects `/api/stamps`.

## Preflight network check

Run:

```bash
node scripts/check-devnet.mjs
```

The script checks the RPC genesis hash and confirms that the canonical Memo account is executable. The pinned devnet genesis hash is:

```text
EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
```

## Receipt and verification

A receipt contains the receipt version, network label, devnet genesis hash, transaction signature, actual top-level instruction index discovered during read-back, Memo program, SHA-256, slot, and blockchain-reported time when available.

The receipt is a locator plus convenience metadata. During later checking, the public transaction is authoritative. The checker uses the receipt's transaction signature and instruction index to locate the record, then validates the transaction and compares the selected file with the digest decoded from the Memo. Receipt hash, time, slot, network, genesis, or program fields cannot override that public record. If those fields were edited while the file still matches the chain, the UI reports the metadata difference separately.

The displayed blockchain time is Solana's reported/estimated block production time for the transaction. It is not the file's creation date, photo capture time, device time, or proof of an earlier date written inside the file.

Existing receipts can be checked without the ProofStamp submission service. Verification still depends on a trusted Solana RPC that has access to the relevant transaction history. Genesis-hash checking prevents accidental use of another cluster but does not make an RPC cryptographically trustworthy.

## Privacy and limits

- file size: 25 MiB
- devnet only; devnet can reset
- no permanent-record claim
- no identity or authorship claim
- no claim that stamped content is true
- no custom Solana program
- no ZeroDev in v1
- no application database in v1
- no exactly-once submission guarantee
- no file, filename, or arbitrary transaction payload accepted by the server path

A public SHA-256 digest is not encryption. Someone who already has or can guess a candidate file can hash it and test whether it matches the public record.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Tests

```bash
npm run test
npm run build
```

The automated suite covers hash encoding and a known SHA-256 vector, canonical Memo grammar, Base58 handling, receipt parsing, RPC verification outcomes, signature status/block-height helpers, and submission endpoint guardrails. CI also type-checks/builds the frontend and checks/imports the Worker and Pages Function.

The production release smoke test has covered sponsored creation through finalized read-back, receipt generation, original-file verification, and an altered-file mismatch. Additional operational checks are tracked in [RELEASE.md](RELEASE.md).
