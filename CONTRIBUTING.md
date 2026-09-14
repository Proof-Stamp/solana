# Contributing

ProofStamp via Solana is intentionally small. Changes should preserve the v1 trust boundary: local file hashing, a restricted sponsor endpoint, one canonical Memo transaction, finalized read-back, and browser verification against the public transaction.

## Setup

Requirements: Node 24.15+ and npm 12.0.2+.

```bash
npm install --global npm@12.0.2
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev
```

For the complete local creation path, also copy `.dev.vars.example` to `.dev.vars`, supply a dedicated devnet signer, build, and run `npm run pages:dev`. See the README for the environment split. Never commit local environment files or deployment credentials.

## Before opening a pull request

Run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
node --check worker/index.mjs
node --check functions/api/stamps.mjs
node -e "import('./worker/index.mjs').then(() => console.log('worker imports ok'))"
node -e "import('./functions/api/stamps.mjs').then(() => console.log('Pages function imports ok'))"
```

`npm run typecheck` is the fast local TypeScript check. `npm run build` also typechecks before producing the Vite bundle.

The formatting check is intentionally limited to the tooling and CI files named by `format:check`; it is not a repository-wide formatter. Avoid mixing broad formatting churn with behavioral changes.

For UI changes, also exercise the relevant flow with a keyboard and at a narrow mobile width where possible. Mocked RPC tests do not prove browser interaction behavior.

## Change expectations

- Keep pull requests focused and explain the user-visible or trust-boundary effect.
- Add targeted tests for protocol, verification, recovery, or security behavior that changes.
- Do not widen the sponsor endpoint to arbitrary instructions, programs, transactions, addresses, or file content.
- Do not make mainnet, permanence, authorship, truth, delivery, acceptance, or legal-effect claims.
- Keep dependency majors separate unless they are required for a specific fix.
- Keep credentials, private operational material, and local environment files out of the repository, issues, screenshots, and diagnostics.

## Security reports

Do not open a public issue for a vulnerability or suspected credential exposure. Follow [SECURITY.md](SECURITY.md). If private vulnerability reporting is enabled for the repository, use that channel.
