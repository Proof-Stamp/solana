# Privacy notes

ProofStamp via Solana is designed so the selected file stays in the browser.

## Browser

The browser reads the selected file only to calculate SHA-256 locally. It sends the submission service only:

- protocol version
- a random request ID
- the 64-character SHA-256 digest

The browser later reads the public Solana transaction through an RPC endpoint. The original file is never sent to the submission service or an RPC endpoint by application code.

## Submission service

The Cloudflare Pages Function receives the digest and request ID, constructs a fixed Memo transaction, signs it with the dedicated devnet fee payer, and submits it to the configured Solana RPC.

v1 has no application database or recovery journal. ProofStamp does not intentionally store the request ID, digest, signed transaction bytes, filename, or original file in application storage. Cloudflare and the configured Solana RPC provider may maintain their own infrastructure logs and retention policies.

Do not claim that the service has “no API”, “no backend”, or “no stored data”. The application does use a server-side submission endpoint, and infrastructure providers may retain operational logs.

## Public data

The SHA-256 digest, transaction timing, fee-payer address, and transaction activity are public on Solana devnet. The file itself is not written to Solana.
