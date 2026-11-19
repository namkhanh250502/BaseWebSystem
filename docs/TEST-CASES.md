# Danh sách testcase

File này liệt kê toàn bộ testcase tự động trong repo, nhóm theo file và theo `describe`. Tên case giữ nguyên như trong code, nên có thể tìm lại bằng cách grep. Khi thêm, sửa hoặc xoá testcase, cập nhật file này cùng lúc với thay đổi code.

## Cách chạy

| Gói                | Lệnh                                  | Cần gì                                                                                                                                                                                                           |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@base/server-kit` | `pnpm --filter @base/server-kit test` | Không cần gì. Unit test thuần, không dùng DB hay mạng.                                                                                                                                                           |
| `@base/api`        | `pnpm --filter @base/api test`        | PostgreSQL local. Test e2e chạy NestJS thật trên DB riêng `<tên DB>_test`. `test/global-setup.ts` **xoá và tạo lại** DB này, chạy migration và seed (chỉ chấp nhận tên DB có hậu tố `_test`). Redis là tuỳ chọn. |
| Toàn repo          | `pnpm test`                           | Turbo chạy `typecheck` trước rồi mới chạy test của từng gói.                                                                                                                                                     |

Ghi chú:

- DB test lấy từ `TEST_DATABASE_URL`. Nếu không có biến này, tên DB được suy ra từ `DATABASE_URL` trong `src/backends/api/.env` rồi thêm `_test` (`test/test-env.ts`).
- Các file test API dùng chung một DB nên chạy tuần tự (`fileParallelism: false` trong `vitest.config.ts`).
- Mail được thay bằng `FakeMailService` (`test/helpers/app.ts`), nên test không gửi thư thật và không gọi Sendify/SMTP.
- Muốn chạy thêm bộ test rate limit trên Redis thật thì đặt `TEST_REDIS_URL`, ví dụ `redis://localhost:6379/15`.
- Chạy một file: `cd src/backends/api && pnpm exec vitest run test/auth.session.test.ts`. Lọc theo tên case: thêm `-t "<một phần tên>"`.

Helper dùng chung nằm ở `src/backends/api/test/helpers/`:

- `app.ts`: `createTestApp`, `Client`, `ok`/`fail`.
- `fixtures.ts`: `createUser`, sinh mã TOTP.
- `flows.ts`: các luồng đăng nhập dựng sẵn.
- `webauthn.ts`: `SoftAuthenticator`, authenticator ES256 chạy offline.

---

## API e2e — `src/backends/api/test`

### `auth.session.test.ts` — Auth: đăng nhập & phiên

**POST /auth/login**

- đăng nhập đúng: trả access token, set cookie refresh httpOnly, ghi lịch sử
- chỉ giữ `LOGIN_HISTORY_LIMIT` lần đăng nhập gần nhất, xoá các lần cũ hơn
- email không phân biệt hoa thường
- sai mật khẩu và email không tồn tại trả cùng 1 lỗi (không lộ email)
- tài khoản Google chưa có mật khẩu không đăng nhập bằng mật khẩu được
- mật khẩu của hash giả (cân bằng thời gian) không mở được tài khoản chưa có mật khẩu: case hồi quy bảo mật. Đăng nhập bằng đúng plaintext của `DUMMY_HASH` (`dummy-password-for-timing`) vào tài khoản `passwordHash = NULL` phải trả 401 `auth.invalidCredentials`, ở cả app user lẫn app admin.
- tài khoản bị khoá → 403
- user thường không vào được app admin
- admin vào được app admin
- body sai định dạng → 422
- khoá tạm sau 10 lần sai liên tiếp (429), kể cả khi sau đó nhập đúng

**POST /auth/register**

- đăng ký thành công: tạo user role mặc định, đăng nhập luôn, hash mật khẩu
- email đã tồn tại → 409
- mật khẩu yếu (không có số / quá ngắn) → 422
- tắt đăng ký → 403

**Phiên: refresh / logout / guard**

- refresh xoay vòng token; token cũ dùng lại sau thời gian ân hạn bị từ chối
- cookie của app user không dùng được cho app admin
- logout thu hồi refresh token và xoá cookie
- route cần đăng nhập: thiếu token / token giả / token khác audience → 401
- khoá tài khoản giữa phiên có hiệu lực ngay (không chờ access token hết hạn)
- bắt buộc xác minh email: chặn API thường (403) nhưng vẫn cho xem /auth/me và gửi mã

