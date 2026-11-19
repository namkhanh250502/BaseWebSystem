import { Injectable } from '@nestjs/common';
import { and, gte, lt, sql, users } from '@base/db';
import type { UserGrowthDto } from '@base/shared';
import { InjectDb, type Database } from '../core/database';

/**
 * Múi giờ dùng để chia người dùng theo tháng. Là hằng số nên nhúng thẳng vào SQL:
 * nếu truyền dạng tham số, biểu thức ở SELECT và GROUP BY sẽ khác nhau ($1 vs $6) và Postgres báo lỗi.
 */
const TIME_ZONE = sql.raw(`'Asia/Ho_Chi_Minh'`);

@Injectable()
export class DashboardService {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Số người dùng đăng ký mới theo từng tháng trong năm */
  async userGrowth(year: number): Promise<UserGrowthDto> {
    const monthExpr = sql<number>`extract(month from ${users.createdAt} at time zone ${TIME_ZONE})::int`;

    const [rows, [first]] = await Promise.all([
      this.db
        .select({ month: monthExpr, newUsers: sql<number>`count(*)::int` })
        .from(users)
        .where(
          and(
            gte(users.createdAt, sql`(${`${year}-01-01`}::timestamp at time zone ${TIME_ZONE})`),
            lt(users.createdAt, sql`(${`${year + 1}-01-01`}::timestamp at time zone ${TIME_ZONE})`),
          ),
        )
        .groupBy(monthExpr),
      this.db
        .select({
          year: sql<number | null>`extract(year from min(${users.createdAt}) at time zone ${TIME_ZONE})::int`,
        })
        .from(users),
    ]);

    const byMonth = new Map(rows.map((r) => [r.month, r.newUsers]));
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      newUsers: byMonth.get(i + 1) ?? 0,
    }));
    return {
      year,
      months,
      totalNewUsers: months.reduce((sum, m) => sum + m.newUsers, 0),
      firstYear: first?.year ?? new Date().getFullYear(),
    };
  }
}
