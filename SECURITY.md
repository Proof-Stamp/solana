# Security notes

This repository is a devnet prototype. Do not reuse its fee-payer key for mainnet or any wallet holding valuable assets.

## Submission boundary

`POST /api/stamps` accepts only protocol version, UUID v4 request ID, and a lowercase 64-character SHA-256 digest. The server constructs the entire transaction. It does not accept serialized transactions, arbitrary instructions, addresses, RPC URLs, filenames, or file bytes.

The fee payer is stored only in the Cloudflare secret `SOLANA_FEE_PAYER_SECRET`. Keep the account low-balance and devnet-only. Creation can be disabled with `SUBMISSION_ENABLED=false` without affecting browser verification of existing receipts.

v1 deliberately has no application database and no exactly-once submission guarantee. The browser does not automatically retry the same request after a failed submission response because a transaction may already have reached Solana. This keeps the prototype small while avoiding deliberate duplicate retries.

CORS/origin checks are not an abuse-prevention system. Before wider public testing, add Cloudflare edge rate limiting or another bounded-spend control. Keep the signer funded only with the small amount of devnet SOL needed for testing.

## Network pinning

Both the server path and browser checker compare `getGenesisHash` with the configured Solana devnet genesis hash before trusting an RPC. The browser independently reads and validates the finalized transaction rather than trusting the submission response.

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
