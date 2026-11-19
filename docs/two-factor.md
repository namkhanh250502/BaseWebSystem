# Xác thực 2 lớp đa phương thức (TOTP · Email · Passkey)

> Trạng thái: **đã triển khai**. Code chính: `src/backends/api/src/auth/two-factor/`, `src/packages/shared/src/schemas/two-factor.ts`, `src/packages/ui/src/account/TwoFactorSettings.tsx`, `src/packages/ui/src/auth/TwoFactorChallenge.tsx`. Test: `src/backends/api/test/two-factor.*.test.ts`.

## 1. Phương thức

| Phương thức | Mô tả | Độ mạnh |
|---|---|---|
| `passkey` | WebAuthn: vân tay / Face ID / Windows Hello / khoá USB. Mỗi tài khoản tối đa 10 passkey | Mạnh nhất (chống phishing) |
| `totp` | Ứng dụng Authenticator (Google Authenticator, Authy…), chấp nhận lệch ±30 giây, mỗi mã dùng 1 lần | Mạnh |
| `email` | Mã 6 số gửi tới email **đã xác minh**, hiệu lực 10 phút, dùng 1 lần | Yếu hơn (xem §7) |

Mã dự phòng: 8 mã `XXXX-XXXX`, dùng chung cho mọi phương thức, chỉ lưu SHA-256.

Đăng nhập bằng passkey không cần mật khẩu (passwordless) chưa làm; bảng `passkeys` đã sẵn sàng cho việc đó.

## 2. Quy tắc

1. `users.twoFactorEnabled = true` ⇔ có ít nhất 1 phương thức đang bật (tính lại sau mỗi lần thêm/xoá). Các chỗ chỉ cần biết "có 2FA hay không" (`google.service`, `user.mapper`, trang admin) đọc cờ này.
2. Bật phương thức **đầu tiên** → sinh 8 mã dự phòng (trả về 1 lần) và đặt làm phương thức mặc định. Thêm phương thức sau → không đổi mã dự phòng.
3. Gỡ phương thức **cuối cùng** → tắt 2FA, xoá mã dự phòng. Gỡ phương thức mặc định → mặc định chuyển sang phương thức còn lại theo ưu tiên `passkey > totp > email`.
4. **Xác minh lại (step-up)**: khi 2FA đang bật, các thao tác thêm/xoá phương thức, xoá passkey, tạo lại mã dự phòng, tắt toàn bộ cần header `x-reauth-token` (JWT audience `2fa-reauth`, 5 phút, gắn với user + app). Thiếu/không hợp lệ → `403 twoFactor.reauthRequired`. Đổi tên passkey và đổi phương thức mặc định không cần.
5. Email 2FA chỉ bật được khi `emailVerifiedAt != null`.
6. `require_2fa_admin = true`: tài khoản có `admin.access` đăng nhập app admin mà chưa có 2FA → `requiresSetup`; phải giữ ít nhất 1 phương thức **mạnh** (`passkey`/`totp`), trừ khi `admin_2fa_allow_email = true`. Gỡ phương thức mạnh cuối → `403 twoFactor.lastStrongMethod`; tắt toàn bộ → `403 twoFactor.requiredForAdmin`.
7. Setting `two_factor_methods` (CSV, mặc định `totp,email,passkey`): phương thức bị bỏ thì không bật mới được (`400 twoFactor.methodNotAllowed`); người đang dùng vẫn đăng nhập được (không bị khoá ngoài).
8. Admin "Tắt 2FA giúp user" (`POST /users/:id/disable-2fa`) xoá sạch TOTP, email, passkey, mã dự phòng.
9. Tắt toàn bộ 2FA (người dùng tự làm) cần xác minh lại + mật khẩu, và đăng xuất các thiết bị khác.

## 3. Dữ liệu

Schema: `src/packages/db/src/schema/two-factor.ts` và `users.ts`; toàn bộ bảng nằm trong migration khởi tạo `0000_absurd_sleepwalker`.

- `users`: `two_factor_enabled`, `two_factor_secret` (secret TOTP đã mã hoá), `two_factor_totp_enabled`, `two_factor_totp_last_step`, `two_factor_email_enabled`, `two_factor_default_method`.
- `two_factor_backup_codes`: mã dự phòng (SHA-256), xoá theo user (`ON DELETE CASCADE`).
- `passkeys`: `credential_id` (unique), `public_key` (COSE, base64url), `counter`, `transports`, `device_type`, `backed_up`, `aaguid`, `name`, `last_used_at`.
- `auth_challenges`: thử thách dùng 1 lần — `type` (`email_otp` | `webauthn_register` | `webauthn_authenticate`), `purpose` (`login` | `enable` | `reauth`), `value` (SHA-256 của mã email hoặc challenge WebAuthn), `attempts`, `expires_at`, `consumed_at`. Mỗi (user, type, purpose) chỉ 1 bản ghi còn hiệu lực; mã cho mục đích này không dùng được cho mục đích khác. Lưu DB nên chạy được nhiều instance; tự dọn bản ghi hết hạn > 1 ngày.
- `login_histories.two_factor_method`: cách đã qua 2FA (`totp` | `email` | `passkey` | `backup`), trả về trong `GET /me/login-history`.

