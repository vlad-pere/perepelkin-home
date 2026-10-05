import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    name: 'react-hooks/classic',
    plugins: { 'react-hooks': reactHooks },
    // Только классические правила React Hooks. Новый «recommended» из v7 включает
    // экспериментальные правила (set-state-in-effect, static-components и др.),
    // которые флагают стандартный паттерн «загрузка данных в useEffect» во всех
    // модулях как ошибки — это шум для этого кодового базиса.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    name: 'react-refresh',
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    name: 'perepelkin-home/custom',
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    name: 'node-scripts',
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
  {
    name: 'perepelkin-home/ignores',
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/.scratch/',
      '**/.opencode/',
      '**/.10x/',
      '**/.superpowers/',
    ],
  },
);
