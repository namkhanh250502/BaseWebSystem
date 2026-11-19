import 'reflect-metadata';
import { TEST_ENV, testDatabaseUrl } from './test-env';

// Đặt biến môi trường trước khi bất kỳ module nào gọi getEnv() (giá trị được cache)
process.env.DATABASE_URL = testDatabaseUrl();
Object.assign(process.env, TEST_ENV);
delete process.env.WEBAUTHN_ORIGINS;
delete process.env.WEBAUTHN_RP_NAME;
