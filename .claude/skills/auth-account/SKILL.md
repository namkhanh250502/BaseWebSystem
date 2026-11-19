---
name: auth-account
description: Bản đồ và quy tắc an toàn khi sửa luồng xác thực & tài khoản của BaseWebSystem — đăng nhập mật khẩu, access/refresh token, phiên & xoay vòng token, đăng ký (Turnstile), đăng nhập Google OAuth, quên/đặt lại mật khẩu, xác minh email, 2FA (passkey/TOTP/email OTP, mã dự phòng, re-auth, bắt buộc 2FA admin), rate limit, trang tài khoản (/me: hồ sơ, avatar, đổi mật khẩu, lịch sử đăng nhập). Dùng khi người dùng nhắc "đăng nhập", "login", "token", "phiên", "đăng ký", "Google", "quên mật khẩu", "xác minh email", "2FA", "passkey", "OTP", "rate limit", "tài khoản", "avatar", "lịch sử đăng nhập". Dùng kèm base-skill.
---

# Xác thực & tài khoản

Đây là phần nhạy cảm bảo mật nhất. Trước khi sửa: đọc `docs/architecture.md` § Xác thực / Lịch sử đăng nhập / Email, Google, xác minh email, và `docs/two-factor.md` nếu đụng 2FA. Sửa xong **bắt buộc** chạy test e2e liên quan (skill `api-testing`).

## Bản đồ file

| Luồng                                                | Backend (`src/backends/api/src/`)                                                                                                                   | Frontend                                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard toàn cục, nạp principal mỗi request            | `auth/auth.guard.ts`, `auth/principal.ts`                                                                                                           | `@base/ui` `auth/AuthProvider.tsx`, `auth/guards.tsx`                                                                                                                |
| Đăng nhập, đăng ký, quên/đặt lại MK, refresh, logout | `auth/auth.controller.ts`, `auth/auth.service.ts`                                                                                                   | `@base/ui` `auth/LoginForm.tsx`, `auth/PasswordForms.tsx`; `src/frontends/<app>/src/pages/AuthPages.tsx`                                                             |
| Phiên, refresh token, cookie                         | `auth/session.service.ts`                                                                                                                           | `@base/api-client` `http.ts` (tự refresh)                                                                                                                            |
| Captcha đăng ký                                      | `auth/captcha.service.ts` (Turnstile)                                                                                                               | trang đăng ký app user                                                                                                                                               |
| Google OAuth                                         | `auth/google.service.ts`, `config/app-urls.ts`                                                                                                      | nút Google + xử lý `?twoFactorToken` / `?oauthError` ở trang login user                                                                                              |
| 2FA lõi                                              | `auth/two-factor/two-factor.service.ts`, `totp.method.ts`, `email-otp.method.ts`, `passkey.method.ts`, `auth-challenge.store.ts`, `reauth.guard.ts` | `@base/ui` `auth/TwoFactorChallenge.tsx`, `TwoFactorSetupPanel.tsx`, `BackupCodesModal.tsx`, `webauthn.ts`, `account/TwoFactorSettings.tsx`, `account/useReauth.tsx` |
| API 2FA của tài khoản (`/me/2fa/*`)                  | `account/two-factor.controller.ts`                                                                                                                  |                                                                                                                                                                      |
| Tài khoản (`/me`)                                    | `account/account.controller.ts`, `account.service.ts`, `avatar-upload.interceptor.ts`; `files/`                                                     | `@base/ui` `account/*` (`AccountPage`, `ProfileInfoForm`, `ChangePasswordForm`)                                                                                      |
| Xác minh email                                       | `email-verification/email-verification.service.ts`, `mail/mail.service.ts`                                                                          | `@base/ui` `account/EmailVerification*`                                                                                                                              |
| Lịch sử đăng nhập                                    | `login-history/login-history.service.ts`; `@base/server-kit` `user-agent.ts`, `geo.ts`, `request.ts`                                                | `@base/ui` `account/LoginHistoryTable.tsx`                                                                                                                           |
| Rate limit                                           | `core/rate-limit.service.ts`, `core/redis-rate-limit.store.ts`; `@base/server-kit` `rate-limit.ts`                                                  |                                                                                                                                                                      |
| Schema/DTO                                           | `src/packages/shared/src/schemas/{auth,account,two-factor,login-history}.ts`                                                                        |                                                                                                                                                                      |
| Bảng                                                 | `src/packages/db/src/schema/{auth,users,two-factor,login-history}.ts`                                                                               |                                                                                                                                                                      |

## Luồng đăng nhập (tóm tắt)

`POST /auth/login` → rate limit `login:<ip>:<email>` → so mật khẩu (luôn so với `DUMMY_HASH` khi không có user để thời gian phản hồi đều) → `loadActivePrincipal` (khoá → `auth.accountLocked`, app admin thiếu `admin.access` → `auth.adminAccessDenied`) →