## 4. API

### 4.1 Đăng nhập (`/api/v1/auth/2fa/*`, public, dùng `tempToken`)

`POST /auth/login` (và callback Google) khi cần 2FA:

```ts
| { status: 'requires2fa'; tempToken; methods: TwoFactorMethod[]; defaultMethod; emailHint? }
| { status: 'requiresSetup'; tempToken; allowedMethods: TwoFactorMethod[] }
```

Token tạm có `purpose` (`verify` / `setup`) và gắn với app; token loại này không dùng được cho loại kia.

| Endpoint | Body | Kết quả |
|---|---|---|
| `POST /auth/2fa/methods` | `{ tempToken }` | `{ methods, defaultMethod, emailHint? }` (sau redirect Google) |
| `POST /auth/2fa/email/send` | `{ tempToken }` | `{ emailHint, cooldownSeconds }` |
| `POST /auth/2fa/verify` | `{ tempToken, method?: 'totp' \| 'email' \| 'backup', code }` | phiên đăng nhập. Thiếu `method`: 6 số → TOTP (hoặc email nếu chỉ bật email), còn lại → mã dự phòng |
| `POST /auth/2fa/passkey/options` | `{ tempToken }` | `PublicKeyCredentialRequestOptionsJSON` |
| `POST /auth/2fa/passkey/verify` | `{ tempToken, response }` | phiên đăng nhập |
| `POST /auth/2fa/setup/methods` | `{ tempToken }` (setup) | `{ allowedMethods }` (sau redirect Google) |
| `POST /auth/2fa/setup` | `{ tempToken, method }` (setup) | `{ method: 'totp', qrCode, secret, otpauthUrl }` \| `{ method: 'email', emailHint, cooldownSeconds }` \| `{ method: 'passkey', options }` |
| `POST /auth/2fa/setup/confirm` | `{ tempToken, method, code? , response?, name? }` | phiên đăng nhập + `backupCodes` |

### 4.2 Quản lý (`/api/v1/me/2fa/*`, đã đăng nhập)

| Endpoint | Xác minh lại? | Mô tả |
|---|---|---|
| `GET /me/2fa` | – | `TwoFactorStatusDto` |
| `POST /me/2fa/reauth/prepare` `{ method }` | – | email → gửi mã; passkey → options |
| `POST /me/2fa/reauth` `{ method, code?, response? }` | – | `{ reauthToken, expiresIn: 300 }` |
| `POST /me/2fa/totp/setup` · `POST /me/2fa/totp/enable { code }` · `DELETE /me/2fa/totp` | khi 2FA đang bật | TOTP |
| `POST /me/2fa/email/send` · `POST /me/2fa/email/enable { code }` · `DELETE /me/2fa/email` | khi 2FA đang bật | Email |
| `POST /me/2fa/passkeys/options` · `POST /me/2fa/passkeys { name, response }` · `DELETE /me/2fa/passkeys/:id` | khi 2FA đang bật | Passkey |
| `PATCH /me/2fa/passkeys/:id { name }` | – | Đổi tên |
| `PUT /me/2fa/default-method { method }` | – | Đổi mặc định |
| `POST /me/2fa/backup-codes` | ✔ | Tạo lại mã dự phòng |
| `POST /me/2fa/disable { password? }` | ✔ | Tắt toàn bộ |

Route có cột "khi 2FA đang bật" / ✔ dùng decorator `@RequireReauth()` (`auth/two-factor/reauth.guard.ts`). `api-client` tự gắn `x-reauth-token` sau khi gọi `me.twoFactor.reauth()`; UI dùng hook `useReauth` để tự mở hộp thoại xác minh lại khi cần.

## 5. Cấu hình

| Biến môi trường | Ý nghĩa |
|---|---|
| `WEBAUTHN_RP_ID` | Domain gốc gắn passkey. Bỏ trống = hostname của `USER_APP_URL`. App user/admin ở 2 subdomain (`app.example.com`, `admin.example.com`) → đặt `example.com` để dùng chung passkey |
| `WEBAUTHN_RP_NAME` | Tên trong hộp thoại passkey, mặc định `APP_NAME` |
| `WEBAUTHN_ORIGINS` | Origin được phép thêm, phân tách bằng dấu phẩy (mặc định đã gồm `USER_APP_URL`, `ADMIN_APP_URL`) |

Setting (trang admin → Bảo mật): `two_factor_methods`, `admin_2fa_allow_email`; nhóm Sendify: `sendify_template_two_factor_code` (biến: fullName, code, expiresInMinutes, appName, ipAddress, device).

