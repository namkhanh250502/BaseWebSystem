# Research — 001 Quản lý bán hàng & tồn kho

Mỗi mục: **Decision** / **Rationale** / **Alternatives considered**. Các kết luận dựa trên khảo sát mã nguồn hiện tại (2026-11-19).

## 0. Hiện trạng repo (đã khảo sát)

| Hạng mục | Hiện trạng | Hệ quả cho tính năng |
| --- | --- | --- |
| Monorepo | pnpm 11 workspace (`pnpm-workspace.yaml`) + Turborepo (`turbo.json`), Node ≥ 22, TS ~6 strict | Thêm code vào package có sẵn, không thêm workspace mới |
| Backend | `src/backends/api` (`@base/api`), NestJS 11 + Express 5, prefix `/api/v1`, build Nest CLI + webpack gộp `@base/*` | Thêm module domain mới cạnh `roles/`, `users/`… |
| Frontend 1 | `src/frontends/admin` — quản trị (đăng nhập cần quyền `admin.access`) | Thêm các trang quản lý |
| Frontend 2 | `src/frontends/user` — cổng tự phục vụ (đăng ký, Google, tài khoản, thông báo) | Thêm khu vực bán hàng, ẩn với người không có quyền |
| Shared | `@base/shared` (zod + DTO + permission/setting), `@base/db` (Drizzle), `@base/server-kit` (lỗi i18n, JWT, mailer, rate limit…), `@base/api-client` (SDK, tự refresh token), `@base/ui` (antd, auth, layout, i18n chung) | Mọi schema/DTO mới đặt ở `@base/shared`, SDK ở `@base/api-client` |
| ORM / migration | Drizzle ORM 0.45 + drizzle-kit (`pnpm db:generate` / `db:migrate`), `casing: 'snake_case'`, id `uuid defaultRandom`, `...timestamps` | Theo đúng quy ước |
| Auth | `AuthGuard` toàn cục, JWT access 15' + refresh cookie, nạp principal mỗi request; `@Public`, `@RequirePermission` | Dùng lại nguyên vẹn |
| Phân quyền | RBAC: permission định nghĩa trong code (`PERMISSION_DEFINITIONS`, mỗi key ↔ 1 API, loại `CLIENT` cho quyền giao diện), role động, 1 role/user, seed đồng bộ | Thêm key mới + vai trò Manager/Staff |
| API conventions | Response `{ data, error, meta? }`; validate zod (`@ZodBody/Query/Params`, lỗi **422** `errors.validation`); lỗi nghiệp vụ `AppError(status, code, key, params)` dịch theo `x-lang` | Tuân theo; bổ sung `params` vào body lỗi (R8) |
| i18n | Backend `i18n/{vi,en}.ts` (en bắt buộc đủ key như vi); frontend i18next qua `createI18n`, namespace theo module; ngôn ngữ lưu `users.lang` + localStorage | Dùng lại |
| Lưu file | Avatar trên đĩa (`UPLOAD_DIR`) qua multer | Không đụng; ảnh sản phẩm dùng MinIO |
| Lịch chạy nền | Không có `@nestjs/schedule`; có tiền lệ việc nền `void (async…)` | Xem R15 |
| Docker | **Không có** (README: Postgres local, không Docker; prod systemd + nginx + Cloudflare) | MinIO cài như dịch vụ hệ thống (R17) |
| OpenAPI | **Không có** Swagger | Xem R7 |
| Test | Vitest + supertest e2e trên DB `<tên>_test`, `FakeMailService` override provider | Thêm `FakeStorageService` tương tự |

## R1. Cấu trúc module backend

- **Decision**: Thêm `categories/`, `products/` (gồm ảnh sản phẩm), `suppliers/`, `purchases/`, `sales/`, `inventory/`, `reports/`, `storage/`. **Không** tạo `UploadModule` riêng: upload ảnh là nghiệp vụ sản phẩm (`products/product-images.service.ts`) dùng `StorageService` chung. Dashboard bán hàng thêm vào **`DashboardModule` có sẵn** (`GET /dashboard/sales-summary`). Không tạo lại Auth/Users/Database/Common/Permission — tương ứng đã có `auth/`, `users/`, `core/` (DB global), `decorators/`, `permissions/`.
- **Rationale**: Theo constitution I (tái sử dụng, chỉ tạo module chưa có). `InventoryService` là nơi duy nhất thay đổi tồn kho; `PurchasesService`, `SalesService` gọi nó trong cùng transaction.
- **Alternatives**: UploadModule tách riêng — thừa vì chỉ có một loại upload và không có route upload chung; đặt dashboard vào ReportsModule — tạo thêm route trùng chức năng "dashboard".

