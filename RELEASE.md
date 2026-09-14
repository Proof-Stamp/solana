# Public release evidence and owner checklist

This file records what was inspected for the public-release candidate and what still needs direct evidence. A historical checkmark is not proof for a newer commit.

## Release candidate

- Source baseline refreshed on 2026-09-14: `main` at `5cfd6b4cfbae38f8fcc4cc73d2856b869505bb0a`.
- Working branch: `release/public-readiness-2026-09-14`.
- Scope remains Solana **devnet**, browser SHA-256, restricted sponsored creation, canonical Memo transactions, finalized read-back, and browser verification.
- Mainnet, user wallets, passkeys, ZeroDev, custom programs, and an application database are outside this release.

## Source-review result

The complete PR file list was reviewed before release approval. The candidate changes application UI/recovery logic, tests, documentation, and CI/tooling. It does **not** change `worker/index.mjs`, `functions/api/stamps.mjs`, `wrangler.jsonc`, or `package-lock.json`, so the sponsor endpoint implementation, Pages wrapper, deployment environment configuration, and application dependency lock are outside this PR's behavioral diff.

GitHub Actions on the release branch has completed successfully with install, lint, format check, typecheck, tests, production build, Worker/Pages syntax checks, and module import checks. The workflow is named `CI`; the actual status-check job to require in branch protection is **`test`**.

CI currently runs:

- `npm ci --ignore-scripts`
- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Worker and Pages Function syntax checks
- Worker and Pages Function module-import checks

The workflow also has read-only repository permissions, concurrency cancellation, a 10-minute timeout, and SHA-pinned GitHub Actions.

The ESLint/Prettier baseline is intentionally bounded. Their exact versions are pinned in npm scripts and fetched with `npx`; they are not part of `package-lock.json`. This avoids a broad lockfile rewrite in this release, but it is a deliberate tooling supply-chain tradeoff rather than a fully lockfile-reproducible setup.

## Verification evidence

| Check | Evidence | Result | Limitation |
| --- | --- | --- | --- |
| Source diff review | All 20 changed paths reviewed against refreshed `main` | Completed | Source review is not browser execution. |
| Final-tree CI before scan evidence update | GitHub Actions run `34863229403`, job `test`, head `6600c4cf…` | Passed | This documentation-only update still requires its own final CI. |
| Receipt-loading race guard | `AsyncOperationGate` + guarded `file.text()` path + focused regression coverage | Passed in CI | Full browser interaction remains a manual release check. |
| Verification stale-result guard | Generation-token logic + focused regression coverage | Passed in CI | Full browser interaction remains a manual release check. |
| Known-signature recovery | Recovery classification + source-wiring regression coverage | Passed in CI | Manual network inspection is still required to confirm zero second `/api/stamps` POSTs in the browser. |
| Cloudflare PR preview | Cloudflare PR bot reported successful preview deployment during candidate review | Available | Deployment success alone does not establish production secret configuration. |
| Owner preview review | Owner manually reviewed the candidate preview and reported it good | Passed at owner-review level | Individual edge-case scenarios were not separately itemized as evidence. |
| Fresh all-ref/all-history secret scan | Temporary read-only workflow run `34863136849` | Passed | High-signal scanner, not a commercial/entropy-based secret-scanning product. |
| Full create / receipt / match / mismatch flow on approved production merge | Not yet executed | Unverified | Required before public visibility. |
| Cloudflare edge rate limit and secret separation | Requires account/operator inspection | Unverified | CORS is not an abuse control. |
| Fee-payer balance | Requires operator/Solana account inspection | Unverified | Confirm the dedicated signer holds only a small devnet balance. |

The fresh scanner fetched repository branches, tags, and GitHub pull-request head refs, scanned commit messages and text blobs without printing candidate values, and reported: **no obvious secret literals across 149 unique reachable commits from 31 fetched refs**. It checked project-sensitive secret assignments, raw Solana/key byte arrays, long Base58 secret-like literals, private-key PEM markers, credential-bearing URLs, GitHub/AWS token patterns, bearer credentials, JWT-like values, and sensitive-looking committed filenames. The temporary workflow was then removed. The add/remove pair left no net file difference from the previously reviewed `4dd47ae…` candidate tree.

No inline PR review threads were open when last inspected. The PR remains draft and unmerged.

## Correctness changes in this candidate

