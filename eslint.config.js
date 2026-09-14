import tseslint from 'typescript-eslint';

const readonlyGlobals = Object.fromEntries(
  [
    'AbortController',
    'AbortSignal',
    'Blob',
    'Buffer',
    'File',
    'FormData',
    'Headers',
    'Request',
    'Response',
    'TextDecoder',
    'TextEncoder',
    'URL',
    'URLSearchParams',
    'atob',
    'btoa',
    'clearInterval',
    'clearTimeout',
    'console',
    'crypto',
    'fetch',
    'process',
    'setInterval',
    'setTimeout',
    'structuredClone',
  ].map((name) => [name, 'readonly']),
);

const runtimeRules = {
  'no-duplicate-case': 'error',
  'no-dupe-keys': 'error',
  'no-redeclare': 'error',
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'no-useless-catch': 'error',
};

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    files: ['eslint.config.js', 'scripts/**/*.mjs', 'worker/**/*.mjs', 'functions/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: readonlyGlobals,
    },
    rules: runtimeRules,
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'vite.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-duplicate-case': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-useless-catch': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
