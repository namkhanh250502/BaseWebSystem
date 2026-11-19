import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Dùng chung file .env với API (biến đã đặt sẵn trong môi trường được ưu tiên)
config({ path: '../../backends/api/.env', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Thiếu DATABASE_URL (đặt trong src/backends/api/.env hoặc biến môi trường)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
