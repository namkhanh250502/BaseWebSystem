import { Injectable } from '@nestjs/common';
import { isNotNull, sql, users, type SQL } from '@base/db';
import type { UserAnalyticsDto, UserAnalyticsUnit, userAnalyticsQuerySchema } from '@base/shared';
import type { z } from 'zod';
import { InjectDb, type Database } from '../core/database';

type AnalyticsQuery = z.infer<typeof userAnalyticsQuerySchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ký tự của khoá mốc trong chuỗi `YYYY-MM-DD` */
const BUCKET_KEY_LENGTH: Record<UserAnalyticsUnit, number> = { day: 10, month: 7 };

/** Thống kê tăng trưởng người dùng cho tab "Phân tích" ở trang admin /users */
@Injectable()
export class UsersAnalyticsService {
  /** Múi giờ nào Postgres nhận ra (cache theo tên, danh sách múi giờ của server không đổi khi chạy) */
  private readonly knownZones = new Map<string, boolean>();

  constructor(@InjectDb() private readonly db: Database) {}

  /**
   * Mỗi mốc là số phát sinh mới trong mốc đó; `totalUsers`/`verifiedUsers` là lũy kế tới `to`.
   * Một user tính là "đã xác minh" từ thời điểm `emailVerifiedAt` — admin bỏ xác minh thì
   * user rời khỏi số liệu (cột bị xoá về null), đúng với trạng thái hiện tại.
   */
  async growth(query: AnalyticsQuery): Promise<UserAnalyticsDto> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const format = query.unit === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const localAt = await this.localTime(query.timeZone, to);

    // GROUP BY theo số thứ tự cột: nếu lặp lại biểu thức có tham số ($n), Postgres coi SELECT
    // và GROUP BY là hai biểu thức khác nhau và báo lỗi.
    const result = await this.db.execute<{
      kind: 'total' | 'verified';
      bucket: string | null;
      count: number;
    }>(sql`
      WITH events AS (
        SELECT 'total' AS kind, ${users.createdAt} AS at FROM ${users}
        UNION ALL
        SELECT 'verified' AS kind, ${users.emailVerifiedAt} AS at
        FROM ${users}
        WHERE ${isNotNull(users.emailVerifiedAt)}
      )
      SELECT kind,
             CASE WHEN at < ${from.toISOString()}::timestamptz THEN NULL
                  ELSE to_char(${localAt}, ${format}::text)
             END AS bucket,
             count(*)::int AS count
      FROM events
      WHERE at <= ${to.toISOString()}::timestamptz
      GROUP BY 1, 2
    `);

    const cumulative = { total: 0, verified: 0 };
    const added = new Map<string, { total: number; verified: number }>();
    for (const row of result.rows) {
      cumulative[row.kind] += row.count;
      if (row.bucket === null) continue;
      const entry = added.get(row.bucket) ?? { total: 0, verified: 0 };
      entry[row.kind] += row.count;
      added.set(row.bucket, entry);
    }

    return {
      unit: query.unit,
      from: from.toISOString(),
      to: to.toISOString(),
      timeZone: query.timeZone,
      totalUsers: cumulative.total,
      verifiedUsers: cumulative.verified,
      points: enumerateBuckets(from, to, query.timeZone, query.unit).map((bucket) => ({
        bucket,
        newUsers: added.get(bucket)?.total ?? 0,
        newVerifiedUsers: added.get(bucket)?.verified ?? 0,
      })),
    };
  }

  /**
   * Biểu thức quy cột `at` về giờ địa phương của người xem. Tên múi giờ của trình duyệt (Intl) và
   * của Postgres không luôn khớp (vd. trình duyệt trả `Asia/Saigon`, image Postgres tối giản không
   * có) → khi Postgres không biết thì dùng độ lệch cố định tại `to` (có thể lệch 1 giờ quanh mốc
   * đổi giờ mùa hè, chấp nhận được cho biểu đồ).
   */
  private async localTime(timeZone: string, at: Date): Promise<SQL> {
    let known = this.knownZones.get(timeZone);
    if (known === undefined) {
      const result = await this.db.execute<{ ok: boolean }>(
        sql`SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${timeZone}) AS ok`,
      );
      known = Boolean(result.rows[0]?.ok);
      this.knownZones.set(timeZone, known);
    }
    if (known) return sql`(at AT TIME ZONE ${timeZone}::text)`;
    return sql`((at AT TIME ZONE 'UTC') + ${`${zoneOffsetMinutes(timeZone, at)} minutes`}::interval)`;
  }
}

/** Độ lệch (phút) của múi giờ so với UTC tại thời điểm `at`, tính bằng Intl */
function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  // Dạng "GMT+07:00", "GMT-03:30" hoặc "GMT" (UTC)
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** Liệt kê đủ mọi mốc trong khoảng (kể cả mốc không có dữ liệu) để biểu đồ không bị hụt cột */
function enumerateBuckets(
  from: Date,
  to: Date,
  timeZone: string,
  unit: UserAnalyticsUnit,
): string[] {
  // en-CA định dạng ngày đúng kiểu YYYY-MM-DD, khớp với to_char ở SQL
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const length = BUCKET_KEY_LENGTH[unit];
  const buckets: string[] = [];
  const push = (date: Date) => {
    const key = formatter.format(date).slice(0, length);
    if (buckets[buckets.length - 1] !== key) buckets.push(key);
  };
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) push(new Date(t));
  push(to);
  return buckets;
}
