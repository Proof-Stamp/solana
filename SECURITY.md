# Security notes

ProofStamp via Solana is a Solana **devnet prototype**. Do not reuse its fee-payer key for mainnet, another environment, or any wallet holding valuable assets.

## Reporting security issues

Please do not publish a suspected vulnerability, exposed credential, or exploit in a public issue before it has been reviewed. If GitHub private vulnerability reporting is enabled for this repository, use **Security → Report a vulnerability**. Otherwise contact ProofStamp through https://proofstamp.org/contact-us/ and include enough detail to reproduce the issue.

## Submission boundary

`POST /api/stamps` accepts exactly three JSON fields:

- `protocolVersion: 1`
- a UUID v4 `requestId`
- a lowercase 64-character `sha256` digest

The endpoint rejects extra fields. The server constructs the complete transaction itself. It does not accept serialized transactions, arbitrary instructions, addresses, RPC URLs, filenames, file bytes, fee settings, or user-selected programs.

The only transaction created by this path is a Solana legacy transaction containing the canonical ProofStamp Memo payload. The operator-controlled devnet fee payer pays the normal network fee.

The fee payer is stored only in the Cloudflare secret `SOLANA_FEE_PAYER_SECRET`. Keep that account low-balance and devnet-only. Creation can be disabled with `SUBMISSION_ENABLED=false` without affecting browser verification of existing receipts. The checked-in configuration keeps creation disabled by default.

## Submission ambiguity and expiry

v1 deliberately has no application database and no exactly-once submission guarantee.

If the browser receives a transaction signature, it follows that signature with `getSignatureStatuses`, tracks the transaction's `lastValidBlockHeight`, and does not report success until the transaction is finalized and independently read back from Solana.

If the HTTP response is lost or the submission service returns a server error, the browser does **not** automatically repeat the submission. The transaction may already have reached Solana, and an automatic retry could create a second valid ProofStamp for the same digest.

If no transaction status is found before the submitted blockhash expires, creation is reported as expired rather than as indefinitely pending.

## Sponsor abuse controls

CORS and Origin checks are browser controls, not abuse-prevention controls. A caller outside a browser can invoke a public endpoint directly.

Before enabling sponsored creation for wider public use, configure a Cloudflare rate limit or equivalent edge control for `/api/stamps`. Keep the signer funded with only the small amount of devnet SOL required for testing. The low signer balance is the final hard bound on total sponsored spend for this prototype.

Do not put a fee-payer secret, private RPC credential, or other secret in a `VITE_*` variable. Vite variables are public browser configuration.

## Network and RPC trust

Both the submission path and browser verifier compare `getGenesisHash` with the configured Solana devnet genesis hash. This prevents accidental use of another Solana cluster.

Genesis-hash checking does not make an RPC endpoint cryptographically trustworthy. Verification depends on the selected RPC returning accurate Solana history. For higher assurance, use an independent trusted RPC or compare results from multiple providers.

Solana devnet can reset and RPC providers may prune history. This prototype therefore makes no permanent-record claim.

## Protocol validation

The checker requires a finalized transaction and validates:

- the requested signature is the transaction's primary signature
- transaction execution succeeded (`meta.err === null`)
- the transaction is legacy or version 0
- the selected top-level instruction resolves to the canonical Memo program
- Memo instruction data is valid UTF-8 and Base58-decoded correctly
- the payload is exactly `proofstamp:v1:sha256:<64 lowercase hex>`
- an unindexed transaction contains exactly one supported ProofStamp Memo

The digest read from the public transaction is authoritative for the file-match verdict. Receipt hash, time, slot, network label, genesis hash, and program fields are convenience metadata and cannot override the public record.

## Public-hash privacy

A SHA-256 digest is not encryption. The file is not published, but someone who already possesses or can guess a candidate file can hash that candidate and compare it with the public digest.

## Before making the repository public

Scan the full Git history for secrets, not only the current tree. Rotate the dedicated devnet fee payer if there is any uncertainty about whether its private key ever appeared in a commit, log, screenshot, issue, or chat transcript. Keep production and preview Cloudflare secrets separate from repository configuration.
