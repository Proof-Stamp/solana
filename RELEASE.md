# Release and operational checks

This document is current operational guidance for the Solana devnet prototype. It is not a launch checklist, and repository visibility does not prove that external controls are configured.

## Scope

The current v1 scope is Solana devnet, browser SHA-256 over exact file bytes, restricted sponsored creation through `/api/stamps`, canonical Memo transactions, finalized confirmation and public read-back, and portable receipt verification against the public transaction.

Mainnet, user wallets, passkeys, ZeroDev, custom programs, and an application database remain outside this version.

## Before a release

For the exact commit being released:

1. Confirm CI is green for the required `test` check.
2. Review the final diff, especially sponsor endpoint, RPC validation, receipt format, protocol constants, hashing, and recovery behavior.
3. Exercise relevant browser flows at desktop and narrow-mobile widths when UI behavior changed.
4. Run one harmless devnet create → finalized read-back → receipt → original match → altered mismatch smoke test.
5. Confirm known-signature recovery checks the existing transaction and does not send a second `/api/stamps` request.
6. Confirm `SUBMISSION_ENABLED=false` stops new creation while existing receipts remain verifiable.

A successful deployment or historical test result is not evidence for a newer commit.

## Operational checks requiring direct account access

These cannot be established from repository source alone and should be checked in the actual Cloudflare/Solana environment when relevant:

- production and preview use the intended devnet RPC/genesis configuration;
- production and preview keep their intended environment separation;
- preview sponsored creation remains disabled;
- the dedicated devnet fee payer remains low-balance;
- `/api/stamps` has an active rate limit or equivalent abuse control;
- the kill switch behaves as expected;
- deployed HTML contains the expected `proofstamp-build` metadata and matches the intended Git commit.

Do not mark these complete based only on source configuration, repository visibility, or a successful Pages build.

## Historical public-readiness evidence

The public-readiness work was merged in [PR #17](https://github.com/Proof-Stamp/solana/pull/17). That PR and its linked commits and CI runs are historical evidence only; they do not establish current release status.

Notable historical evidence referenced during that work includes [GitHub Actions run 34863869702](https://github.com/Proof-Stamp/solana/actions/runs/34863869702) for release-candidate CI and [run 34863568754](https://github.com/Proof-Stamp/solana/actions/runs/34863568754) for the repository-history scan. Use fresh evidence from the exact commit for current releases.

## Follow-up candidate outside this cleanup

Browser verification and confirmation validate the configured devnet genesis hash repeatedly across status, block-height, and transaction read-back calls. Preserve the network check. If this is optimized later, first measure request counts for representative create/check flows, then demonstrate that any reuse keeps wrong-network failures explicit.