WebAuthn bắt buộc HTTPS (trừ `localhost`).

## 6. Giới hạn chống dò

| Hành động | Giới hạn |
|---|---|
| Nhập mã / passkey (đăng nhập, xác minh lại, bật phương thức) | 10 lần / 10 phút / user, reset khi đúng |
| Mã TOTP | Mỗi mã dùng 1 lần: lưu bước thời gian (30 giây) của mã đúng gần nhất vào `users.two_factor_totp_last_step`, từ chối mã có bước ≤ bước đã lưu (RFC 6238 §5.2). Ghi bằng 1 câu `UPDATE … WHERE last_step < step` nên 2 request gửi cùng lúc với cùng mã chỉ 1 request qua. Xoá khi thiết lập lại / gỡ TOTP |
| Mã email | sai 5 lần → huỷ mã; gửi lại sau 60 giây; 5 lần gửi / giờ |
| Challenge WebAuthn | 5 phút, dùng 1 lần (kể cả khi xác minh thất bại); kiểm tra origin, RP ID, chữ ký, signature counter |

## 7. Rủi ro đã biết

1. **Email 2FA + quên mật khẩu qua email = thực chất 1 yếu tố.** Ai chiếm được hộp mail có thể đặt lại mật khẩu và nhận luôn mã. Giảm thiểu: email không tính là phương thức mạnh cho admin; UI cảnh báo khi email là phương thức duy nhất; email chứa IP + thiết bị yêu cầu.
2. **RP ID**: nếu app user và admin ở 2 domain khác hẳn nhau, passkey không dùng chung được — cần RP ID riêng cho từng app hoặc Related Origin Requests (`/.well-known/webauthn`). Hiện chỉ hỗ trợ 1 RP ID.
3. Rate limit lưu trên Redis khi đặt `REDIS_URL` (bắt buộc khi chạy nhiều instance); không đặt thì lưu trong bộ nhớ. Redis lỗi thì tạm đếm trong bộ nhớ của từng instance (giới hạn lỏng hơn, nhân theo số instance) cho tới khi Redis hồi phục.
4. Vì mỗi mã TOTP chỉ dùng 1 lần, đăng nhập 2 thiết bị trong cùng 30 giây thì thiết bị thứ 2 phải chờ mã kế tiếp.
5. Đổi `ENCRYPTION_KEY` làm hỏng TOTP (như trước); passkey và email không bị ảnh hưởng.

## 8. Test

`pnpm test` (hoặc `pnpm --filter @base/api test`) chạy NestJS thật trên database `<tên DB>_test` (**xoá và tạo lại mỗi lần chạy**, đổi bằng `TEST_DATABASE_URL`), email được thay bằng `FakeMailService`, passkey dùng authenticator phần mềm ES256 (`test/helpers/webauthn.ts`).

| File | Nội dung |
|---|---|
| `auth.session.test.ts` | Đăng nhập, đăng ký, refresh xoay vòng + ân hạn, logout, guard, khoá tài khoản, xác minh email, lịch sử đăng nhập (chỉ giữ `LOGIN_HISTORY_LIMIT` lần gần nhất) |
| `auth.password.test.ts` | Quên / đặt lại / đổi mật khẩu, thu hồi phiên, rate limit |
| `two-factor.totp.test.ts` | TOTP, chống dùng lại mã, mã dự phòng, token tạm (giả, hết hạn, khác app, khác loại), token xác minh lại |
| `two-factor.email.test.ts` | Email OTP: cooldown, giới hạn gửi, sai 5 lần, hết hạn, tách mục đích, kết hợp phương thức |
| `two-factor.passkey.test.ts` | Đăng ký / đăng nhập passkey, origin lạ, RP ID sai, replay, counter, chữ ký bị sửa, giới hạn |
| `two-factor.policy.test.ts` | Bắt buộc 2FA cho admin, thiết lập lúc đăng nhập, tắt toàn bộ, admin tắt giúp user, thông báo |
| `two-factor.unit.test.ts` | Schema, `maskEmail`, cấu hình WebAuthn |
| `settings.test.ts` | Cài đặt động: nhóm/nhãn dịch theo ngôn ngữ, gợi ý nhóm (redirect URI Google, Sendify trước SMTP), ẩn key bí mật, `select` / `multiselect` |
| `rate-limit.redis.test.ts` | Rate limit trên Redis (ioredis-mock; Redis thật khi đặt `TEST_REDIS_URL`), dùng chung giữa instance, dự phòng khi Redis lỗi |
| `server-kit/test/security.test.ts` | AES-GCM, scrypt, JWT, TOTP RFC 6238, rate limit, cookie, IP + proxy tin cậy |

Test chạy nhanh hơn 1 bước TOTP nên `createTestApp` thay `TotpMethod` bằng `TestTotpMethod` (quên bước đã dùng trước mỗi lần kiểm tra); test chống dùng lại mã bật `t.totp.replayProtection = true`.
