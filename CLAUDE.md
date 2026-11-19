# CLAUDE.md — BaseWebSystem

Monorepo khung hệ thống quản lý: **NestJS API** (port 4000, prefix `/api/v1`) + 2 app **React 19/Vite/antd 6** (`user` 5173, `admin` 5174) + **Drizzle/PostgreSQL**, đa ngôn ngữ `vi`/`en`. pnpm workspace + Turborepo, Node ≥ 22.

Giao tiếp với người dùng, comment, JSDoc và tài liệu viết **tiếng Việt có dấu**; identifier tiếng Anh.

## Bắt buộc trước khi sửa code

1. **Luôn nạp skill `base-skill`** cho mọi thay đổi code (quy ước, definition of done).
2. Nạp thêm skill theo tính năng đang làm (bảng dưới). Đọc tài liệu gốc ở `docs/` của phần tương ứng.
3. Xong việc: `pnpm lint` + `pnpm typecheck` phải sạch (không `eslint-disable`, `@ts-ignore`, `as any`); đụng backend có test thì `pnpm test`; sửa schema thì `pnpm db:generate` và commit migration.
4. Sau đó **hỏi** người dùng có cập nhật `README.md` / `docs/*` không (nêu rõ file + mục); có testcase mới thì hỏi riêng về `docs/TEST-CASES.md`.

## Chọn skill theo tính năng

| Đang làm gì                                                                                                                                                         | Skill                                                                      | Tài liệu gốc                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| Mọi thay đổi code                                                                                                                                                   | `base-skill`                                                               | `docs/architecture.md`                                  |
| Thêm module/tính năng nghiệp vụ mới end-to-end (CRUD: DB → API → SDK → trang admin)                                                                                 | `feature-module`                                                           | `docs/architecture.md` § Thêm một module mới            |
| Thêm/sửa bảng, cột, index, migration, seed                                                                                                                          | `db-schema`                                                                | `src/packages/db`                                       |
| Thêm/sửa trang, form, menu, route ở app admin hoặc user; i18n frontend                                                                                              | `frontend-page`                                                            | `docs/architecture.md` § Quy ước frontend               |
| Đăng nhập, phiên/refresh token, đăng ký, Google, quên/đặt lại mật khẩu, xác minh email, 2FA, rate limit, tài khoản (hồ sơ, avatar, đổi mật khẩu, lịch sử đăng nhập) | `auth-account`                                                             | `docs/architecture.md` § Xác thực, `docs/two-factor.md` |
| Role / permission, bảo vệ route                                                                                                                                     | `base-skill` → `permissions.md`                                            | `docs/permissions.md`, `docs/permission-sync.md`        |
| Key cài đặt hệ thống, form cài đặt                                                                                                                                  | `base-skill` → `settings.md`                                               | `docs/settings.md`                                      |
| Thông báo hệ thống, gửi thông báo từ admin, chuông/trang thông báo                                                                                                  | `notifications`                                                            | `docs/architecture.md` § Thông báo                      |
| Viết/sửa test e2e API hoặc unit test                                                                                                                                | `api-testing`                                                              | `docs/TEST-CASES.md`                                    |
| Rà soát bảo mật                                                                                                                                                     | `security-audit`                                                           | —                                                       |
| Đặc tả → kế hoạch → task (tính năng lớn)                                                                                                                            | `speckit-specify` → `speckit-plan` → `speckit-tasks` → `speckit-implement` | `.specify/`                                             |

## Bản đồ tính năng (luồng chính)

