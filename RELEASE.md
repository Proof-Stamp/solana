# Public release checklist

This checklist separates source readiness from deployment and GitHub administration. Do not make the repository public merely because CI is green.

## 1. Source and protocol

- [x] Review the final PR diff against `main`.
- [x] CI passes on the exact commit intended for release.
- [x] `package-lock.json` is committed and CI uses `npm ci --ignore-scripts`.
- [x] The reachable `main` Git history has been checked for obvious fee-payer keys, private RPC credentials, and other secret-like material without printing candidate values.
- [ ] The dedicated devnet fee payer is rotated if there is any uncertainty about prior exposure outside Git history, such as logs, screenshots, issues, or chat transcripts.
- [x] `wrangler.jsonc` keeps `SUBMISSION_ENABLED=false` as the local/default repository setting, disables preview creation, and explicitly enables production creation.

## 2. Cloudflare deployment controls

Complete these before enabling sponsored creation for public traffic:

- [x] Production and preview are pinned to the Solana devnet genesis hash.
- [x] Production `SOLANA_FEE_PAYER_SECRET` is a Cloudflare secret, not a build variable or repository value.
- [x] Preview deployments keep `SUBMISSION_ENABLED=false` and do not receive the production fee-payer secret.
- [ ] The fee payer holds only a small amount of devnet SOL.
- [x] `/api/stamps` has an edge rate limit or equivalent abuse control.
- [x] The operator can disable creation with `SUBMISSION_ENABLED=false`.
- [ ] Confirm the deployed HTML exposes `proofstamp-build` and `proofstamp-deployment` meta tags.
- [ ] Confirm the `proofstamp-build` value matches the intended Git commit.

## 3. Live devnet smoke test

Run against the exact deployment that will be linked from the public repository:

- [x] Select a small test file and confirm its SHA-256 is calculated locally.
- [x] Create one ProofStamp through the production sponsor endpoint.
- [x] Reach the finalized **Public record verified** state.
- [ ] Open the Solana Explorer link and independently confirm the transaction is on devnet.
- [x] Obtain the receipt and use it for later checking.
- [x] Check the original file with the receipt and get a match.
- [x] Change the file and confirm a mismatch against the same public record.
- [ ] Edit receipt metadata while keeping the transaction locator intact and confirm the file is compared with the public record, not trusted receipt metadata.
- [ ] Check a nonexistent transaction and confirm it is reported as not found, not indefinitely pending.
- [ ] Test an unavailable/wrong-network RPC and confirm the result is distinct.
- [ ] Disable sponsored creation and confirm an existing receipt can still be verified through Solana RPC.

## 4. Public repository administration

- [ ] Set a concise repository description and `https://solana.proofstamp.org` as the GitHub homepage.
- [ ] Add relevant repository topics.
- [ ] Protect `main` and require CI before merge.
- [ ] Enable private vulnerability reporting if available.
- [ ] Delete obsolete release branches after confirming they contain no unique work needed on `main`.
- [x] Keep the public-release PR and its CI evidence in repository history.

## 5. Visibility change

Only after the previous sections are complete:

- [x] Merge the reviewed hardening PR.
- [x] Deploy the reviewed `main` code to production.
- [x] Run the minimal creation + original/mismatch verification smoke test on production.
- [ ] Change repository visibility to public.
- [ ] Confirm README, Privacy, Security, How it works, and deployment links are accessible to a logged-out visitor.

## Scope

v0.1 intentionally remains a devnet prototype with an operator-controlled fee payer, the canonical Solana Memo program, no ZeroDev integration, no custom Solana program, and no application database. A future architecture change should be evaluated separately rather than folded into this release checklist.
