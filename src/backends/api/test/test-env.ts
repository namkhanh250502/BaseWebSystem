import path from 'node:path';

/** Thư mục gốc của repo */
export const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Database cho test: TEST_DATABASE_URL nếu có, ngược lại lấy DATABASE_URL (biến môi trường hoặc
 * src/backends/api/.env) và thêm hậu tố `_test` vào tên DB. Test sẽ XOÁ và tạo lại DB này.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  try {
    process.loadEnvFile(path.resolve(__dirname, '../.env'));
  } catch {
    // không có file thì bỏ qua
  }
  const base = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/base_web';
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'base_web';
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}

/** Biến môi trường cố định cho test (không phụ thuộc .env của máy) */
export const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-0123456789-abcdefghijklmnop',
  ENCRYPTION_KEY: 'test-encryption-key-0123456789-abcdefghij',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: '7',
  APP_NAME: 'Base Web Test',
  USER_APP_URL: 'http://localhost:5173',
  ADMIN_APP_URL: 'http://localhost:5174',
  WEBAUTHN_RP_ID: 'localhost',
  COOKIE_SECURE: 'false',
};
