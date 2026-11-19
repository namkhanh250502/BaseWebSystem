import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Test e2e của API: chạy NestJS thật trên database PostgreSQL riêng (`<tên DB>_test`).
 * Dùng SWC thay esbuild vì NestJS cần `emitDecoratorMetadata` để tiêm phụ thuộc.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // Các file test dùng chung 1 database: chạy tuần tự để dữ liệu không đè nhau
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
