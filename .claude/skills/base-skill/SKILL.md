---
name: base-skill
description: Quy ước bắt buộc khi viết code trong monorepo BaseWebSystem (NestJS API + 2 app React/Vite/antd + Drizzle/PostgreSQL). Dùng skill này cho MỌI thay đổi code trong repo — thêm API/route/controller/module, thêm hoặc sửa permission/role, thêm key cài đặt hệ thống (setting), thêm trang admin/user, sửa schema DB, i18n — và trước khi báo hoàn thành (phải chạy lint + typecheck, rồi hỏi có cập nhật docs/README không; có testcase mới thì hỏi cập nhật docs/TEST-CASES.md).
---

# BaseWebSystem — quy ước làm việc

Skill này tóm tắt những gì cần biết để viết code đúng kiểu dự án. Chi tiết sâu hơn nằm ở `docs/` (luôn đọc khi đụng vào phần tương ứng):

| Chủ đề                                     | File trong skill                 | Tài liệu gốc                                     |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------ |
| Thêm key cài đặt, form tự sinh             | [settings.md](settings.md)       | `docs/settings.md`                               |
| Role / permission, bảo vệ route controller | [permissions.md](permissions.md) | `docs/permissions.md`, `docs/permission-sync.md` |
| Kiến trúc, luồng request, auth, i18n       | —                                | `docs/architecture.md`                           |

Skill theo tính năng (nạp thêm khi làm phần tương ứng; bảng tổng ở `CLAUDE.md`):

| Skill            | Khi nào                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `feature-module` | Thêm module/tính năng nghiệp vụ mới end-to-end (DB → API → SDK → trang admin → test)               |
| `db-schema`      | Thêm/sửa bảng, cột, index, migration, seed, truy vấn Drizzle                                       |
| `frontend-page`  | Trang, form, menu, route, i18n ở app admin/user hoặc `@base/ui`                                    |
| `auth-account`   | Đăng nhập, phiên, đăng ký, Google, quên mật khẩu, xác minh email, 2FA, rate limit, trang tài khoản |
| `notifications`  | Thông báo hệ thống, gửi thông báo từ admin, chuông/trang thông báo                                 |
| `api-testing`    | Viết/chạy test e2e API, unit test, cập nhật `docs/TEST-CASES.md`                                   |

## 1. Techstack

