# Privacy notes

ProofStamp via Solana is designed so the selected file stays in the browser.

## Browser

The browser reads the selected file only to calculate SHA-256 locally. It sends the submission service only:

- protocol version
- a random request ID
- the 64-character SHA-256 digest

The browser later reads the public Solana transaction through an RPC endpoint. The original file is never sent to the submission service or an RPC endpoint by application code.

## Submission service

The devnet submission service processes the digest and request metadata needed to construct and recover a sponsored Solana transaction. For abuse controls it derives a short-lived salted hash from the connecting IP address. It does not store the raw IP address in the application database.

The D1 request journal stores request ID, digest, signed transaction bytes, transaction signature, status, block-height expiry information, and timestamps for approximately 24 hours. Signed transaction bytes contain the public fee-payer address and public ProofStamp Memo. They do not contain the fee-payer private key.

Cloudflare and the configured Solana RPC provider may maintain their own infrastructure logs and retention policies. Do not claim that the service has “no API”, “no backend”, or “no stored data”.

## Public data

The SHA-256 digest, transaction timing, fee-payer address, and transaction activity are public on Solana devnet. The file itself is not written to Solana.