**Xác minh email**

- mã sai bị từ chối, gửi lại trong 60 giây bị chặn

**Khác**

- DEFAULT_PASSWORD hợp lệ theo chính sách

### `auth.password.test.ts` — Auth: mật khẩu

**Quên / đặt lại mật khẩu**

- gửi link tới email; email không tồn tại vẫn trả thành công nhưng không gửi
- link theo app: yêu cầu từ app admin trỏ về ADMIN_APP_URL
- tài khoản bị khoá không nhận link
- chỉ lưu hash của token trong DB
- đặt lại mật khẩu: đăng nhập bằng mật khẩu mới, mật khẩu cũ hết hiệu lực, mọi phiên bị thu hồi
- token chỉ dùng được 1 lần; yêu cầu mới vô hiệu hoá các token cũ khi đặt lại
- token hết hạn hoặc bịa → 400
- mật khẩu mới phải theo chính sách
- giới hạn 3 yêu cầu / email / giờ

**Đổi mật khẩu (POST /me/change-password)**

- cần mật khẩu hiện tại đúng; đổi xong đăng xuất thiết bị khác, giữ phiên hiện tại
- mật khẩu mới trùng mật khẩu cũ → 400
- tài khoản Google (chưa có mật khẩu) đặt mật khẩu lần đầu không cần mật khẩu cũ
- chặn dò mật khẩu hiện tại: 10 lần sai → 429

### `settings.test.ts` — Settings: danh sách động & kiểm tra giá trị

- trả mọi key đã khai báo theo nhóm, có nhãn/mô tả đã dịch theo ngôn ngữ
- nhóm có gợi ý trả kèm các dòng code (redirect URI Google)
- nhóm Sendify đứng trước SMTP và có gợi ý cơ chế ưu tiên
- key bí mật không trả giá trị
- select lấy lựa chọn từ DB (roles) và từ chối giá trị ngoài danh sách
- multiselect có nhãn dịch, chuẩn hoá thứ tự và từ chối giá trị lạ

### `rate-limit.redis.test.ts` — Rate limit

**Rate limit trên `<target>`.** Cùng một bộ case chạy cho từng target. `ioredis-mock` luôn chạy; "Redis thật (TEST_REDIS_URL)" chỉ chạy khi biến này được đặt.

- đếm theo key, vượt limit thì 429 kèm số giây chờ; reset xoá bộ đếm
- trả về số lần và thời điểm hết cửa sổ; hết cửa sổ thì đếm lại từ 1
- nhiều request cùng lúc: đếm đủ, không mất lượt
- 2 instance dùng chung 1 Redis thì dùng chung bộ đếm

**Rate limit: Redis lỗi thì tạm đếm trong bộ nhớ**

- store lỗi → vẫn giới hạn bằng bộ đếm dự phòng
- Redis không kết nối được: lệnh báo lỗi ngay (không treo request)

### `two-factor.totp.test.ts` — 2FA: TOTP & mã dự phòng

**Chống dùng lại mã (RFC 6238 §5.2)**

- mã đã dùng (hoặc cũ hơn mã đã dùng) bị từ chối; mã bước mới vẫn dùng được
- 2 request gửi cùng lúc với cùng 1 mã: chỉ 1 request qua
- gỡ TOTP rồi thiết lập lại: secret mới không bị chặn bởi bước của secret cũ

**Bật TOTP ở trang tài khoản**

- trạng thái ban đầu: chưa bật, đủ phương thức khả dụng
- thiết lập → nhập mã đúng → bật, nhận 8 mã dự phòng; secret được mã hoá trong DB
- bật khi chưa tạo QR → 400 notSetup
- chấp nhận lệch đồng hồ ±1 bước (30 giây), từ chối lệch 3 bước
- đã bật: thiết lập lại cần xác minh lại; xác minh xong thì báo đã bật (409)

**Đăng nhập với TOTP**

- mật khẩu đúng → requires2fa (không có access token / cookie), nhập mã → vào được
- không truyền method: mã 6 số được hiểu là TOTP
- mã sai → 400; phương thức chưa bật → 400 methodNotEnabled
- khoá thử mã sau 10 lần sai (429), kể cả khi mã sau đó đúng
- token tạm: giả / của app khác / hết hạn / khác loại đều bị từ chối
- tài khoản bị khoá sau bước mật khẩu → không qua được bước 2FA
- 2FA bị admin tắt trong lúc chờ → token tạm hết tác dụng

