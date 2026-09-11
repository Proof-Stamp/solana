import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: {
  env: Record<string, string | undefined>;
};

const buildSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'local';
const deploymentUrl = process.env.CF_PAGES_URL || '';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'proofstamp-build-meta',
      transformIndexHtml() {
        return [
          { tag: 'meta', attrs: { name: 'proofstamp-build', content: buildSha }, injectTo: 'head' },
          ...(deploymentUrl
            ? [{ tag: 'meta', attrs: { name: 'proofstamp-deployment', content: deploymentUrl }, injectTo: 'head' as const }]
            : []),
        ];
      },
    },
  ],
  server: {
    port: 5173,
  },
});