Monorepo **pnpm workspace + Turborepo**, Node ≥ 22, TypeScript ~6 (`strict`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`).

| Thư mục                   | Package            | Công nghệ                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/backends/api`        | `@base/api`        | **NestJS 11** (Express 5), chỉ API, port 4000, prefix `/api/v1`. Build: Nest CLI + webpack (gộp các `@base/*`). Test: Vitest + supertest (e2e trên DB `<tên>_test`).                                                                                                                                           |
| `src/frontends/admin`     | `@base/admin`      | **React 19 + Vite 8 + antd 6**, react-router 7, `@tanstack/react-query` 5, react-i18next, recharts, dayjs. Port 5174. Alias `@/*` → `src/*`.                                                                                                                                                                   |
| `src/frontends/user`      | `@base/user`       | Như admin, port 5173.                                                                                                                                                                                                                                                                                          |
| `src/packages/shared`     | `@base/shared`     | **zod 4** schema + DTO + hằng số dùng chung FE/BE: `constants/permissions.ts`, `constants/settings.ts`, `constants/locales.ts`, `schemas/*`.                                                                                                                                                                   |
| `src/packages/db`         | `@base/db`         | **Drizzle ORM** + PostgreSQL (`pg`), schema, migration, seed, `permissions-sync.ts`. Re-export các toán tử drizzle (`eq`, `and`, `inArray`…) và bảng.                                                                                                                                                          |
| `src/packages/server-kit` | `@base/server-kit` | Lỗi có i18n (`badRequest`, `notFound`…), JWT, mã hoá, TOTP, mailer, rate limit, logger.                                                                                                                                                                                                                        |
| `src/packages/api-client` | `@base/api-client` | SDK gọi API cho frontend (tự refresh token), `endpoints/*.ts`.                                                                                                                                                                                                                                                 |
| `src/packages/ui`         | `@base/ui`         | Thành phần antd dùng chung: `AppProviders`, `AuthProvider`/`useAuth`, guard `RequireAuth`/`RequirePermission`/`Can`, `AppShell`, `PageHeader`/`SettingsSection`, trang tài khoản, chuông/trang thông báo (`NotificationBell`, `NotificationsPage`), i18n chung, `useApi`, `getErrorMessage`, `formatDateTime`… |
| `src/packages/config`     | `@base/config`     | tsconfig dùng chung (`base`, `node`, `react`).                                                                                                                                                                                                                                                                 |

Hạ tầng: PostgreSQL chạy local (`localhost:5432`, `postgres/postgres`, **không Docker**), Redis tuỳ chọn cho rate limit. Production luôn đứng sau **Cloudflare** (IP client lấy qua `getClientIp`, vị trí từ header `cf-*`). Biến môi trường server chỉ ở `src/backends/api/.env`, đọc bằng `getEnv()` (zod).

Lệnh hay dùng: `pnpm dev`, `pnpm dev:api|dev:admin|dev:user`, `pnpm db:generate` → `pnpm db:migrate` (sau khi sửa schema), `pnpm db:seed` (idempotent), `pnpm test`.

## 2. Code style

**Định dạng** — Prettier: `singleQuote`, `semi`, `trailingComma: all`, `printWidth: 100`. ESLint flat config ở `eslint.config.mjs`: typescript-eslint recommended; backend bật `no-floating-promises` (luôn `await` hoặc `void`); frontend bật rule React Compiler của `react-hooks` v7 (không setState đồng bộ trong effect, không đọc/ghi ref khi render) và `react-refresh/only-export-components`; `no-console` (chỉ `warn`/`error`, logger dùng `@base/server-kit`). Biến/tham số không dùng phải bắt đầu bằng `_`.

**Ngôn ngữ** — comment, JSDoc và tài liệu viết **tiếng Việt có dấu**; identifier tiếng Anh. Comment giải thích _vì sao_, không lặp lại code. Hằng số/hàm export có JSDoc `/** ... */` ngắn.

**TypeScript**

- Danh sách khai báo dùng `[...] as const satisfies readonly X[]`, rồi suy ra union type (`PermissionKey`, `SettingName`) → gõ sai key là lỗi compile. Giữ mẫu này khi thêm danh sách mới.
- `import type` / `type X` inline cho import chỉ dùng kiểu. Thứ tự import: thư viện ngoài → `@base/*` → đường dẫn tương đối (frontend: `@/...`).
- Kiểu input lấy từ zod: `z.infer<typeof xxxSchema>`; không định nghĩa interface trùng lặp với schema.
- Không dùng `any`; không `// @ts-ignore`.

**Backend (NestJS)**

- Mỗi domain một thư mục `src/backends/api/src/<domain>/`: `<domain>.module.ts`, `<domain>.controller.ts`, `<domain>.service.ts` (kebab-case). Module mới phải thêm vào `imports` của `app.module.ts`.
- Controller mỏng: chỉ decorator + validate + gọi service. Nghiệp vụ nằm ở service `@Injectable()`.
- Validate bằng `@ZodBody(schema)` / `@ZodQuery(schema)` / `@ZodParams(idParamSchema)`, schema đặt ở `@base/shared/src/schemas/<x>.ts` (frontend dùng lại).
- DB: `constructor(@InjectDb() private readonly db: Database)`; transaction dùng kiểu `Tx` / `DbOrTx` từ `core/database.ts`. Bảng mới dùng `id: uuid().primaryKey().defaultRandom()` và `...timestamps`.
- Response tự bọc `{ data, error, meta? }` bởi `TransformInterceptor` — controller chỉ `return` dữ liệu; danh sách phân trang `return paginated(await service.list(query))`.
- HTTP status: POST tạo mới mặc định 201; API hành động `@HttpCode(HttpStatus.OK)`; không trả body `@HttpCode(HttpStatus.NO_CONTENT)`.
- Lỗi nghiệp vụ: `throw notFound('roles.notFound')`, `conflict('roles.nameExists', { name })`, `forbidden(...)`, `badRequest(...)` từ `@base/server-kit`, và **thêm key vào cả** `src/backends/api/src/i18n/vi.ts` lẫn `en.ts` (`en` có kiểu bắt buộc giống `vi`, thiếu là lỗi type).
- Ngày giờ trả về client dạng ISO string (`.toISOString()`); map entity → DTO trong service (vd. `hydrate`, `user.mapper.ts`).
- Đọc cài đặt luôn qua `SettingsService.getString/getBoolean/getNumber`, không query bảng `settings` trực tiếp.

**Frontend (React)**

- Tổ chức theo feature: `src/features/<feature>/` (component PascalCase `.tsx`, hook `useXxx.ts`). Phần dùng chung cả 2 app đặt ở `@base/ui`.
- Gọi API qua `const api = useApi()` + react-query (`useQuery`, `useMutation`, `queryClient.invalidateQueries({ queryKey: ['roles'] })`). Endpoint mới thêm vào `@base/api-client/src/endpoints/*.ts` và đăng ký trong `createApi`.
- Thông báo: `const { message, modal } = App.useApp()`; `void message.success(...)`; lỗi `message.error(getErrorMessage(err, t))`.
- Chữ hiển thị qua `useTranslation(['<ns>', 'common'])`; bản dịch ở `src/frontends/<app>/src/locales/{vi,en}.ts` (riêng app) hoặc `src/packages/ui/src/i18n/locales` (dùng chung). Không hard-code chuỗi tiếng Việt/Anh trong JSX.
- Giao diện theo GPMPay (font Inter 13px, màu chính `#3d97ff`): sửa token ở `@base/ui/src/providers/theme.ts` và CSS chung ở `@base/ui/src/styles.css` (dùng biến `--b-*`), không hard-code màu cũ trong app. Trang danh sách: `<div className="b-page">` + `<PageHeader>` + `<Card>` chứa `b-toolbar` và `<Table>` (pagination có `showTotal`).
- Ẩn/hiện theo quyền: `useAuth().can('x.y')`, `<Can permission>`, route bọc `<RequirePermission permission>`.

## 3. Các tác vụ thường gặp

- **Thêm key cài đặt** → làm theo [settings.md](settings.md). Tóm tắt: khai báo trong `SETTING_DEFINITIONS` + dịch `settings.keys.<name>` ở i18n **backend** → form admin tự sinh, **không sửa frontend**.
- **Thêm route cần phân quyền** → làm theo [permissions.md](permissions.md). Tóm tắt: thêm dòng vào `PERMISSION_DEFINITIONS` + dịch `permissions.items.<key>` ở locale **admin** + `@RequirePermission('<key>')` trên handler + `pnpm db:seed`.
- **Thêm module mới** (vd. `products`): schema DB (`src/packages/db/src/schema/products.ts`, export ở `schema/index.ts`, `pnpm db:generate` + `pnpm db:migrate`) → zod schema/DTO ở `@base/shared` → permission `products.*` → module/controller/service backend + đăng ký `AppModule` → endpoint SDK → feature admin + route + menu (`AdminLayout.tsx`) + bản dịch. Xem `docs/architecture.md` § "Thêm một module mới".

## 4. Định nghĩa "hoàn thành" (bắt buộc)

Một thay đổi code **chỉ được coi là xong** khi cả hai lệnh sau chạy ở thư mục gốc repo và **thành công (exit code 0, không có error)**:

```bash
pnpm lint
```

```bash
pnpm typecheck
```

Quy tắc:

1. Chạy cả hai sau lần sửa code cuối cùng — sửa thêm bất cứ thứ gì thì chạy lại.
2. Có lỗi → sửa tận gốc rồi chạy lại cho tới khi sạch. **Không** được tắt rule, thêm `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, ép `as any` hay nới tsconfig để qua lint/type.
3. Không để lại warning mới do thay đổi của mình (ví dụ `no-console`, `react-refresh`).
4. Có thể dùng `pnpm lint:fix` cho lỗi tự sửa được, nhưng vẫn phải chạy lại `pnpm lint`.
5. Khi báo cáo cho người dùng, nêu rõ đã chạy hai lệnh và kết quả. Nếu không chạy được (thiếu dependency, môi trường lỗi…) thì nói rõ là **chưa xác minh**, không tuyên bố hoàn thành.
6. Nên chạy thêm khi phù hợp: `pnpm test` nếu đụng logic backend có test (`src/backends/api/test`, `src/packages/server-kit/test`); `pnpm db:generate` nếu sửa schema DB (commit kèm migration sinh ra); `pnpm check` (lint + typecheck + build) trước khi commit lớn.

## 5. Sau khi hoàn thành: luôn hỏi cập nhật docs và README

Sau khi lint + typecheck đã qua, **luôn hỏi người dùng** có muốn cập nhật tài liệu cho thay đổi vừa làm hay không — kể cả khi thay đổi có vẻ nhỏ. Không tự ý sửa tài liệu khi chưa được đồng ý, và không bỏ qua bước hỏi.

Khi hỏi, nêu cụ thể **file nào** và **mục nào** có thể cần sửa, dựa trên bảng sau:

| Thay đổi                                                                            | Tài liệu liên quan                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tính năng mới / bỏ tính năng, lệnh `pnpm` mới, biến môi trường mới, bước triển khai | `README.md` (bảng Tính năng, Lệnh thường dùng, Biến môi trường, Triển khai production)                                   |
| Kiến trúc, luồng request, auth, i18n, quy ước backend/frontend, module mới          | `docs/architecture.md`                                                                                                   |
| Setting: key/nhóm/kiểu mới, đổi cách sinh form                                      | `docs/settings.md`                                                                                                       |
| Permission/role, guard, decorator, quyền mới của module                             | `docs/permissions.md`, `docs/permission-sync.md`                                                                         |
| 2FA, passkey, TOTP, email OTP                                                       | `docs/two-factor.md`                                                                                                     |
| Thêm / sửa / xoá testcase                                                           | `docs/TEST-CASES.md` (xem đoạn dưới)                                                                                     |
| Quy ước code, checklist làm việc thay đổi                                           | Skill này (`.claude/skills/base-skill/*.md`), skill tính năng liên quan (`.claude/skills/<skill>/SKILL.md`), `CLAUDE.md` |

**Testcase mới → hỏi riêng về `docs/TEST-CASES.md`.** Nếu thay đổi có thêm testcase mới (file test mới, hoặc `it(...)` / `test(...)` / `describe(...)` mới trong `src/backends/api/test/**`, `src/packages/server-kit/test/**` hay bất kỳ file `*.test.ts` nào), **luôn hỏi** người dùng có muốn cập nhật `docs/TEST-CASES.md` không. Khi hỏi, liệt kê các testcase mới (file + tên case + kịch bản kiểm tra ngắn gọn). File này chưa tồn tại thì hỏi có tạo mới không. Testcase chỉ bị sửa/xoá thì cũng nêu ra để người dùng quyết định có cần chỉnh file này không.

Nếu xác định không có tài liệu nào bị ảnh hưởng, vẫn nói rõ điều đó và hỏi người dùng xác nhận. Khi được đồng ý sửa tài liệu: viết tiếng Việt có dấu, giữ văn phong và cấu trúc mục hiện có, cập nhật cả liên kết chéo giữa các file nếu đổi tiêu đề mục.