## R2. Kiểu dữ liệu số lượng & tiền

- **Decision**: Tiền `numeric(18,2)`; giá vốn bình quân và giá vốn đơn vị `numeric(18,4)`; số lượng `numeric(14,3)` cho mọi bảng, kèm cờ `products.allow_decimal_quantity` (mặc định `false`) — service từ chối số lượng có phần lẻ khi cờ tắt. API truyền tiền/số lượng dạng **chuỗi thập phân** (`"125000.00"`, `"3"`).
- **Rationale**: Spec cho phép hàng cân/đo (kg, m) tới 3 chữ số lẻ; dùng một kiểu cột tránh hai nhánh mã; số nguyên vẫn được bảo đảm qua validate. Drizzle trả `numeric` dạng string nên giữ string xuyên suốt để không mất chính xác (constitution VII).
- **Alternatives**: `integer` cho số lượng — không đáp ứng hàng cân đo; `bigint` đơn vị nhỏ nhất cho tiền — phải quy đổi ở mọi chỗ hiển thị/nhập, khó đọc trong báo cáo SQL.

## R3. Tính toán thập phân ở backend

- **Decision**: Thêm helper `decimal.ts` trong `@base/server-kit` dùng **BigInt có scale cố định** (cộng, trừ, nhân, chia làm tròn half-up, so sánh, phân bổ chiết khấu). Phép tính giá vốn bình quân thực hiện **trong SQL** (`numeric` của Postgres) ngay trong câu `UPDATE` khoá dòng.
- **Rationale**: Constitution I cấm dependency không cần thiết; nhu cầu chỉ là 4 phép toán + làm tròn. SQL numeric chính xác tuyệt đối và nguyên tử với cập nhật tồn.
- **Alternatives**: `decimal.js` / `big.js` — thêm dependency cho phạm vi nhỏ; tính bằng `number` — vi phạm constitution VII.

## R4. Cơ chế giao dịch tồn kho & chống tranh chấp

- **Decision**:
  1. Bảng `inventory_balances` (1 dòng/sản phẩm) giữ `quantity`, `avg_cost`; `CHECK (quantity >= 0)` làm chốt chặn cuối.
  2. Mọi thay đổi tồn đi qua `InventoryService.apply(tx, movements[])` trong transaction của chứng từ:
     - gộp dòng theo `product_id`, sắp xếp tăng dần theo id;
     - `SELECT … FROM inventory_balances WHERE product_id IN (…) ORDER BY product_id FOR UPDATE` (thứ tự cố định → không deadlock);
     - kiểm tra đủ hàng cho mọi dòng xuất, nếu thiếu ném `inventory.insufficientStock` kèm danh sách `{ productId, sku, requested, available }`;
     - `UPDATE` số lượng/giá vốn, `INSERT` `inventory_movements` (qty trước/sau, giá vốn, chứng từ nguồn, người, lý do).
  3. Chống xác nhận trùng: bước đầu tiên của confirm/cancel là `UPDATE <doc> SET status = 'CONFIRMED', … WHERE id = $1 AND status = 'DRAFT' AND version = $v RETURNING *`. Không có dòng trả về → `conflict('<doc>.alreadyProcessed')` (hoặc `<doc>.stale` nếu version lệch). Hai request đồng thời: request sau chờ khoá dòng chứng từ, rồi thấy trạng thái đã đổi.
  4. Idempotency khi tạo: `POST /sales-orders` và `POST /inventory/adjustments` nhận `clientRequestId` (uuid do client sinh), cột unique; gửi lại cùng id → trả chứng từ đã tạo (200) thay vì tạo mới.
  5. Khoá lạc quan khi sửa nháp: cột `version` (int), `PATCH` gửi kèm `version`; lệch → `409 <doc>.stale` (spec: không ghi đè im lặng).
