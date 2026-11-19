# Hệ thống quản lý bán hàng cơ bản — Constitution

Dự án xây trên monorepo **BaseWebSystem** đã có sẵn. Constitution này là ràng buộc cao nhất cho
mọi spec, plan, task và code; khi mâu thuẫn với tài liệu khác thì constitution thắng.

## Core Principles

### I. Bảo toàn kiến trúc hiện có

- KHÔNG khởi tạo dự án mới, KHÔNG thay kiến trúc, package manager (pnpm workspace + Turborepo),
  cấu hình workspace, script build/deploy hiện có.
- Code mới PHẢI nằm trong cấu trúc sẵn có: backend `src/backends/api`, frontend
  `src/frontends/{admin,user}`, dùng chung ở `src/packages/{shared,db,server-kit,api-client,ui}`.
- PHẢI tái sử dụng package/tiện ích có sẵn trước khi viết mới; logic nghiệp vụ không được lặp
  giữa hai app (đặt ở backend, schema/hằng số dùng chung ở `@base/shared`).
- Dependency mới chỉ được thêm khi plan nêu rõ lý do và không có giải pháp sẵn trong repo.

Lý do: dự án là khung đã vận hành (auth, RBAC, settings, i18n, test); thay đổi kiến trúc phá vỡ
các quy ước mà toàn bộ tài liệu và skill dựa vào.

### II. Backend NestJS chỉ API, tách nghiệp vụ khỏi controller

- Backend PHẢI giữ là REST API thuần (prefix `/api/v1`), không render giao diện.
- Mỗi domain một module NestJS (`<domain>.module/controller/service.ts`), đăng ký ở `AppModule`.
- Controller chỉ gồm decorator, validate và gọi service; nghiệp vụ nằm trong service.
- Input PHẢI được validate bằng schema zod ở `@base/shared` qua `@ZodBody/@ZodQuery/@ZodParams`
  (đây là cơ chế "DTO validation" của dự án; không thêm class-validator song song).
- Response PHẢI theo dạng chuẩn `{ data, error, meta? }` (`TransformInterceptor`,
  `AllExceptionsFilter`); lỗi nghiệp vụ ném qua `badRequest/notFound/conflict/...` của
  `@base/server-kit` với key i18n.
- Thao tác ghi nhiều bảng hoặc ảnh hưởng tiền/tồn kho PHẢI chạy trong transaction DB.
- API mới PHẢI được mô tả bằng OpenAPI/Swagger (xem TODO(OPENAPI_TOOLING)); cho tới khi có công
  cụ, bảng "Bản đồ API" trong `docs/architecture.md` PHẢI được cập nhật.
- KHÔNG trả về hoặc ghi log credential của database, storage hay secret khác.

### III. Xác thực & phân quyền dùng cơ chế có sẵn

- Mọi route mặc định cần đăng nhập (`AuthGuard` toàn cục); route công khai PHẢI ghi rõ
  `@Public()` và có lý do trong plan.
- Mỗi API quản trị PHẢI có permission khai báo trong `PERMISSION_DEFINITIONS` và được bảo vệ bằng
  `@RequirePermission(...)`; frontend ẩn/hiện theo `can(...)` chỉ là UX, không thay kiểm tra
  backend.
- KHÔNG xây hệ thống auth/RBAC thứ hai. Dữ liệu chỉ của một người dùng PHẢI được lọc theo
  principal hiện tại ở backend.

### IV. Hai frontend tách biệt, dùng chung qua package

- `admin` (quản trị) và `user` (người dùng) PHẢI là hai app React + Vite + TypeScript + antd
  riêng, cùng gọi chung backend.
- Gọi API PHẢI đi qua SDK `@base/api-client` + react-query; component không gọi `fetch` trực tiếp.
- Component/hook dùng cho cả hai app PHẢI đặt ở `@base/ui`.
- Mỗi màn hình dữ liệu PHẢI có trạng thái loading, lỗi (thông điệp qua `getErrorMessage` /
  `useNotifyError`) và rỗng (antd `Empty` hoặc `locale.emptyText` của Table).
