import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'local';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  server: {
    port: 5173,
  },
});