- **Rationale**: Đúng constitution VII (nguyên tử có điều kiện + khoá dòng), mức cô lập mặc định READ COMMITTED là đủ khi đã khoá dòng; idempotency phục vụ mạng chập chờn ở quầy.
- **Alternatives**: `SERIALIZABLE` + retry — phức tạp, nhiều lỗi retry khi tải cao; advisory lock theo sản phẩm — không bảo vệ khi có code khác cập nhật bảng; đọc-rồi-ghi trong app — bị cấm.

## R5. Giá vốn bình quân gia quyền di động

- **Decision**:
  - Xác nhận nhập: với mỗi sản phẩm (sau khi gộp dòng), đơn giá vốn nhập thuần = (thành tiền dòng − chiết khấu dòng − phần chiết khấu phiếu phân bổ theo tỷ lệ thành tiền) ÷ số lượng. `avg_cost_new = (q × avg + q_in × unit_cost_in) ÷ (q + q_in)`; nếu `q = 0` thì `avg_cost_new = unit_cost_in`.
  - Chốt bán: mỗi dòng lưu `unit_cost = avg_cost` tại thời điểm khoá; `avg_cost` không đổi.
  - Huỷ đơn bán: cộng lại số lượng với giá vốn đã lưu trên dòng → `avg = (q × avg + r × unit_cost_line) ÷ (q + r)`.
  - Điều chỉnh tăng (kiểm kê thừa, khác): nhập lại theo `avg_cost` hiện tại (avg không đổi). Điều chỉnh giảm: avg không đổi. Sản phẩm chưa từng nhập (`avg = 0`) điều chỉnh tăng ghi giá vốn 0 và cảnh báo trên giao diện.
  - Phân bổ chiết khấu đơn bán vào từng dòng theo tỷ lệ thành tiền (dòng cuối nhận phần dư làm tròn) → lưu `net_amount` mỗi dòng để báo cáo theo sản phẩm cộng đúng tổng đơn.
- **Rationale**: Đúng spec (bình quân gia quyền, báo cáo dùng giá vốn lịch sử, huỷ đơn khôi phục nhất quán).
- **Alternatives**: FIFO theo lô — ngoài phạm vi MVP; tính lại toàn bộ lịch sử khi huỷ — tốn kém, thay đổi số liệu quá khứ.

## R6. Thư viện truy cập MinIO

- **Decision**: Dùng package `minio` (SDK chính thức, S3-compatible) — 1 dependency. Tạo hai client: `internal` (endpoint nội bộ, gọi mạng: statObject, getPartialObject, removeObject, bucket) và `signer` (endpoint công khai `MINIO_PUBLIC_URL`, chỉ ký URL offline, đặt sẵn `region` để không gọi mạng).
- **Rationale**: Hỗ trợ `presignedPostPolicy` (ràng buộc `content-length-range`, `Content-Type`, `key` ngay ở MinIO — trình duyệt không vượt được giới hạn), `presignedGetObject`, nhẹ hơn bộ `@aws-sdk/*` (2 package lớn).
- **Alternatives**: `@aws-sdk/client-s3` + `s3-request-presigner` — nặng, presigned POST cần thêm package thứ ba; upload qua API (multer) — tốn băng thông API, trái yêu cầu presigned.

## R7. Tài liệu OpenAPI

- **Decision**: Thêm `@nestjs/swagger`. Viết helper `ApiZodBody/ApiZodQuery/ApiZodResponse(schema)` trong `decorators/` chuyển zod → JSON Schema bằng `z.toJSONSchema()` có sẵn của zod 4, gắn vào `@ApiBody/@ApiQuery/@ApiOkResponse`; bọc lại để `@ZodBody(schema)` và tài liệu dùng **cùng một schema**. Swagger UI tại `/api/docs` (+ `/api/docs-json`) khi `API_DOCS_ENABLED=true` (mặc định bật ngoài production). Chỉ bắt buộc cho module mới; module cũ bổ sung dần.
- **Rationale**: Constitution II yêu cầu OpenAPI; không thêm class-validator hay `nestjs-zod` (trùng cơ chế validate).
- **Alternatives**: `nestjs-zod` — thêm lớp DTO class trùng với schema hiện có, chưa chắc tương thích zod 4 / Nest 11; viết OpenAPI tay — dễ lệch code.