**Mã dự phòng**

- đăng nhập bằng mã dự phòng (không phân biệt hoa thường / dấu gạch); mỗi mã dùng 1 lần
- mã dự phòng của user khác không dùng được
- tạo lại mã dự phòng cần xác minh lại; mã cũ mất hiệu lực
- xác minh lại bằng mã dự phòng cũng được (và tiêu hao mã đó)

**Token xác minh lại (x-reauth-token)**

- chỉ có hiệu lực cho đúng user, đúng app, còn hạn, đúng loại
- xác minh lại bằng phương thức chưa bật → 400
- cần đăng nhập

**Khác**

- user chưa bật 2FA không bị đòi xác minh lại khi bật phương thức đầu tiên

### `two-factor.email.test.ts` — 2FA: Email

**Bật email 2FA**

- email chưa xác minh thì không bật được
- gửi mã → nhập đúng → bật (phương thức đầu tiên → có mã dự phòng); mã lưu dạng hash
- gửi lại trong 60 giây → 429 emailCooldown
- gửi tối đa 5 lần / giờ
- mã cũ hết hiệu lực khi gửi mã mới
- hệ thống không cho phép email (setting two_factor_methods) → 400 methodNotAllowed

**Đăng nhập bằng mã email**

- requires2fa kèm email đã che; gửi mã → nhập đúng → vào được, ghi lịch sử
- chỉ bật email: mã 6 số không kèm method được hiểu là mã email
- mã chỉ dùng được 1 lần
- sai 5 lần → mã bị huỷ, nhập đúng sau đó vẫn bị từ chối
- mã hết hạn (10 phút) bị từ chối
- mã gửi cho mục đích khác (xác minh lại) không dùng để đăng nhập được
- mã của user khác không dùng được
- setting tắt email: user đang dùng email vẫn đăng nhập được (không bị khoá ngoài)

**Kết hợp với phương thức khác**

- đã có TOTP: thêm email cần xác minh lại, không sinh lại mã dự phòng
- gỡ email khi còn TOTP: 2FA vẫn bật; gỡ nốt TOTP: 2FA tắt, xoá mã dự phòng

### `two-factor.passkey.test.ts` — 2FA: Passkey

**Đăng ký passkey**

- options đúng RP / user / chính sách; challenge lưu server-side
- đăng ký thành công: lưu public key, là phương thức đầu tiên → mã dự phòng, mặc định = passkey
- đăng ký lại cùng authenticator: options có excludeCredentials, server từ chối trùng (409)
- origin lạ (trang lừa đảo) / RP ID khác / challenge giả / thiếu User Present → bị từ chối
- challenge chỉ dùng 1 lần: thất bại xong thử lại với cùng options → hết hạn
- chưa xin options → 400; dữ liệu không đúng dạng → 422
- tối đa 10 passkey mỗi tài khoản
- setting không cho phép passkey → 400 methodNotAllowed

**Đăng nhập bằng passkey**

- options chỉ liệt kê passkey của user; ký đúng → vào được, cập nhật counter + lastUsedAt
- phát lại (replay) cùng 1 chữ ký → bị từ chối
- signature counter không tăng (authenticator bị nhân bản) → bị từ chối
- origin lạ / chữ ký bị sửa / passkey của người khác → bị từ chối
- nhiều phương thức: danh sách theo ưu tiên passkey > totp, có thể đổi mặc định

**Quản lý passkey**

- đổi tên không cần xác minh lại; không đổi được passkey của người khác
- xoá cần xác minh lại (bằng chính passkey); xoá passkey cuối → tắt 2FA
- còn passkey khác thì xoá 1 passkey không tắt 2FA; không xoá được passkey của người khác

### `two-factor.policy.test.ts` — 2FA: chính sách & quản trị

**Tắt toàn bộ 2FA (POST /me/2fa/disable)**

- cần xác minh lại + mật khẩu; xoá mọi phương thức, đăng xuất thiết bị khác

**Bắt buộc 2FA cho quản trị viên (require_2fa_admin)**

