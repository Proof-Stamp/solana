# Public release evidence and owner checklist

This file records what was inspected for the public-release candidate and what still needs direct evidence. A historical checkmark is not treated as proof for a newer commit.

## Release candidate

- Source baseline refreshed on 2026-09-14: `main` at `5cfd6b4cfbae38f8fcc4cc73d2856b869505bb0a`.
- Working branch: `release/public-readiness-2026-09-14`.
- Scope remains Solana **devnet**, browser SHA-256, restricted sponsored creation, canonical Memo transactions, finalized read-back, and browser verification.
- Mainnet, user wallets, passkeys, ZeroDev, custom programs, and an application database are outside this release.

## Verification evidence

| Check | Environment / evidence type | Result | Limitation |
| --- | --- | --- | --- |
| Initial CI at `72db1453d2490e5d877baa7b5779ad3552ac2726` | GitHub Actions run `34848240467` supplied in the release brief | Passed | Historical evidence only. It does not validate the current branch. |
| Current source review | GitHub source + diff inspection from refreshed `main` | Completed | Source inspection is not browser execution. |
| Verification input invalidation | Focused `AsyncOperationGate` regression test added on release branch | Added | Must pass CI on the final PR head. |
| Known-signature recovery classification | Focused recovery regression tests added on release branch | Added | Must pass CI on the final PR head. |
| Existing dependency PRs #6-#11 | Their PR head commits each have a completed successful CI run | Passed on those dependency branches | Their CI does not validate this release branch or make the upgrades necessary. |
| Live app / deployment SHA | Direct live-site access was not available in this review environment | Unverified | Read `proofstamp-build` and `proofstamp-deployment` from the deployed HTML after deployment and compare the SHA with the approved commit. |
| Current browser create / receipt / match / mismatch flow | Not executed in this review environment | Unverified | Run on the approved deployment or a trusted preview after CI. |
| Cloudflare edge rate limit | Prior release notes claim a control exists | Unverified now | CORS is not a rate limit. Confirm the active Cloudflare rule or equivalent control in the account. |
| Fee-payer balance | Requires Solana/account access | Unverified | Confirm the dedicated devnet signer holds only a small amount of devnet SOL. |

The final draft PR must have green CI on its current head before approval. CI runs `npm test`, `npm run build`, Worker and Pages Function syntax checks, and import checks. `npm run build` includes TypeScript checking. There is no separate lint/format check.

## Correctness changes in this candidate

The public-release candidate specifically addresses two release blockers:

1. **Verification results belong to the current inputs.** Changing the file, receipt source/text, custom RPC, or leaving the Check view invalidates the previous verdict and public record. An older asynchronous operation carries a generation token and cannot overwrite a newer selection. Inputs that affect the result are disabled while a check is running.
2. **A known transaction is recovered by checking that transaction.** Once the sponsor response contains a signature, transient confirmation/RPC/read-back errors preserve the signature and explorer link and offer **Check this transaction again**. That action resumes confirmation/read-back and does not call the stamp submission endpoint. Failed or expired transactions remain definite outcomes. A lost/ambiguous submission response remains distinct and is not blindly retried.

The candidate also catches clipboard failure, replaces incomplete tab semantics with ordinary pressed-state mode buttons, removes low-value abbreviated infrastructure identifiers from the footer, adds a Source link, and expands the visible proof limitations.

## Manual browser scenarios still required

Run these on the exact candidate deployment. Record the commit SHA, deployment URL, time, and result in the PR before approval.

1. Create one proof from a harmless file. Confirm success appears only after finalization and public read-back. In browser network tools, confirm the application POST contains the protocol version, request ID, and digest only, not file bytes or filename.
2. Keep/download the receipt. Reload, verify the original file, then alter a copy and confirm mismatch against the same public transaction.
3. Edit receipt convenience metadata while preserving the transaction signature and instruction index. Confirm the file verdict follows the public chain record and metadata differences are reported separately.
4. Start a check and change each relevant input before a later check: selected file, receipt, and custom RPC. Confirm an old result never reappears for the new inputs.
5. Exercise pending, failed, expired, missing-record, wrong-network, and unavailable-RPC outcomes using controlled cases where practical. None may become success. For a known signature after a transient failure, use **Check this transaction again** and confirm no second `/api/stamps` request is sent.
6. Disable the local/preview submission service and confirm an existing receipt can still be checked through RPC.
7. Check keyboard operation, focus visibility, a narrow mobile viewport, and reduced-motion behavior. Capture one desktop and one narrow-mobile screenshot of the real candidate UI for the PR/README release package. Do not fabricate successful states.

## Secrets and private operational material

Publication requires two different checks: the current tree and reachable history.

- Current release changes were inspected for environment files, signer material, RPC credentials, private operational notes, and generated files. Example configuration contains placeholders and public devnet identifiers only.
- No repository tags were present when the Git refs were checked.
- PR #5 records that a temporary full-history scanner checked reachable `main` history and found only documentation-placeholder false positives after correction. That is useful **historical evidence**, not a newly executed scan for this candidate.
- Since the baseline supplied for this review (`72db1453...`), refreshed `main` changed only `src/App.tsx` and `src/styles.css` before this release branch. Those changes were inspected and do not contain credentials.
- The available GitHub connector does not provide a fresh full historical-blob secret scanner. Before visibility changes, rerun an approved local/history scanner against all refs, for example with Gitleaks or an equivalent tool configured to inspect all reachable Git history. Do not paste candidate secrets into the PR. If anything real is found, rotate it first and keep publication blocked. Deleting it from the latest tree is insufficient.

