---
name: db-schema
description: Quy ước sửa database trong BaseWebSystem (Drizzle ORM + PostgreSQL ở src/packages/db) — thêm bảng, cột, index, enum, quan hệ; sinh và áp migration (pnpm db:generate / db:migrate); sửa seed idempotent; truy vấn Drizzle trong service NestJS (transaction, phân trang, join). Dùng khi người dùng nhắc "thêm bảng", "thêm cột", "migration", "schema DB", "seed", "drizzle", "query chậm/thiếu index". Dùng kèm base-skill.
---

# Database (Drizzle + PostgreSQL)

## Vị trí

| Thứ                         | Đường dẫn                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Schema (mỗi domain 1 file)  | `src/packages/db/src/schema/<domain>.ts`, export tập trung ở `schema/index.ts`                              |
| Cột `createdAt`/`updatedAt` | `schema/_helpers.ts` → `...timestamps`                                                                      |
| Client, re-export toán tử   | `src/packages/db/src/index.ts` (`eq`, `and`, `or`, `ilike`, `inArray`, `count`, `sql`…)                     |
| Migration (sinh tự động)    | `src/packages/db/migrations/*.sql` + `meta/`                                                                |
| Seed idempotent             | `src/packages/db/seeds/index.ts`                                                                            |
| Đồng bộ permission          | `src/packages/db/src/permissions-sync.ts`                                                                   |
| Cấu hình                    | `src/packages/db/drizzle.config.ts` — `casing: 'snake_case'`, đọc `DATABASE_URL` từ `src/backends/api/.env` |

## Quy ước khai báo

- Tên bảng `snake_case` số nhiều (`'login_histories'`), tên field TS `camelCase` — **không** đặt tên cột thủ công, `casing: 'snake_case'` tự đổi.
- Khoá chính: `id: uuid().primaryKey().defaultRandom()`; bảng nối dùng `primaryKey({ columns: [...] })`.
- Luôn `...timestamps` (trừ bảng chỉ ghi một lần như `notifications` — khi đó tự khai báo `createdAt`).
- Ngày giờ: `timestamp({ withTimezone: true })`.
- FK: `.references(() => users.id, { onDelete: 'cascade' | 'set null' })` — chọn rõ hành vi khi xoá.
- Enum: giá trị lấy từ hằng số ở `@base/shared` (`pgEnum('notification_type', NOTIFICATION_TYPES)`) để FE/BE dùng chung một danh sách.
- Index cho cột hay lọc/sắp xếp: tham số thứ 3 `(t) => [index().on(t.userId, t.createdAt)]`.
- Dữ liệu nhạy cảm: chỉ lưu hash (token, mã OTP, mã dự phòng) hoặc mã hoá bằng `encrypt`/`decrypt` của `@base/server-kit` (secret TOTP).
- Export kiểu: `export type X = typeof xs.$inferSelect; export type NewX = typeof xs.$inferInsert;`.
- JSDoc tiếng Việt cho bảng và cột có ý nghĩa không hiển nhiên.

## Quy trình sửa schema

1. Sửa/thêm file schema, export ở `schema/index.ts`.
2. `pnpm db:generate` → **đọc file SQL vừa sinh** (kiểm tra không có `DROP` ngoài ý muốn, cột `NOT NULL` mới trên bảng có dữ liệu phải có `default` hoặc migration dữ liệu).
3. `pnpm db:migrate` để áp vào DB dev.
4. Commit cả file SQL và `migrations/meta/*`. **Không** sửa tay migration đã commit; cần đổi thì sinh migration mới.
5. Đổi tên cột/bảng: drizzle-kit sẽ hỏi rename hay drop+create (interactive) — báo người dùng tự chạy `! pnpm db:generate` để chọn, đừng đoán.
6. Test e2e tự tạo lại DB `<tên>_test` và chạy migration + seed, nên migration hỏng sẽ lộ ra ở `pnpm test`.

## Seed

- `pnpm db:seed` phải chạy lại nhiều lần không lỗi: dùng `onConflictDoNothing({ target })` hoặc kiểm tra tồn tại trước khi insert.
- Seed hiện làm: đồng bộ permission → role `Administrator` (đủ quyền) + `User` → setting mặc định còn thiếu → super admin từ `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`.
- Dữ liệu mẫu nghiệp vụ (nếu cần) để trong seed riêng, không trộn vào luồng bắt buộc.

## Truy vấn trong service

- Inject: `constructor(@InjectDb() private readonly db: Database)` (`src/backends/api/src/core/database.ts`). Import bảng và toán tử **từ `@base/db`**, không import trực tiếp `drizzle-orm`.
- Phân trang: chạy song song dữ liệu + đếm:

  ```ts
  const where = search ? ilike(products.name, `%${search}%`) : undefined;
  const [rows, [total]] = await Promise.all([
    this.db
      .select()
      .from(products)
      .where(where)
      .orderBy(sortOrder === 'asc' ? asc(products[sortBy]) : desc(products[sortBy]))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    this.db.select({ value: count() }).from(products).where(where),
  ]);
  return { items: rows.map(toDto), meta: { page, pageSize, total: total?.value ?? 0 } };
  ```

- Tránh N+1: lấy danh sách id rồi `inArray` một lần, ghép trong bộ nhớ (xem `hydrate` ở `roles.service.ts`).
- Transaction: `await this.db.transaction(async (tx) => { … })`; hàm phụ nhận `tx: DbOrTx`.
- `sql\`\`` chỉ khi builder không đủ; luôn dùng tham số nội suy, không ghép chuỗi.
- Thời gian theo tháng/múi giờ: tham khảo `dashboard.service.ts` (`Asia/Ho_Chi_Minh`).

## Hoàn tất

Lint + typecheck (base-skill), `pnpm test` nếu có DB. Hỏi cập nhật `docs/architecture.md` nếu thêm bảng/quan hệ quan trọng.
