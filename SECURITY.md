# Security notes

This repository is a devnet prototype. Do not reuse its fee-payer key for mainnet or any wallet holding valuable assets.

## Submission boundary

`POST /api/stamps` accepts only protocol version, UUID v4 request ID, and a lowercase 64-character SHA-256 digest. The server constructs the entire transaction. It does not accept serialized transactions, arbitrary instructions, addresses, RPC URLs, filenames, or file bytes.

The fee payer is stored only in the Worker secret `SOLANA_FEE_PAYER_SECRET`. Keep the account low-balance and devnet-only. Creation can be disabled with `SUBMISSION_ENABLED=false` without affecting browser verification of existing receipts.

D1 enforces a global daily transaction-attempt cap and a short-lived salted-IP rate bucket. Configure Cloudflare edge rate limiting as an additional control before wider public testing.

## Network pinning

Both the Worker and browser checker compare `getGenesisHash` with the configured Solana devnet genesis hash before trusting an RPC. The browser independently reads and validates the finalized transaction rather than trusting the submission response.

## Protocol validation

The checker requires:

- finalized `getTransaction` result
- `meta.err === null`
- requested signature equals the transaction's primary signature
- supported legacy or v0 transaction format
- the selected top-level instruction resolves to the canonical Memo program
- valid UTF-8 instruction data
- the exact `proofstamp:v1:sha256:<64 lowercase hex>` grammar

The resulting chain digest is authoritative for the file match verdict. Receipt metadata is informational and disagreements are reported separately.