- Giao diện PHẢI dùng được trên mobile (layout `AppShell`, bảng có `scroll.x`) và theo theme
  chung (`@base/ui` `theme.ts`, biến `--b-*`), không hard-code màu.

### V. Đa ngôn ngữ vi/en theo key

- Ngôn ngữ hỗ trợ: `vi` (mặc định) và `en`; cả hai app PHẢI hỗ trợ cùng tập ngôn ngữ.
- KHÔNG hard-code chuỗi hiển thị; mọi text qua key i18n, tổ chức theo namespace module
  (`src/frontends/<app>/src/locales`, dùng chung ở `@base/ui`, backend ở
  `src/backends/api/src/i18n`). Mỗi key PHẢI có ở cả `vi` và `en`.
- Backend PHẢI trả lỗi có `code` và `key` ổn định (kèm tham số có cấu trúc khi cần — xem
  TODO(ERROR_PARAMS)). Logic frontend PHẢI rẽ nhánh theo `error.key`/`code`, KHÔNG theo
  `message` đã dịch.
- Ngày giờ định dạng qua dayjs/`formatDateTime` (múi giờ nghiệp vụ `Asia/Ho_Chi_Minh`); số và
  tiền tệ qua `Intl.NumberFormat` theo locale đang chọn, đơn vị tiền mặc định VND.
- Ngôn ngữ người dùng lưu ở `users.lang` (và localStorage của app) như hiện tại.

### VI. Lưu trữ ảnh sản phẩm trên MinIO

- Ảnh sản phẩm PHẢI lưu trên MinIO qua API tương thích S3; bucket mặc định private.
- Upload/tải ảnh PHẢI dùng presigned URL do backend cấp, có giới hạn thời hạn, kích thước và
  loại MIME.
- Endpoint, access key, secret, bucket là cấu hình hạ tầng: chỉ ở biến môi trường backend
  (`src/backends/api/.env`, đọc qua `getEnv()`), KHÔNG lộ ra frontend.
- PostgreSQL chỉ lưu object key và metadata (tên gốc, MIME, kích thước, thứ tự, liên kết sản
  phẩm); KHÔNG lưu dữ liệu nhị phân trong cột DB.
- Avatar người dùng hiện lưu trên đĩa (`UPLOAD_DIR`); KHÔNG chuyển sang MinIO trừ khi có spec
  riêng được duyệt.

### VII. Toàn vẹn dữ liệu bán hàng & tồn kho

- Thay đổi tồn kho PHẢI an toàn khi đồng thời: cập nhật nguyên tử có điều kiện (vd.
  `stock = stock - n WHERE stock >= n`) hoặc khoá dòng (`SELECT … FOR UPDATE`) trong transaction;
  KHÔNG đọc-rồi-ghi ở tầng ứng dụng không khoá.
- Mỗi biến động tồn kho PHẢI ghi lại được (bản ghi lịch sử/nhật ký) để đối soát.
- Tiền và số lượng có phần thập phân PHẢI lưu bằng `numeric` với precision/scale cố định;
  KHÔNG dùng `float`/`double`. Qua API, giá trị tiền truyền dạng chuỗi thập phân hoặc số nguyên
  đơn vị nhỏ nhất; tính toán ở backend (hoặc SQL), không dùng số thực JS.
- Đơn hàng PHẢI lưu snapshot giá, tên sản phẩm tại thời điểm bán; sửa sản phẩm không làm đổi
  đơn cũ.

### VIII. Chất lượng, kiểm thử & không đổi hành vi ngầm

- `pnpm lint` và `pnpm typecheck` PHẢI sạch trước khi coi là xong; không tắt rule, không
  `@ts-ignore`, không `as any`.
