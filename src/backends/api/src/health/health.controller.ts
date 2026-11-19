import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sql } from '@base/db';
import { logger, successBody } from '@base/server-kit';
import { InjectDb, type Database } from '../core/database';
import { Public } from '../decorators/customize';

@Controller('health')
export class HealthController {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Kiểm tra API và kết nối DB; DB lỗi thì trả 503 (cho load balancer / giám sát) */
  @Public()
  @Get()
  async check(@Res() res: Response) {
    let database: 'up' | 'down' = 'up';
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      database = 'down';
      logger.warn('Health check: không kết nối được DB', error);
    }
    res
      .status(database === 'up' ? 200 : 503)
      .json(
        successBody({
          status: database === 'up' ? 'ok' : 'degraded',
          database,
          time: new Date().toISOString(),
        }),
      );
  }
}
