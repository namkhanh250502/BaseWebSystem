import { inArray, sql, users, type SQL } from '@base/db';
import { BUSINESS_TIME_ZONE, fullName, type UserRef } from '@base/shared';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DbOrTx } from './database';

/**
 * Mẫu `ilike` "chứa chuỗi" có escape ký tự đại diện, để tìm SKU như `A_1` hay `50%`
 * không bị hiểu thành wildcard.
 */
export function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Thông tin phân trang chuẩn cho `paginated()` */
export function pageMeta(page: number, pageSize: number, total: number | undefined) {
  return { page, pageSize, total: total ?? 0 };
}

/** Nạp tên hiển thị của nhiều người dùng một lần (người tạo / xác nhận / huỷ chứng từ) */
export async function loadUserRefs(
  db: DbOrTx,
  ids: (string | null | undefined)[],
): Promise<(id: string | null | undefined) => UserRef | null> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const rows = unique.length
    ? await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.id, unique))
    : [];
  const map = new Map(rows.map((u) => [u.id, { id: u.id, name: fullName(u, 'vi') || u.email }]));
  return (id) => (id ? (map.get(id) ?? null) : null);
}

/** Date | null → ISO string | null */
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Lỗi vi phạm ràng buộc unique của PostgreSQL (Drizzle bọc lỗi pg trong `cause`) */
export function isUniqueViolation(error: unknown): boolean {
  const pg = (error as { cause?: { code?: string }; code?: string } | null) ?? {};
  return (pg.cause?.code ?? pg.code) === '23505';
}

/**
 * Múi giờ chèn thẳng vào SQL (hằng số trong code, không phải dữ liệu người dùng): nếu truyền
 * thành tham số, mỗi lần xuất hiện là một `$n` khác nhau và PostgreSQL coi biểu thức trong
 * SELECT / GROUP BY là khác nhau.
 */
const TIME_ZONE_SQL = sql.raw(`'${BUSINESS_TIME_ZONE}'`);

/** Ngày (giờ Việt Nam) của cột timestamptz — lọc / nhóm theo ngày nghiệp vụ (FR-033) */
export function businessDay(column: AnyPgColumn | SQL): SQL<string> {
  return sql<string>`(${column} at time zone ${TIME_ZONE_SQL})::date`;
}