- admin chưa bật 2FA vào app admin → requiresSetup, mặc định không cho chọn email
- thiết lập TOTP ngay trong lúc đăng nhập → nhận phiên + mã dự phòng
- thiết lập passkey trong lúc đăng nhập
- token thiết lập và token xác minh không dùng lẫn cho nhau
- admin_2fa_allow_email = true: cho chọn email (khi email đã xác minh)
- admin không gỡ được phương thức mạnh cuối cùng, không tắt được 2FA; gỡ email thì được

**Admin tắt 2FA giúp user (POST /users/:id/disable-2fa)**

- xoá sạch TOTP, email, passkey, mã dự phòng; user thường không có quyền gọi

**Thông báo bảo mật**

- bật lần đầu / thêm / gỡ phương thức đều tạo thông báo cho user

**Quay về từ đăng nhập Google (POST /auth/2fa/methods)**

- trả danh sách phương thức theo token tạm

### `two-factor.unit.test.ts` — unit test 2FA (không gọi HTTP)

Dù không gọi HTTP, file này vẫn chạy qua `globalSetup` của API, nên vẫn cần Postgres.

**maskEmail**

- chỉ giữ 1–2 ký tự đầu và domain

**schema 2FA**

- phản hồi WebAuthn: bắt buộc id/rawId/type public-key/response
- đăng nhập: method chỉ nhận totp/email/backup (passkey có endpoint riêng)
- thiết lập: mặc định TOTP; xác minh lại: method hợp lệ

**webAuthnConfig**

- RP ID theo env, origin gồm cả app user và admin

---

## server-kit unit — `src/packages/server-kit/test/security.test.ts`

**crypto: AES-256-GCM cho secret 2FA**

- mã hoá rồi giải mã ra đúng; mỗi lần mã hoá ra kết quả khác (IV ngẫu nhiên)
- sai key hoặc dữ liệu bị sửa → ném lỗi (GCM xác thực toàn vẹn)
- sha256 / randomToken

**mã dự phòng & mật khẩu ngẫu nhiên**

- mã dự phòng dạng XXXX-XXXX, không có ký tự dễ nhầm (0 O 1 I)
- chuẩn hoá mã người dùng nhập
- mật khẩu ngẫu nhiên luôn có chữ thường, chữ hoa, chữ số

**password: scrypt**

- hash có salt ngẫu nhiên, verify đúng/sai
- hash hỏng / thuật toán lạ → false (không ném lỗi)

**JWT**

- ký và xác minh đúng audience
- khác audience / sai secret / hết hạn / bị sửa → null
- từ chối thuật toán "none"
- expiresIn dạng chuỗi giây là tương đối (bẫy: số nguyên là thời điểm tuyệt đối)
- đọc Bearer token

**TOTP**

- secret Base32, URL otpauth có issuer và label
- khớp mã RFC 6238 hiện tại và ±1 bước, từ chối mã xa hơn / sai định dạng

**rate limit (fixed window)**

- cho phép đúng `limit` lần rồi ném 429 kèm số giây chờ
- hết cửa sổ thời gian thì đếm lại

**request: IP, cookie**

- ưu tiên CF-Connecting-IP, rồi X-Forwarded-For, rồi X-Real-IP
- X-Forwarded-For đọc từ phải sang, bỏ qua proxy tin cậy (phần tử trái giả mạo được)
- chỉ tin header IP khi kết nối đến từ proxy tin cậy
- cấu hình proxy tin cậy theo IP / CIDR
- chuẩn hoá IP
- cookie phiên luôn HttpOnly + SameSite, Secure khi bật

---

## Tổng số

| File                               | Số case                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `auth.session.test.ts`             | 23                                                                         |
| `auth.password.test.ts`            | 13                                                                         |
| `settings.test.ts`                 | 6                                                                          |
| `rate-limit.redis.test.ts`         | 6 khai báo (4 case chạy lại cho mỗi target đang bật, cộng 2 case dự phòng) |
| `two-factor.totp.test.ts`          | 23                                                                         |
| `two-factor.email.test.ts`         | 16                                                                         |
| `two-factor.passkey.test.ts`       | 16                                                                         |
| `two-factor.policy.test.ts`        | 10                                                                         |
| `two-factor.unit.test.ts`          | 5                                                                          |
| `server-kit/test/security.test.ts` | 23                                                                         |
| **Tổng**                           | **141**                                                                    |
