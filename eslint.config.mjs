// Cấu hình ESLint dùng chung cho toàn monorepo: pnpm lint
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/storage/**',
      'src/packages/db/migrations/**',
      // Skill của Claude Code (script bên thứ ba, CommonJS), không phải code dự án
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Cho phép kiểu tham số route rỗng `{}` (mặc định của route không có tham số)
      '@typescript-eslint/no-empty-object-type': ['error', { allowObjectTypes: 'always' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Backend: bắt Promise bị bỏ quên (ví dụ thiếu `await rateLimit.hit()` thì giới hạn bị bỏ qua)
    files: ['src/backends/*/src/**/*.ts', 'src/packages/server-kit/src/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
  {
    // React: frontend và package ui
    files: ['src/frontends/**/*.{ts,tsx}', 'src/packages/ui/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.default ?? reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Logger và script chạy bằng node (seed, cấu hình công cụ) được dùng console
    files: ['src/packages/server-kit/src/logger.ts', 'src/packages/db/seeds/**', '**/*.config.{ts,mjs,js}'],
    rules: { 'no-console': 'off' },
  },
  {
    // Nest CLI nạp webpack.config.js bằng require() nên file này phải là CommonJS
    files: ['src/backends/*/webpack.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
