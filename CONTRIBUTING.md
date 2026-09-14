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

For the complete local creation path, also copy `.dev.vars.example` to `.dev.vars`, supply a dedicated devnet signer, build, and run `npm run pages:dev`. See the README for the exact environment split. Never commit signer material, RPC credentials, `.dev.vars`, or local environment files.

## Before opening a pull request

Run:

```bash
npm test
npm run build
node --check worker/index.mjs
node --check functions/api/stamps.mjs
node -e "import('./worker/index.mjs').then(() => console.log('worker imports ok'))"
node -e "import('./functions/api/stamps.mjs').then(() => console.log('Pages function imports ok'))"
```

`npm run build` includes TypeScript checking. There is no separate lint or formatting command today.

For UI changes, also check the relevant flow with a keyboard and at a narrow mobile width. Do not treat mocked RPC tests as proof that a browser interaction works.

## Change expectations

- Keep pull requests focused and explain the user-visible or trust-boundary effect.
- Add targeted tests for protocol, verification, recovery, or security behavior that changes.
- Do not widen the sponsor endpoint to arbitrary instructions, programs, transactions, addresses, or file content.
- Do not make mainnet, permanence, authorship, truth, delivery, acceptance, or legal-effect claims.
- Keep dependency majors separate unless they are required to fix a release blocker.
- Do not add credentials, real private keys, production RPC secrets, or private operational records to fixtures, issues, logs, screenshots, or documentation.

## Security reports

Do not open a public issue for a vulnerability or suspected credential exposure. Follow [SECURITY.md](SECURITY.md). If private vulnerability reporting is enabled for the repository, use that channel.