1. **Verification results belong to the current inputs.** Changing the selected file, receipt source/text, or custom RPC invalidates the previous verdict and public record. Leaving the Check view also invalidates pending receipt loads and verification results. Older asynchronous operations carry generation tokens and cannot overwrite newer state.
2. **Receipt-file loading is guarded.** Selecting a newer receipt, replacing it with pasted text, clearing the selection, or leaving the Check view prevents an older delayed `file.text()` result from replacing the newer input. Receipt-read failures produce a bounded user-facing error.
3. **A known transaction is recovered by checking that transaction.** Once a sponsor response contains a signature, transient confirmation/RPC/read-back failures preserve the signature and explorer link and offer **Check this transaction again**. That action resumes confirmation/read-back and does not call `submitStamp`. Failed or expired transactions remain definite outcomes. A lost/ambiguous submission response remains distinct and is not blindly retried.

The candidate also handles clipboard failure with a selectable receipt fallback, replaces incomplete tab semantics with ordinary pressed-state mode buttons, simplifies the footer, links source/docs, and expands proof limitations.

## Automated-test limitation

The new regression tests cover the operation-gate behavior and inspect the relevant App wiring, but they are not full DOM or end-to-end browser tests. In particular, the zero-new-submission test establishes that the recovery handler does not call `submitStamp`; the browser release check must still confirm that clicking **Check this transaction again** produces no second `/api/stamps` request.

## Browser and deployment checks still required

Use the PR preview for layout, verification-only, accessibility, and stale-input checks that do not require sponsored creation. Preview sponsored creation should remain disabled and the production signer must not be exposed to preview.

After the reviewed PR is approved and merged **while the repository is still private**, deploy the approved merge commit to production and run the creation smoke test there before changing repository visibility.

Record commit SHA, deployment URL, time, and result for these scenarios where they have not already been explicitly evidenced:

1. Confirm desktop and narrow-mobile rendering, keyboard operation, focus visibility, reduced-motion behavior, README/Mermaid rendering, and the visible proof limitations. Capture real screenshots from the candidate if they will be used in the public README/release package.
2. Verify an existing receipt and original file, then an altered copy. Confirm match and mismatch use the public transaction.
3. Edit receipt convenience metadata while preserving the transaction signature and instruction index. Confirm chain data remains authoritative and metadata differences are reported separately.
4. Start verification and change each relevant input before the older request completes. Confirm an old result never reappears for the new inputs.
5. Exercise controlled missing-record, wrong-network, and unavailable-RPC cases. None may become success.
6. For a known signature after a transient failure, click **Check this transaction again** and confirm browser network tools show **zero** new `/api/stamps` requests.
7. After the approved merge commit is deployed privately to production, create one harmless proof. Confirm the POST contains protocol version, request ID, and digest only, then wait for finalized read-back, save the receipt, verify the original, and verify an altered copy mismatches.
8. Set `SUBMISSION_ENABLED=false` and confirm new creation stops while an existing receipt can still be checked.

Do not fabricate successful states or use screenshots from an older build as evidence for the candidate.

## Secrets and private operational material

Publication requires separate checks of the current tree, reachable Git history, and non-Git operational surfaces.

- A fresh Git-history scan passed in workflow run `34863136849`: no obvious secret literals across 149 unique reachable commits from 31 fetched refs.
- The scanner included branches, tags, pull-request heads, commit messages, and reachable text blobs, and intentionally did not print candidate secret values.
- The temporary scanner was removed after the successful run. Comparing the candidate before the temporary scanner (`4dd47ae…`) with the post-removal head (`6600c4cf…`) showed **no net changed files**.
- This Git scan does not inspect Cloudflare account data, private logs outside Git, deleted/unreachable Git objects, or arbitrary external attachments. Before visibility changes, also inspect Cloudflare build/deploy logs, GitHub issue/PR attachments, screenshots, and copied diagnostics for signer or private RPC material.
- If any real credential exposure is discovered outside Git, rotate it before publication even though the Git-history scan passed.

## Dependency PR disposition

The open Dependabot work remains maintenance, not a public-release blocker. Re-evaluate each PR on the updated base before merging it. Keep major upgrades separate unless a security issue makes one urgent.

| PR | Change | Release disposition |
| --- | --- | --- |
| #6 | `actions/setup-node` 4 → 7 | **Defer and review separately.** Major action/runtime change. |
| #7 | `actions/checkout` 4 → 7.0.1 | **Defer and review separately.** Major action/runtime change with security relevance. |
| #8 | Vitest 4.1.11 → 5.0.0 | **Defer.** Major test-runner change. |
| #9 | `@vitejs/plugin-react` 6.1.0 → 6.1.1 | **Low-risk follow-up.** Rebase/retest and merge separately if still clean. |
| #10 | TypeScript 5.9.3 → 7.0.2 | **Defer.** Major compiler/toolchain change. |
| #11 | `@types/react-dom` 19.2.5 → 19.2.7 | **Low-risk follow-up.** Rebase/retest and merge separately if still clean. |

A small, explained dependency backlog is acceptable at launch.