## R8. Lỗi có tham số cho frontend

- **Decision**: `errorBody` trả thêm `params` (thay đổi cộng thêm, tương thích ngược): `error = { code, key, message, params?, details? }`. Lỗi theo dòng (thiếu hàng, số lượng lẻ không cho phép) đặt trong `details: [{ productId, sku, requested, available, field }]`. Frontend: rẽ nhánh theo `error.key`; hiển thị `message` (đã dịch theo `x-lang` = ngôn ngữ đang chọn) hoặc tự dựng thông điệp theo `key`+`params`/`details` khi cần gắn vào dòng giỏ hàng.
- **Rationale**: Đáp ứng FR-038 / constitution V, đóng TODO(ERROR_PARAMS).
- **Alternatives**: Chỉ dùng `message` — frontend không gắn lỗi vào từng dòng được.

## R9. Vai trò ADMIN / MANAGER / STAFF

- **Decision**: `SYSTEM_ROLES` thêm `MANAGER: 'Manager'`, `STAFF: 'Staff'`. Seed: `INSERT … ON CONFLICT DO NOTHING RETURNING` — **chỉ khi vừa tạo** mới gán bộ quyền mặc định (từ hằng số `DEFAULT_ROLE_PERMISSIONS` ở `@base/shared`), nên admin sửa quyền sau đó không bị seed ghi đè. `Administrator` vẫn tự nhận mọi quyền mới (logic seed hiện có). Role `User` không đổi. Nếu đã tồn tại role tuỳ chỉnh tên "Manager"/"Staff" thì seed bỏ qua và in cảnh báo.
- **Rationale**: Spec FR-035, story 8 (không thay vai trò/quyền hiện có).
- **Alternatives**: Đặt cứng vai trò trong code (enum) — phá mô hình role động hiện có.

## R10. Quyền dạng năng lực (không gắn API)

- **Decision**: Dùng loại permission `CLIENT` hiện có cho 4 năng lực được **kiểm tra ở cả backend** trong service: `products.viewCost`, `sales.viewAll`, `sales.overridePrice`, `inventory.viewValue`. Backend loại bỏ trường giá vốn/giá trị khỏi DTO khi thiếu quyền; lọc đơn theo người tạo khi thiếu `sales.viewAll`. Cập nhật mô tả loại `CLIENT` trong `docs/permissions.md` thành "quyền năng lực, không gắn 1 API".
- **Rationale**: Mô hình "1 quyền ↔ 1 API" không biểu diễn được quyền theo trường/phạm vi dữ liệu; tái dùng loại có sẵn thay vì thêm loại mới.
- **Alternatives**: Tách API riêng cho dữ liệu giá vốn (`GET /products/:id/cost`) — tăng số request, giao diện phức tạp.

## R11. Phân tách hai app

- **Decision**: Admin app: Dashboard (thêm thẻ bán hàng), Danh mục, Sản phẩm (+ảnh), Nhà cung cấp, Nhập hàng, Tồn kho (tồn, sổ biến động, điều chỉnh), Đơn bán (xem, huỷ, thanh toán — dành cho quản lý), Báo cáo; giữ Người dùng/Vai trò/Quyền/Cài đặt. User app: nhóm menu "Bán hàng" (Bán tại quầy `/pos`, Lịch sử đơn `/sales`, Chi tiết `/sales/:id`) hiện khi `can('sales.create')`, route bọc `RequirePermission`. Component dùng chung cho cả hai app (bảng đơn bán, chi tiết đơn, hiển thị tiền, trạng thái) đặt ở `@base/ui/src/commerce/`.
- **Rationale**: Giữ trách nhiệm hiện tại của app user (spec SC-010); Manager vào được cả hai app, Staff chỉ app user (không có `admin.access`).
- **Alternatives**: Tạo app thứ ba cho POS — trái yêu cầu "không tạo frontend mới".

## R12. Hiệu năng báo cáo