- bật 2FA → `{ status: 'requires2fa', tempToken, methods, defaultMethod }` → `POST /auth/2fa/verify` hoặc `/auth/2fa/passkey/verify`;
- admin + setting `require_2fa_admin` → `{ status: 'requiresSetup', tempToken, allowedMethods }` → `/auth/2fa/setup` → `/auth/2fa/setup/confirm`;
- còn lại → `sessions.create(...)`: tạo refresh token (cookie `rt_admin`/`rt_user`, DB chỉ lưu SHA-256), cập nhật `lastLoginAt`, ghi `login_histories`, trả access token JWT 15 phút.

Mọi đường tạo phiên (mật khẩu, 2FA, Google, đăng ký) **phải** đi qua `SessionService.create` để có lịch sử đăng nhập và cookie đúng chuẩn.

## Bất biến bảo mật — không được phá

- Không lộ email tồn tại: sai email và sai mật khẩu trả **cùng** `auth.invalidCredentials`; quên mật khẩu **luôn** trả thành công.
- Token/mã (refresh, reset, OTP email, mã dự phòng, mã xác minh email) chỉ lưu **hash** (`sha256`); secret TOTP mã hoá `encrypt(…, ENCRYPTION_KEY)`. So sánh bằng hàm có sẵn, không tự viết so sánh chuỗi.
- Refresh token xoay vòng mỗi lần refresh, token cũ chỉ còn hiệu lực 60 giây (đa tab). Đặt lại mật khẩu → thu hồi **mọi** phiên; đổi mật khẩu → thu hồi mọi phiên **khác**.
- Access token chỉ ở bộ nhớ frontend, không lưu localStorage. Cookie refresh `httpOnly`, path `/api/v1`, `Secure` khi production.
- Principal nạp lại từ DB mỗi request — đừng cache quyền/trạng thái user vào JWT.
- Thêm/xoá phương thức 2FA khi 2FA đang bật cần `x-reauth-token` (`reauth.guard.ts`, 5 phút). Không cho gỡ phương thức cuối cùng nếu chính sách bắt buộc 2FA (`ensureCanRemove`).
- Thay đổi bảo mật (đổi MK, bật/tắt/thêm/gỡ 2FA) gửi thông báo hệ thống cho user (skill `notifications`).
- Token tạm 2FA có `purpose` (`verify` / `setup`) và gắn với `app` — kiểm tra cả hai.
- Google: kiểm tra `state` + cookie chống CSRF; liên kết theo Google ID rồi mới theo email **đã xác minh**.
- IP client chỉ lấy bằng `getClientIp(req)` (tin header chỉ khi đến từ `TRUSTED_PROXIES`); không đọc `x-forwarded-for` trực tiếp.

## Rate limit

`await this.rateLimit.hit('<prefix>:<định danh>', limit, windowMs)` (dùng `MINUTE` từ `core/rate-limit.service.ts`), vượt ngưỡng ném `tooManyRequests`. Luôn `await`. Khoá đang dùng: `login:`, `register:`, `forgot:`, `google:`, `2fa:`, `2fa-email-send:`, `verify-email:`, `verify-email-send:`, `password-check:`. Endpoint public mới có thể bị dò/brute-force → thêm rate limit theo IP và/hoặc theo user/email.

## Endpoint public / tài khoản mới

- Không cần đăng nhập: `@Public()`. Cần đăng nhập nhưng user chưa xác minh email vẫn gọi được (API tài khoản): `@AllowUnverifiedEmail()`.
- Lấy user: `@CurrentPrincipal() principal: Principal` (`principal.user`, `principal.can(...)`); request/app/ngôn ngữ: `@ReqCtx() { req, app, locale }`.
- Endpoint trả thông tin user hiện tại: map bằng `toMeDto` / `user.mapper.ts`, **không** trả `passwordHash`, secret, hash token.
- Setting liên quan (`allow_registration`, `require_email_verification`, `require_2fa_admin`, `google_*`, `turnstile_*`, `login_geoip_enabled`, `sendify_*`, `smtp_*`) đọc qua `SettingsService`.
- Email gửi qua `MailService` (Sendify → SMTP → log). Thêm loại email mới: thêm method ở `mail.service.ts`, nội dung ở `i18n/{vi,en}.ts` → `mail.*`, và thêm method tương ứng vào `FakeMailService` (`test/helpers/app.ts`).

## Kiểm tra

- Test liên quan: `auth.session.test.ts`, `auth.password.test.ts`, `two-factor.*.test.ts`, `rate-limit.redis.test.ts`, `src/packages/server-kit/test/security.test.ts`.
- Thêm case cho mọi nhánh mới, đặc biệt nhánh **từ chối** (sai mã, hết hạn, sai app, tài khoản khoá, vượt rate limit).
- Cân nhắc nạp skill `security-audit` để rà soát khi thay đổi lớn.
- Hỏi cập nhật `docs/architecture.md` § Xác thực, `docs/two-factor.md`, `README.md` (bảng Tính năng), `docs/TEST-CASES.md`.
