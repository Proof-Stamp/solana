# ProofStamp via Solana

ProofStamp via Solana is a small Solana **devnet** prototype. A user selects a file, the browser calculates SHA-256 locally, and a Cloudflare Pages Function records only the digest in a Solana Memo transaction paid by an operator-controlled devnet fee payer.

There is no user wallet, seed phrase, token balance, faucet step, passkey, ZeroDev dependency, or application database in v1.

## v1 flow

```text
file on device
     |
     | local SHA-256
     v
proofstamp:v1:sha256:<digest>
     |
     | POST digest + requestId only
     v
Cloudflare Pages Function -> devnet fee payer -> Solana Memo
     |
     | independent browser read-back at finalized
     v
human-readable receipt
     |
     +--> later: file + receipt -> public transaction -> match / mismatch
```

The file never leaves the browser through application code. The public chain record contains the digest, timing, fee-payer activity, and normal Solana transaction metadata.

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
- Web Crypto SHA-256 in the browser
- independent browser JSON-RPC verification
- Cloudflare Pages Function at `/api/stamps` for restricted transaction construction/signing
- shared server implementation in `worker/index.mjs`
- `@solana/kit` and `@solana-program/memo` for the server transaction path
- dedicated operator-controlled devnet fee payer
- no D1 or other application database in v1

The tradeoff is deliberate: v1 does not provide exactly-once submission or server-side recovery. If the HTTP response is lost after a transaction is submitted, the app does not automatically retry because that could create a duplicate ProofStamp.

## Local setup

Requirements: Node 22.13+ and npm 12.0.2+.

```bash
npm install --global npm@12.0.2
npm install
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

Recommended Git deployment settings:

```text
Repository: Proof-Stamp/solana
Production branch: main
Build command: npm install --global npm@12.0.2 && npm install --ignore-scripts && npm run build
Build output directory: dist
Root directory: /
```

The repository contains `functions/api/stamps.mjs`, so Cloudflare Pages exposes the submission endpoint at `/api/stamps`. `public/_routes.json` limits Pages Functions routing to `/api/*`.

### Pages environment variables

```text
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_EXPECTED_GENESIS_HASH=EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
SUBMISSION_ENABLED=false
ALLOWED_ORIGIN=https://<your-pages-or-custom-domain>
```

Add this as a secret, not a public build variable:

```text
SOLANA_FEE_PAYER_SECRET=<64-byte Solana CLI keypair JSON array or base64>
```

No D1 binding is required.

Keep `SUBMISSION_ENABLED=false` for the first deployment. Enable creation only after the devnet network check succeeds and the dedicated signer is funded with a small amount of devnet SOL.

## Preflight network check

Run:

```bash
node scripts/check-devnet.mjs
```

The script checks the RPC genesis hash and confirms that the canonical Memo account is executable. The pinned devnet genesis hash in this release is:

```text
EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
```

## Receipt and verification

A receipt contains:

- receipt version
- network label
- devnet genesis hash
- transaction signature
- actual top-level instruction index discovered during read-back
- Memo program
- SHA-256
- slot
- blockchain-reported time when available

During later checking, the public transaction is authoritative. A matching file is compared with the digest decoded from the Memo. If receipt fields differ from the public transaction, the UI reports that separately rather than calling it tampering.

## Limits

- file size: 25 MiB
- devnet only
- no identity/authorship claim
- no claim that stamped content is true
- no permanent-record claim because Solana devnet can reset
- no custom Solana program
- no ZeroDev in v1
- no application database in v1
- no exactly-once submission guarantee
- no file, filename, or arbitrary transaction payload accepted by the server path

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Tests

```bash
npm run test
npm run build
```

Before release, complete live devnet smoke checks for original-vs-altered files, finalized read-back, receipt edits, wrong program/network/index, RPC failure, and sponsor-offline verification.