- **Decision**: Truy vấn tổng hợp trực tiếp trên `sales_order_items`/`sales_orders` với index `(status, confirmed_at)`, `(product_id)`, `inventory_movements (product_id, created_at)`, `(ref_type, ref_id)`; lọc bắt buộc theo khoảng ngày (tối đa 366 ngày). Không materialized view trong MVP.
- **Rationale**: SC-007 (~100.000 dòng/năm) nằm trong khả năng của aggregate có index; thêm bảng tổng hợp sớm là over-engineering.
- **Alternatives**: Bảng tổng hợp theo ngày cập nhật khi chốt đơn — phải xử lý huỷ đơn, cân nhắc lại khi dữ liệu > 1 triệu dòng.

## R13. Múi giờ

- **Decision**: Lưu `timestamptz`; ngày chứng từ (`receipt_date`, `order_date`) là `date` theo giờ VN; nhóm theo ngày/tháng bằng `(confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` như `dashboard.service.ts` hiện làm. "Hôm nay" tính theo giờ VN.
- **Rationale**: FR-033, nhất quán với code hiện có.

## R14. Sinh mã chứng từ

- **Decision**: Bảng `document_sequences (prefix, seq_date, last_value)`, PK `(prefix, seq_date)`; trong transaction tạo chứng từ: `INSERT … ON CONFLICT (prefix, seq_date) DO UPDATE SET last_value = document_sequences.last_value + 1 RETURNING last_value` → `PN-20261119-0001` (nhập), `DH-…` (đơn bán), `DC-…` (điều chỉnh). Cột `code` có `UNIQUE`. Mã sinh khi **tạo** chứng từ (cả nháp).
- **Rationale**: Không trùng khi đồng thời (khoá dòng sequence), dễ đọc theo ngày.
- **Alternatives**: Postgres SEQUENCE toàn cục — không reset theo ngày; đếm `count(*)+1` — trùng khi đồng thời.

## R15. Việc nền dọn file mồ côi

- **Decision**: `StorageCleanupService` (`OnApplicationBootstrap`) chạy `setInterval` mỗi 1 giờ (tắt khi `NODE_ENV=test`, test gọi trực tiếp hàm), mỗi lượt lấy `pg_try_advisory_lock(<hằng>)` để chỉ một instance chạy: xoá object + bản ghi `product_images` trạng thái `PENDING` quá hạn (`upload_expires_at < now()`) hoặc `DELETED`. Thêm lệnh `pnpm --filter @base/api storage:cleanup` để chạy tay/cron.
- **Rationale**: Không thêm `@nestjs/schedule` cho một việc; an toàn khi nhiều instance (README đã hỗ trợ đa instance qua Redis).
- **Alternatives**: `@nestjs/schedule` — dependency thêm; MinIO lifecycle rule theo prefix `pending/` — không biết được ảnh đã gắn hay chưa vì key không đổi khi hoàn tất.

## R16. Kiểm thử MinIO

- **Decision**: e2e mặc định override `StorageService` bằng `FakeStorageService` (bộ nhớ, ghi lại key/kích thước/bytes giả lập) qua `createTestApp` — giống `FakeMailService`. Thêm bộ `storage.minio.test.ts` chạy khi có `TEST_MINIO_URL` (giống `TEST_REDIS_URL`): xin presigned POST → upload thật bằng `fetch` → complete → GET presigned → xoá.
- **Rationale**: Test chạy được trên máy không cài MinIO; vẫn có đường kiểm chứng tích hợp thật.

## R17. Triển khai

- **Decision**: Không thêm Docker (repo không dùng). MinIO cài bản binary + systemd trên server (hoặc dịch vụ S3-compatible bất kỳ), bucket private `products`, domain riêng `files.example.com` sau Cloudflare → nginx → MinIO (giữ nguyên `Host` để chữ ký presigned hợp lệ), CORS chỉ cho `USER_APP_URL`/`ADMIN_APP_URL`. Biến môi trường mới ở `src/backends/api/.env`: `MINIO_ENDPOINT`, `MINIO_PUBLIC_URL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION`, `PRODUCT_IMAGE_MAX_BYTES` (5 MB), `API_DOCS_ENABLED`. Dev: MinIO chạy local `localhost:9000`.
- **Rationale**: Constitution VI (credential chỉ ở backend env), I (không đổi cách triển khai). Không proxy MinIO dưới đường dẫn con của domain app vì nginx đổi path sẽ làm sai chữ ký.
- **Alternatives**: Proxy ảnh qua API (stream) — tốn tài nguyên API, mất lợi ích presigned.
