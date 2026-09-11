# Privacy notes

ProofStamp via Solana is designed so the selected file stays in the browser.

## Browser

The browser reads the selected file only to calculate SHA-256 locally. For creation, application code sends the submission service only:

- protocol version
- a random request ID
- the 64-character SHA-256 digest

The browser later reads the public Solana transaction through an RPC endpoint. During verification, the browser calculates the selected file's SHA-256 locally and compares it with the digest decoded from the public transaction. The original file is never sent to the submission service or a Solana RPC endpoint by application code.

The browser does not intentionally send the filename or media type to the submission service.

## Submission service

The Cloudflare Pages Function receives the digest and request ID, constructs a fixed Memo transaction, signs it with the dedicated devnet fee payer, and submits it to the configured Solana RPC.

v1 has no application database or recovery journal. ProofStamp does not intentionally store the request ID, digest, signed transaction bytes, filename, or original file in application storage. Cloudflare and the configured Solana RPC provider may maintain their own infrastructure, security, access, or abuse-prevention logs according to their policies.

Do not describe this version as having “no API”, “no backend”, or “no stored data”. It uses a server-side submission endpoint, and infrastructure providers may retain operational logs.

## Public data

The SHA-256 digest, transaction timing, fee-payer address, transaction signature, slot, and normal Solana transaction metadata are public on Solana devnet. The file itself is not written to Solana.

A SHA-256 digest is not encryption. A person who already possesses or can guess a candidate file can calculate its SHA-256 and compare it with the public digest. Do not ProofStamp material whose mere presence can be inferred from a small or easily guessable set of candidate files unless that disclosure risk is acceptable.

## Devnet and verification providers

Solana devnet can reset, and an RPC provider may not retain all historical transactions. Existing ProofStamps can be checked without the ProofStamp submission service, but checking still depends on an RPC provider that can return the relevant Solana history.