| Tính năng                  | Backend (`src/backends/api/src`)                                                                    | Frontend                                                      | Shared                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| Xác thực, phiên            | `auth/auth.controller.ts`, `auth.service.ts`, `session.service.ts`, `auth.guard.ts`, `principal.ts` | `@base/ui` `auth/*`, `pages/AuthPages.tsx` (mỗi app)          | `schemas/auth.ts`                             |
| 2FA (passkey, TOTP, email) | `auth/two-factor/*`, `account/two-factor.controller.ts`                                             | `@base/ui` `auth/TwoFactor*`, `account/TwoFactorSettings.tsx` | `schemas/two-factor.ts`                       |
| Đăng nhập Google           | `auth/google.service.ts`, `config/app-urls.ts`                                                      | trang login app user                                          | setting `google_*`                            |
| Xác minh email             | `email-verification/`, `mail/`                                                                      | `@base/ui` `account/EmailVerification*`                       | setting `require_email_verification`          |
| Tài khoản (`/me`)          | `account/account.controller.ts`, `account.service.ts`, `avatar-upload.interceptor.ts`, `files/`     | `@base/ui` `account/*`                                        | `schemas/account.ts`                          |
| Lịch sử đăng nhập          | `login-history/`                                                                                    | `@base/ui` `LoginHistoryTable`                                | `schemas/login-history.ts`                    |
| Người dùng (admin)         | `users/` (+ `users-analytics.service.ts`)                                                           | `admin/src/features/users/*`                                  | `schemas/user.ts`                             |
| Vai trò & quyền            | `roles/`, `permissions/`, `packages/db/src/permissions-sync.ts`                                     | `admin/src/features/{roles,permissions}/*`                    | `constants/permissions.ts`, `schemas/role.ts` |
| Cài đặt hệ thống           | `settings/`                                                                                         | `admin/src/features/settings/*` (form tự sinh)                | `constants/settings.ts`, `schemas/setting.ts` |
| Thông báo                  | `notifications/`, `account.controller.ts` (`/me/notifications`)                                     | `@base/ui` `notifications/*`                                  | `schemas/notification.ts`                     |
| Dashboard                  | `dashboard/`                                                                                        | `admin/src/pages/DashboardPage.tsx`                           | `schemas/dashboard.ts`                        |
| Health                     | `health/`                                                                                           | —                                                             | —                                             |

Luồng request: `@base/api-client` (header `x-app`, `x-lang`) → Vite proxy / nginx → `AuthGuard` toàn cục (`@Public`, `@RequirePermission`, `@AllowUnverifiedEmail`) → controller (validate zod) → service (`throw notFound('x.y')`…) → Drizzle. Response luôn `{ data, error, meta? }`.

## Lệnh

```bash
pnpm dev                       # api + user + admin
pnpm dev:api | dev:admin | dev:user
pnpm lint && pnpm typecheck    # bắt buộc trước khi báo xong
pnpm test                      # unit server-kit + e2e API (DB <tên>_test bị xoá/tạo lại)
pnpm db:generate && pnpm db:migrate   # sau khi sửa schema
pnpm db:seed                   # idempotent: permission, role, setting, super admin
pnpm check                     # lint + typecheck + build
```

Chạy 1 file test: `cd src/backends/api && pnpm exec vitest run test/<file>.test.ts -t "<tên case>"`.

## Những điều dễ sai

- Thêm permission: khai báo ở `PERMISSION_DEFINITIONS` **và** dịch `permissions.items.<key>` ở locale **admin** **và** `pnpm db:seed` — thiếu bước nào là quyền không hoạt động/không hiện tên.
- Thêm setting: chỉ khai báo `SETTING_DEFINITIONS` + dịch ở i18n **backend**; **không** sửa frontend.
- Key lỗi/thông báo backend phải có ở cả `i18n/vi.ts` và `i18n/en.ts` (thiếu là lỗi type).
- Module backend mới phải đăng ký trong `app.module.ts`; endpoint SDK mới phải đăng ký trong `createApi` (`src/packages/api-client/src/index.ts`).
- `RateLimitService.hit()` trả Promise — luôn `await`.
- Đọc setting qua `SettingsService.getString/getBoolean/getNumber`, không query bảng `settings`.
- Không hard-code chuỗi hiển thị trong JSX, không hard-code màu (dùng token `theme.ts` / biến `--b-*`).
- Biến môi trường server chỉ ở `src/backends/api/.env` (đọc qua `getEnv()`); cấu hình vận hành nằm ở bảng `settings`, không phải `.env`.
- Chỉ commit khi người dùng yêu cầu.
