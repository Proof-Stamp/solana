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

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/**', 'tests/**/*.ts', 'vite.config.ts'],
  },
  {
    files: ['eslint.config.js', 'scripts/**/*.mjs', 'worker/**/*.mjs', 'functions/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: readonlyGlobals,
    },
    rules: {
      'no-dupe-case': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-useless-catch': 'error',
    },
  },
];
