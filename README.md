# ProofStamp via Solana

ProofStamp via Solana is a small Solana **devnet** prototype. A user selects a file, the browser calculates SHA-256 locally, and a restricted service records only the digest in a Solana Memo transaction paid by an operator-controlled devnet fee payer.

There is no user wallet, seed phrase, token balance, faucet step, passkey, or ZeroDev dependency in v0.1.0.

## v0.1 flow

```text
file on device
     |
     | local SHA-256
     v
proofstamp:v1:sha256:<digest>
     |
     | POST digest + requestId only
     v
Cloudflare Pages Function -> restricted devnet fee payer -> Solana Memo
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

The app currently accepts legacy and v0 transactions during verification and requests `maxSupportedTransactionVersion: 0` from RPC.

## Architecture

- React + TypeScript + Vite frontend hosted on Cloudflare Pages
- Web Crypto SHA-256 in the browser
- independent browser JSON-RPC verification
- Cloudflare Pages Function at `/api/stamps` for restricted transaction construction/signing
- shared server implementation in `worker/index.mjs`
- Cloudflare D1 for the 24-hour recovery journal, global budget, and short-lived abuse-control buckets
- `@solana/kit` 8.3.0 and `@solana-program/memo` 0.13.1 for the server transaction path
- operator-controlled devnet fee payer; ZeroDev deliberately deferred

This implementation follows the v0.1 review/implementation plan and reuses the ProofStamp product posture from the Arbitrum prototype while replacing wallet/EAS logic with a simple Solana Memo record.

## Local frontend setup

Requirements: Node 22.13+ and npm 12.0.2+.

The Node 22 GitHub runner currently ships an npm 10 release that fails while resolving this fresh Solana package graph, so this repo pins the tested install path to npm 12.0.2.

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

On Cloudflare Pages, leave `VITE_SUBMIT_API_BASE` empty so the frontend uses the same-origin `/api/stamps` Pages Function. For local frontend-only development, set it to a local API origin if needed.

If a second reviewed devnet RPC is available, set it as `VITE_SOLANA_RPC_FALLBACK_URL`. Do not put private RPC credentials into a Vite variable.

## Cloudflare Pages deployment

Use one Cloudflare Pages project for the Vite frontend and the `/api/stamps` Pages Function.

Recommended Git deployment settings:

```text
Repository: Proof-Stamp/solana
Production branch: main
Build command: npm install --global npm@12.0.2 && npm install --ignore-scripts && npm run build
Build output directory: dist
Root directory: /
```

The repository contains `functions/api/stamps.mjs`, so Cloudflare Pages exposes the submission endpoint at `/api/stamps`. `public/_routes.json` limits Pages Functions routing to `/api/*`; the rest is static Pages content.

### D1 and server bindings

1. Create a D1 database named `proofstamp-solana-devnet`.
2. Bind it to the Pages project as `DB`.
3. Apply `migrations/0001_init.sql` to that database.
4. Create a **dedicated devnet-only** Solana keypair and fund it with a small amount of devnet SOL.
5. Configure these Pages environment variables/secrets:

```text
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_EXPECTED_GENESIS_HASH=EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
SUBMISSION_ENABLED=false
DAILY_TRANSACTION_CAP=250
REQUESTS_PER_5_MINUTES=12
SOLANA_FEE_PAYER_SECRET=<secret>
RATE_LIMIT_SALT=<secret>
ALLOWED_ORIGIN=https://<your-pages-or-custom-domain>
```

Keep `SUBMISSION_ENABLED=false` for the first deployment. Verification should work without enabling the fee payer. Enable creation only after the devnet preflight succeeds and the signer is funded.

`wrangler.jsonc` remains useful for local/server-side testing, but a separate production Worker deployment is not required when using Pages Functions.

## Preflight network check

Run this before funding or enabling the signer:

```bash
node scripts/check-devnet.mjs
```

The script checks the RPC genesis hash and confirms that the canonical Memo account is executable. The pinned devnet genesis hash in this release is:

```text
EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
```

A devnet reset requires a reviewed config update rather than silently trusting a new network.

## Recovery behavior

Each random request ID is bound to one digest. Retrying the same ID never intentionally creates a fresh proof.

The service persists the signed transaction and signature before broadcasting. When a response is lost, it checks the existing signature and can rebroadcast the **same signed transaction** while its blockhash remains valid. If expiry is reached and history cannot establish whether the transaction landed, the request becomes `uncertain`; the service does not blindly create a second transaction.

The request journal is operational state, not proof. Existing receipts are checked directly against Solana RPC and do not require the submission service.

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
- no ZeroDev in v0.1
- no file, filename, or arbitrary transaction payload accepted by the server path

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Tests

```bash
npm run test
npm run build
```

Before release, also complete live devnet smoke checks for original-vs-altered files, finalized read-back, receipt edits, wrong program/network/index, RPC failure, lost submission response, request recovery, and sponsor-offline verification.