## Branch disposition

Do not delete branches before release stability is confirmed.

| Branch | Evidence | Proposed disposition |
| --- | --- | --- |
| `feat/v0.1-solana-devnet` | Behind `main`, no unique ahead commits when reviewed | Delete after release stability check. |
| `fix/pages-env-config` | Merged PR #12; no unique ahead commits when reviewed | Delete after release stability check. |
| `ux/issue-13-check-selectors` | Merged PR #16; no unique ahead commits when reviewed | Delete after release stability check. |
| `ux/finalization-progress` | Head matches merged PR #15 head | Delete after confirming no later unique work. |
| `docs/public-release-final` | Head matches merged PR #14 head | Delete after confirming no later unique work. |
| `chore/public-release-hardening` | Head matches merged PR #5 head; history comparison is divergent because of replay/advance on `main` | Delete only after confirming no later unique work. |
| `release/public-readiness-2026-09-14` | Current release branch | Keep through merge and release handoff. |

Dependabot branches follow their PR disposition.

## GitHub launch settings

Prepare these values before public visibility:

- **Description:** `Create and verify file proofs on Solana devnet. Local SHA-256, sponsored transactions, no user wallet.`
- **Homepage:** `https://solana.proofstamp.org`
- **Topics:** `solana`, `devnet`, `sha256`, `timestamping`, `file-integrity`, `typescript`
- Prefer squash-only merging and automatic deletion of merged branches.
- Disable unused repository surfaces such as Projects if they are not being used. Keep Wiki, Discussions, and GitHub Pages off unless there is a deliberate need.

Target `main` protection/ruleset:

- require a pull request before merge;
- require status check **`test`**;
- require review conversations to be resolved;
- use 0 required approving reviews while this is a solo-maintainer repository, unless the ownership model changes;
- block force pushes;
- block branch deletion;
- avoid broad bypass permissions.

During this review, GitHub's ruleset endpoint returned an upgrade-or-public-visibility restriction for the private repository. Therefore, settings that the current plan does not expose while private are **not** pre-public blockers. Prepare them now, make the approved repository public only after the technical release gates are satisfied, then apply the ruleset immediately.

Private vulnerability reporting is likewise a public-repository launch setting here. Enable it immediately after public visibility. Enable secret scanning, push protection, CodeQL/default code scanning, Dependabot security features, and other GitHub security features when they are actually available for the public repository/account; record unavailable or paid-only features as unavailable rather than pretending they are enabled.

## Cloudflare / operator checks before public visibility

Confirm in the actual account rather than relying on source configuration alone:

- production and preview use the intended devnet RPC/genesis configuration;
- production signer material is stored as a secret, not a build variable, and is absent from preview;
- preview sponsored creation remains disabled;
- the dedicated fee payer is low-balance and devnet-only;
- `/api/stamps` has an active edge rate limit or equivalent abuse control;
- `SUBMISSION_ENABLED=false` stops new creation while existing receipts remain verifiable;
- deployed HTML contains `proofstamp-build` and `proofstamp-deployment`, and the build SHA equals the approved Git commit.

## Release decision

**Blocked pending final release evidence.** Public visibility still requires:

1. green CI on the exact final PR head;
2. any browser scenarios not explicitly evidenced during owner preview review, especially recovery/network-request checks;
3. direct Cloudflare/operator confirmation of rate limiting, secret separation, kill switch, fee-payer balance, and deployed commit metadata;
4. successful production create → finalized read-back → original match → altered mismatch on the approved merge commit while the repository is still private.

The fresh all-ref/all-history Git secret scan is complete and passing. No mainnet migration or architecture expansion is required to clear the remaining gates.

## Final owner sequence

1. Confirm final CI on the draft PR head and complete any browser scenarios not already explicitly evidenced.
2. Review non-Git operational surfaces for credential exposure (Cloudflare logs, attachments, screenshots, copied diagnostics).
3. Approve and merge the reviewed PR **while the repository remains private**.
4. Deploy the approved merge commit to production.
5. Confirm the deployed SHA, Cloudflare controls, signer separation/balance, kill switch, and the minimal production create → finalized read-back → original match → altered mismatch flow.
6. Apply repository metadata and any GitHub settings that are available while private.
7. Change repository visibility to public.
8. Immediately apply the `main` ruleset requiring **`test`**, enable private vulnerability reporting, and enable applicable public-repository security features.
9. While logged out, verify README/Mermaid/brand rendering, badges, LICENSE, CONTRIBUTING, SECURITY, PRIVACY, DISCLAIMER, TRADEMARKS, Source, and live-app links.
10. After the public release is stable, remove obsolete merged branches and finish the dependency-PR dispositions.