- Logic nghiệp vụ quan trọng (tính tiền, giảm giá, chuyển trạng thái đơn) PHẢI có unit test.
- Thao tác tồn kho PHẢI có integration test e2e (`src/backends/api/test`), gồm ca đồng thời
  (nhiều request trừ kho cùng lúc không làm tồn kho âm hoặc sai lệch).
- KHÔNG âm thầm thay đổi hành vi hiện có (auth, RBAC, settings, thông báo…); mọi thay đổi như vậy
  PHẢI được nêu trong spec/plan và được người dùng chấp thuận.
- Ưu tiên code dễ đọc, áp dụng SOLID khi có lợi, tránh trừu tượng hoá chưa cần.

## Ràng buộc công nghệ & tích hợp

| Lớp | Công nghệ (hiện có) |
| --- | --- |
| Monorepo | pnpm workspace + Turborepo, Node ≥ 22, TypeScript strict |
| Backend | NestJS 11 (Express 5), REST, port 4000 |
| Database | PostgreSQL, Drizzle ORM, migration bằng `drizzle-kit` (`pnpm db:generate` / `db:migrate`), seed idempotent |
| Validate & DTO | zod 4 ở `@base/shared` (dùng chung FE/BE) |
| Auth | JWT access + refresh cookie, 2FA, RBAC theo permission ↔ API |
| Frontend | React 19 + Vite + antd 6, react-router 7, react-query 5, react-i18next |
| Object storage | MinIO (S3-compatible) — mới, cho ảnh sản phẩm |
| Test | Vitest + supertest (e2e trên DB `<tên>_test`) |

Điểm tích hợp mặc định cho tính năng bán hàng: bảng ở `src/packages/db/src/schema/`, schema
zod ở `src/packages/shared/src/schemas/`, permission ở `constants/permissions.ts`, module ở
`src/backends/api/src/<domain>/`, SDK ở `src/packages/api-client/src/endpoints/`, giao diện quản
trị ở `src/frontends/admin/src/features/<domain>/`.

## Quy trình phát triển

Trước khi sửa code cho một tính năng:

1. Khảo sát cấu trúc monorepo, app và package liên quan.
2. Xác định ORM/migration, auth/phân quyền, thư viện i18n, component/tiện ích dùng chung và quy
   ước API đang dùng (tham chiếu `CLAUDE.md`, `docs/`, `.claude/skills/`).
3. Đề xuất điểm tích hợp trong plan **trước** khi đổi mã nguồn; không giả định kiến trúc khi
   chưa đọc code.
4. Đi theo luồng Spec Kit: `speckit-specify` → (`speckit-clarify`) → `speckit-plan` →
   `speckit-tasks` → (`speckit-analyze`) → `speckit-implement`. Plan PHẢI có mục Constitution
   Check đối chiếu từng nguyên tắc trên; vi phạm phải được ghi lý do ở Complexity Tracking.
5. Khi code: tuân theo skill `base-skill` và skill tính năng tương ứng (`feature-module`,
   `db-schema`, `frontend-page`, `api-testing`…).
6. Hoàn tất: lint + typecheck (+ test khi có DB), sau đó hỏi cập nhật `README.md`, `docs/*`,
   `docs/TEST-CASES.md`.

## Governance

- Constitution có hiệu lực cao hơn mọi quy ước khác trong repo; `CLAUDE.md` và các skill PHẢI
  nhất quán với nó.
- Sửa đổi: đề xuất qua `speckit-constitution`, nêu nguyên tắc bị ảnh hưởng và kế hoạch chuyển
  đổi nếu code hiện có vi phạm; người phụ trách dự án duyệt trước khi commit.
- Phiên bản theo semver: MAJOR khi bỏ/định nghĩa lại nguyên tắc theo cách không tương thích;
  MINOR khi thêm nguyên tắc/mục hoặc mở rộng đáng kể; PATCH khi làm rõ câu chữ.
- Tuân thủ: mỗi plan kiểm tra Constitution Check; review code đối chiếu các nguyên tắc liên quan;
  `speckit-analyze` coi vi phạm constitution là mức CRITICAL.

**Version**: 1.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
