import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['tests/**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['vite.config.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['worker/**/*.mjs', 'functions/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['src/lib/receipt.ts'],
    rules: {
      // Receipt filename sanitization intentionally matches C0 control characters.
      'no-control-regex': 'off',
    },
  },
  {
    files: ['worker/index.mjs'],
    rules: {
      // This parser deliberately replaces low-level decoding errors with one stable public-facing error.
      'preserve-caught-error': 'off',
    },
  },
);
