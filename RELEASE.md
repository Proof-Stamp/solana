# Public release checklist

This checklist separates source readiness from deployment and GitHub administration. Do not make the repository public merely because CI is green.

## 1. Source and protocol

- [ ] Review the final PR diff against `main`.
- [ ] CI passes on the exact commit intended for release.
- [x] `package-lock.json` is committed and CI uses `npm ci --ignore-scripts`.
- [x] The reachable `main` Git history has been checked for obvious fee-payer keys, private RPC credentials, and other secret-like material without printing candidate values.
- [ ] The dedicated devnet fee payer is rotated if there is any uncertainty about prior exposure outside Git history, such as logs, screenshots, issues, or chat transcripts.
- [x] `wrangler.jsonc` keeps `SUBMISSION_ENABLED=false` as the repository default.

## 2. Cloudflare deployment controls

Complete these before enabling sponsored creation for public traffic:

- [ ] Production and preview environments use only Solana devnet.
- [ ] Production `SOLANA_FEE_PAYER_SECRET` is a Cloudflare secret, not a build variable or repository value.
- [ ] Preview deployments keep `SUBMISSION_ENABLED=false` and do not receive the production fee-payer secret unless there is a deliberate, separately reviewed reason.
- [ ] The fee payer holds only a small amount of devnet SOL.
- [ ] `/api/stamps` has an edge rate limit or equivalent abuse control.
- [ ] The operator can disable creation quickly with `SUBMISSION_ENABLED=false`.
- [ ] The deployed HTML exposes `proofstamp-build` and `proofstamp-deployment` meta tags.
- [ ] The `proofstamp-build` value matches the intended Git commit.

## 3. Live devnet smoke test

Run against the exact deployment that will be linked from the public repository:

- [ ] Select a small test file and confirm its SHA-256 is calculated locally.
- [ ] Create one ProofStamp and record the transaction signature.
- [ ] Confirm the UI does not report success before finalized read-back.
- [ ] Open the Solana Explorer link and confirm the transaction is on devnet.
- [ ] Download the receipt.
- [ ] Check the original file with the receipt and get a match.
- [ ] Change one byte of the file and confirm a mismatch.
- [ ] Edit receipt metadata while keeping the transaction locator intact and confirm the file is compared with the public record, not trusted receipt metadata.
- [ ] Check a nonexistent transaction and confirm it is reported as not found, not indefinitely pending.
- [ ] Test an unavailable/wrong-network RPC and confirm the result is distinct.
- [ ] Disable sponsored creation and confirm an existing receipt can still be verified through Solana RPC.

## 4. Public repository administration

- [ ] Set a concise repository description and the deployed application as the GitHub homepage.
- [ ] Add relevant repository topics.
- [ ] Protect `main` and require CI before merge.
- [ ] Enable private vulnerability reporting if available.
- [ ] Delete the obsolete `feat/v0.1-solana-devnet` branch after confirming it contains no unique work.
- [ ] Keep the public-release PR and its CI evidence in repository history.

## 5. Visibility change

Only after the previous sections are complete:

- [ ] Merge the reviewed hardening PR.
- [ ] Deploy the reviewed `main` commit.
- [ ] Repeat the minimal creation + verification smoke test on production.
- [ ] Change repository visibility to public.
- [ ] Confirm README, Privacy, Security, How it works, and deployment links are accessible to a logged-out visitor.

## Scope

v0.1 intentionally remains a devnet prototype with an operator-controlled fee payer, the canonical Solana Memo program, no ZeroDev integration, no custom Solana program, and no application database. A future architecture change should be evaluated separately rather than folded into this release checklist.