Also review Cloudflare build/deploy logs, GitHub issue/PR attachments, screenshots, and any copied diagnostics for signer or RPC secrets. The release review inspected accessible PR discussion and CI/deployment comments but did not have Cloudflare account log access.

## Dependency PR disposition

All six open Dependabot PR heads currently have successful CI. None is required to solve a release blocker, so keep dependency churn separate from the public-release PR.

| PR | Change | Release disposition |
| --- | --- | --- |
| #6 | `actions/setup-node` 4 → 7 | **Defer and review separately.** Major action/runtime change. The update includes dependency/security hardening, but current CI pins the existing action by full commit SHA and no release blocker was identified. |
| #7 | `actions/checkout` 4 → 7.0.1 | **Defer and review separately.** Major action behavior/runtime change with security-related fixes. Evaluate the workflow semantics in its own PR rather than folding it into the release. |
| #8 | Vitest 4.1.11 → 5.0.0 | **Defer.** Major test-runner release with breaking changes and a newer Node requirement. Not needed for this release. |
| #9 | `@vitejs/plugin-react` 6.1.0 → 6.1.1 | **Good low-risk follow-up.** Patch update and CI is green. Merge separately after the release PR unless a newly disclosed security issue makes it urgent. |
| #10 | TypeScript 5.9.3 → 7.0.2 | **Defer.** Major compiler/toolchain change. Keep separate and review generated diagnostics/build behavior. |
| #11 | `@types/react-dom` 19.2.5 → 19.2.7 | **Good low-risk follow-up.** Patch type update and CI is green. Merge separately after the release PR. |

## Branch disposition

Do not delete branches as part of this task. The following recommendations are for the owner after the release PR is merged.

| Branch | Evidence | Proposed disposition |
| --- | --- | --- |
| `feat/v0.1-solana-devnet` | Behind `main` with `ahead_by: 0`; its PRs #1-#4 were merged | Safe to delete after final owner review. |
| `fix/pages-env-config` | Behind `main` with `ahead_by: 0`; PR #12 merged | Safe to delete after final owner review. |
| `ux/issue-13-check-selectors` | Behind `main` with `ahead_by: 0`; PR #16 merged | Safe to delete after final owner review. |
| `ux/finalization-progress` | Branch head is the merged PR #15 head; later `main` contains the finalization/status UX | Safe to delete after confirming no post-merge commits were added. |
| `docs/public-release-final` | Branch head is the merged PR #14 head; later `main` contains the release documentation changes | Safe to delete after confirming no post-merge commits were added. |
| `chore/public-release-hardening` | Branch head is the merged PR #5 head; compare is divergent because the merged history was replayed/advanced on `main` | Safe to delete only after confirming no post-merge commits beyond the merged PR head. |
| `release/public-readiness-2026-09-14` | Current review branch | Keep through approval/merge; delete only after release handoff is complete. |

Dependabot branches should follow the corresponding PR disposition rather than being manually deleted first.

## GitHub metadata for owner review

Do not change repository settings until the code and operational gates are approved.

- **Description:** `Create and verify file proofs on Solana devnet. Local SHA-256, sponsored transactions, no user wallet.`
- **Homepage:** `https://solana.proofstamp.org`
- **Topics:** `solana`, `devnet`, `sha256`, `timestamping`, `file-integrity`, `typescript`
- Protect `main` and require the existing **CI** check before merge. Keep force pushes and branch deletion disabled for protected `main` unless there is a deliberate maintenance reason.
- Enable private vulnerability reporting if available for the repository/account.

## Cloudflare / operator checks before public visibility

Confirm in the actual account rather than relying on source configuration alone:

- production and preview use the intended devnet RPC/genesis configuration;
- production signer material is a secret, not a build variable, and is absent from previews;
- preview sponsored creation remains disabled;
- the dedicated fee payer is low-balance and devnet-only;
- `/api/stamps` has an active edge rate limit or equivalent abuse control;
- `SUBMISSION_ENABLED=false` stops new creation while existing receipts can still be checked;
- deployed HTML contains `proofstamp-build` and `proofstamp-deployment`, and the build SHA equals the approved Git commit.

## Release decision

**Blocked pending final approval evidence.** The source candidate addresses the identified correctness and presentation issues, but public visibility should wait for:

1. green CI on the final draft-PR head;
2. the manual browser scenarios above, including real desktop/mobile screenshots;
3. a fresh all-history/all-ref secret scan or equivalent owner-approved evidence;
4. direct confirmation of Cloudflare rate limiting, secret separation, kill switch, fee-payer balance, and deployed commit metadata.

No mainnet migration or architecture expansion is required to clear these gates.

## Final owner sequence

1. Review the complete draft PR diff and its CI/manual evidence.
2. Approve and merge the reviewed PR.
3. Deploy the **approved merge commit**.
4. Verify `proofstamp-build` matches that commit and run the minimal live create → finalized read-back → original match → altered mismatch flow.
5. Confirm the Cloudflare controls and fresh secret-scan result.
6. Apply the GitHub description, homepage, topics, branch protection, and private vulnerability-reporting settings.
7. Approve the repository visibility change to public.
8. While logged out, check README rendering, Mermaid, brand assets, LICENSE, CONTRIBUTING, SECURITY, PRIVACY, How it works, Source, and live-app links.
9. Remove obsolete merged branches only after the visibility release is stable and the owner has confirmed their disposition above.
