import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb } from '@base/db';
import { getEnv } from '../config/env';
import { DB, DB_CONNECTION, type DbConnection } from './database';
import { RateLimitService } from './rate-limit.service';

/** Provider dùng chung toàn app: kết nối DB (Drizzle) và rate limiter */
@Global()
@Module({
  providers: [
    { provide: DB_CONNECTION, useFactory: () => createDb(getEnv().DATABASE_URL) },
    { provide: DB, useFactory: (connection: DbConnection) => connection.db, inject: [DB_CONNECTION] },
    RateLimitService,
  ],
  exports: [DB, RateLimitService],
})
export class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(DB_CONNECTION) private readonly connection: DbConnection) {}

  async onApplicationShutdown() {
    await this.connection.pool.end();
  }
}
