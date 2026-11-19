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

## Bán hàng & tồn kho — `src/backends/api/test` (001-sales-inventory-mvp)

Dùng `FakeStorageService` (`test/helpers/fake-storage.ts`, MinIO giả trong bộ nhớ) và fixture `test/helpers/commerce.ts` (`createProduct`, `stockIn`, `ledgerMismatches`…); `createUser` / `signedInClient` nhận `role: 'Manager' | 'Staff'`. `storage.minio.test.ts` chỉ chạy khi có `TEST_MINIO_URL=http://<access>:<secret>@host:9000` (MinIO thật, bản community).

### `api-docs.test.ts` — API docs: bật / tắt Swagger

- bật: /api/docs-json trả OpenAPI có route hiện có, bearer auth và header x-lang, không cần đăng nhập
- bật: /api/docs trả trang Swagger UI
- tắt: /api/docs-json và /api/docs trả 404

### `api-docs.test.ts` — API docs: decorator ApiZod*

- zodToOpenApi: request dùng kiểu input (trường có default không bắt buộc), response dùng output
- ApiZodQuery: mỗi trường thành 1 query param, giữ enum và required
- ApiZodBody / ApiZodResponse / ApiErrors: body, envelope { data, error, meta } và response lỗi
- decorator tài liệu không ảnh hưởng validate: body sai vẫn trả 422, đúng thì áp default

### `commerce.unit.test.ts` — Tính tiền chứng từ (pricing)

- thành tiền dòng = SL × đơn giá − chiết khấu dòng; tổng = tạm tính − chiết khấu chứng từ
- chiết khấu bằng thành tiền hợp lệ (= 0); vượt → lỗi theo dòng / theo chứng từ
- phân bổ chiết khấu chứng từ: tổng khớp, dư vào dòng cuối có thành tiền > 0
- giá vốn đơn vị phiếu nhập sau phân bổ chiết khấu phiếu

### `commerce.unit.test.ts` — Trạng thái tồn & nhận dạng ảnh

- OUT khi = 0, LOW khi ≤ tồn tối thiểu, IN_STOCK khi lớn hơn
- nhận dạng JPEG / PNG / WebP theo chữ ký file, từ chối nội dung khác

### `inventory.core.test.ts` — Tồn kho (lõi): InventoryService & DocumentCodeService

- sinh mã chứng từ liên tiếp, không trùng khi gọi đồng thời
- nhập vào tồn 0: giá vốn bình quân = giá nhập; nhập thêm giá khác: bình quân gia quyền
- xuất kho: giá vốn ghi theo bình quân hiện tại, bình quân không đổi, đánh dấu sản phẩm có giao dịch
- xuất quá tồn: lỗi kèm details theo sản phẩm, không ghi gì
- kiểm tra thiếu hàng trên tổng các dòng cùng sản phẩm
- sản phẩm không cho số lẻ: từ chối số lượng lẻ (422); sản phẩm cho số lẻ: nhận 3 chữ số
- huỷ bán: cộng lại theo giá vốn đã lưu, bình quân tính lại nhất quán
- sổ cái: mỗi dòng ghi trước/sau, Σ biến động = tồn hiện tại
- hai giao dịch khoá đảo thứ tự sản phẩm không deadlock

### `commerce.permissions.test.ts` — Phân quyền bán hàng: vai trò mặc định

- seed tạo Manager / Staff với đúng bộ quyền mặc định; Staff không vào được trang admin
- Administrator có mọi quyền mới; role User không có quyền bán hàng
- seed lại không ghi đè quyền admin đã chỉnh cho Manager / Staff

### `commerce.permissions.matrix.test.ts` — Phân quyền bán hàng: ma trận mọi endpoint (SC-008, SC-010)

- ma trận phủ đủ mọi route mới (đọc từ OpenAPI, không bỏ sót controller nào)
- $method $route: chưa đăng nhập → 401 _(chạy cho từng endpoint trong bảng `ENDPOINTS`)_
- $method $route: quyền theo vai trò Manager / Staff / User mặc định _(chạy cho từng endpoint trong bảng `ENDPOINTS`)_

### `catalog.test.ts` — Danh mục: CRUD & ràng buộc

- quản lý tạo, sửa, xem danh mục; danh sách có số sản phẩm
- sửa một phần không ghi đè trạng thái về mặc định
- trùng tên (không phân biệt hoa thường) → 409; tên rỗng → 422
- xoá danh mục còn sản phẩm → 409; danh mục trống xoá được
- Staff xem được nhưng không tạo được danh mục; chưa đăng nhập → 401

### `catalog.test.ts` — Sản phẩm: CRUD, tìm kiếm, lọc, quyền xem giá vốn

- tạo sản phẩm: tồn 0, trạng thái Hết hàng, đang kinh doanh, chưa có ảnh
- SKU trùng (khác hoa thường) → 409; SKU sai ký tự → 422; giá âm → 422
- danh mục ngừng sử dụng → không tạo sản phẩm mới được
- tìm theo tên/SKU (không phân biệt hoa thường, ký tự đặc biệt không là wildcard), lọc kết hợp
- lọc theo trạng thái tồn và sắp xếp theo tồn
- Staff xem được sản phẩm nhưng không thấy giá nhập / giá vốn, không sửa được
- sửa một phần: không ghi đè trường khác, không có trường tồn kho
- không tắt được "cho phép số lẻ" khi tồn đang lẻ
- ngừng kinh doanh sản phẩm đã giao dịch; không xoá cứng được; sản phẩm mới xoá được

### `product-images.test.ts` — Ảnh sản phẩm (MinIO giả lập)

- form tải lên ký sẵn: key theo sản phẩm, không chứa access key / secret
- ảnh hợp lệ đầu tiên tự là ảnh chính; danh sách sản phẩm có URL xem ảnh có hạn
- sai loại / quá dung lượng bị từ chối trước khi tải lên
- file đuôi ảnh nhưng nội dung không phải ảnh → 422, object bị xoá, không gắn vào sản phẩm
- complete khi chưa tải lên → 409; hoàn tất lần 2 → 409
- tối đa ${PRODUCT_IMAGE_LIMIT} ảnh mỗi sản phẩm (tính cả ảnh đang tải)
- đổi ảnh chính, sắp xếp lại, xoá ảnh chính → ảnh đầu tiên còn lại thành ảnh chính
- thay ảnh: ảnh mới giữ vị trí + cờ ảnh chính, object ảnh cũ bị xoá
- MinIO không khả dụng: API ảnh trả 503, xem sản phẩm vẫn chạy với url = null
- dọn mồ côi: PENDING quá hạn, DELETED xoá lỗi (thử lại), object không còn bản ghi
- xoá sản phẩm chưa giao dịch: object ảnh bị xoá theo

### `storage.minio.test.ts` — Storage: MinIO thật

- tải lên qua form ký sẵn, đọc thông tin + chữ ký file, xem qua URL ký sẵn, xoá
- MinIO từ chối file vượt dung lượng hoặc sai Content-Type theo policy

### `suppliers.test.ts` — Nhà cung cấp: CRUD, tìm kiếm, lịch sử nhập

- tạo / sửa / xem; chuỗi rỗng lưu thành null; sửa một phần không đổi trạng thái
- tìm theo tên, điện thoại, email; lọc trạng thái
- email sai → 422; Staff không xem được nhà cung cấp → 403
- tóm tắt nhập hàng chỉ tính phiếu đã xác nhận; có phiếu thì không xoá được

### `purchases.test.ts` — Nhập hàng: phiếu nháp, xác nhận, huỷ

- tạo phiếu nháp: sinh mã PN-…, tính tiền, không đổi tồn kho
- dòng không hợp lệ bị từ chối: SL ≤ 0, giá âm, chiết khấu dòng / phiếu vượt thành tiền, SL lẻ
- nhà cung cấp ngừng hợp tác / sản phẩm ngừng kinh doanh → 422
- sửa phiếu nháp ghi lại dòng, tăng version; version lệch → 409
- xác nhận: cộng tồn, giá vốn bình quân, sổ cái theo dòng; phiếu thành bất biến
- chiết khấu phiếu phân bổ vào giá vốn từng dòng
- xác nhận trùng (tuần tự và đồng thời): chỉ một lần có hiệu lực, tồn chỉ tăng một lần
- huỷ phiếu nháp: không biến động tồn, không sửa được nữa
- giá nhập trên sản phẩm đổi sau khi xác nhận không làm đổi phiếu cũ
- lọc danh sách theo nhà cung cấp, trạng thái, khoảng ngày, sản phẩm; Staff → 403
- đối soát: tồn mọi sản phẩm khớp Σ sổ cái

### `sales.test.ts` — Bán hàng: tạo đơn, chốt, thanh toán, huỷ

- chốt đơn: trừ tồn, lưu giá bán + giá vốn lúc chốt, sổ cái SALE_OUT, mã DH-…
- đơn nháp không đổi tồn; mở lại, sửa, chốt sau; chốt lần 2 → 409
- thiếu hàng: 409 kèm details theo sản phẩm, không trừ tồn, đơn vẫn là nháp
- idempotent: gửi lại cùng clientRequestId trả về đơn cũ (200), không trừ tồn 2 lần
- giá khác niêm yết: Staff → 403; Manager được; chiết khấu dòng + đơn phân bổ đúng
- sản phẩm ngừng kinh doanh trong giỏ: chốt bị từ chối chỉ rõ sản phẩm
- thanh toán sau khi chốt: một chiều; nháp → 409
- huỷ đơn đã chốt: Staff → 403; Manager huỷ → cộng lại tồn, sổ SALE_CANCEL_IN, huỷ lần 2 → 409
- huỷ đơn khi sản phẩm đã ngừng kinh doanh vẫn cộng lại tồn
- Staff huỷ được đơn nháp của mình, không thấy đơn người khác (404)
- lịch sử: Staff chỉ thấy đơn mình; Manager thấy tất cả và lọc theo người tạo, trạng thái, ngày, SĐT
- người dùng tự đăng ký (role User) không gọi được API bán hàng
- x-lang: en → thông báo thiếu hàng tiếng Anh, params giữ nguyên
- đối soát: tồn mọi sản phẩm khớp Σ sổ cái

### `sales.test.ts` — Tra cứu sản phẩm cho bán hàng

- tìm theo SKU trong 10.000 sản phẩm dưới 1 giây (SC-002), chỉ sản phẩm đang kinh doanh

### `inventory.test.ts` — Tồn kho: danh sách, sổ biến động, điều chỉnh

- danh sách tồn: lọc sắp hết / hết hàng, tổng hợp; Staff không thấy giá trị
- điều chỉnh giảm do hư hỏng: tồn giảm, sổ cái ghi lý do, ghi chú, người thực hiện; giá vốn không đổi
- không cho tồn âm: giảm quá tồn → 409 kèm details
- kiểm kê: nhập số đếm thực tế, hệ thống tính chênh lệch (+ và −) trong một phiếu
- kiểm kê bằng tồn hiện tại → 422 noChange; thiếu lý do / "Khác" không ghi chú / sai trường → 422
- idempotent: gửi lại cùng clientRequestId trả về phiếu cũ (200), không điều chỉnh 2 lần
- điều chỉnh tăng sản phẩm ngừng kinh doanh vẫn được; lọc danh sách phiếu theo lý do, mã
- Staff xem tồn + sổ biến động (không giá vốn) nhưng không điều chỉnh / xem phiếu điều chỉnh
- không có API sửa tồn trực tiếp; sau mọi thao tác Σ sổ cái = tồn hiện tại (SC-004)

### `inventory.concurrency.test.ts` — Tồn kho: đồng thời

- 50 đơn chốt đồng thời trên tồn 10 → đúng 10 thành công, tồn 0, không âm
- nhập hàng xen kẽ bán hàng đồng thời: tồn cuối = nhập − bán thành công, sổ cái khớp
- nhiều đơn nhiều sản phẩm đảo thứ tự dòng: không deadlock, tồn chính xác

### `reports.test.ts` — Báo cáo & dashboard bán hàng

- lợi nhuận theo giá vốn bình quân lịch sử: 10×100k + 10×120k, bán 5 → giá vốn 550k
- đơn đã huỷ không tính vào doanh thu / lợi nhuận; chiết khấu đơn tách riêng
- doanh thu theo ngày dùng giờ Việt Nam (23:30 → ngày đó, 00:30 → ngày sau), điền đủ ngày trống
- bán theo sản phẩm / bán chạy: sắp theo số lượng, doanh thu, lợi nhuận; biên lợi nhuận
- báo cáo nhập hàng: chỉ phiếu đã xác nhận theo ngày nhập, lọc nhà cung cấp
- báo cáo tồn kho: đầu kỳ + nhập − xuất = cuối kỳ; cuối kỳ hôm nay = tồn hiện tại
- dashboard: số liệu hôm nay tăng đúng theo đơn bán / phiếu nhập; danh sách sắp hết, hết hàng
- khoảng ngày > 366 ngày hoặc ngược → 422; Staff không xem được báo cáo / dashboard bán hàng

### `reports.test.ts` — Báo cáo: hiệu năng 1 năm dữ liệu (SC-007)

- ~100.000 dòng đơn trong 1 năm: báo cáo lợi nhuận, theo ngày, theo sản phẩm, dashboard < 3 giây

## server-kit unit — tiện ích dùng cho bán hàng

### `decimal.test.ts` — decimal: tạo & định dạng

- đọc chuỗi numeric và in đủ chữ số lẻ theo scale
- làm tròn half-up theo trị tuyệt đối khi có nhiều chữ số lẻ hơn scale
- nhận số nguyên và bigint, từ chối số thực JS
- từ chối chuỗi sai định dạng
- giữ chính xác với số rất lớn (18 chữ số)
- isDecimalString kiểm tra định dạng và số chữ số lẻ tối đa

### `decimal.test.ts` — decimal: phép tính

- cộng, trừ, tổng theo scale lớn hơn
- nhân số lượng lẻ × đơn giá, làm tròn về tiền
- chia làm tròn half-up, chia hết và không hết
- giá vốn bình quân gia quyền: (10×100k + 10×120k) / 20 = 110k
- so sánh và kiểm tra số nguyên

### `decimal.test.ts` — decimal: phân bổ

- phân bổ theo tỷ lệ, tổng luôn bằng đúng giá trị gốc
- chia đều theo thành tiền khác nhau
- phần dư dồn vào dòng cuối có trọng số > 0, dòng trọng số 0 nhận 0, không dòng nào âm
- phân bổ bằng tổng trọng số (chiết khấu = tạm tính) cho kết quả đúng từng dòng
- tổng trọng số 0: chỉ hợp lệ khi giá trị phân bổ bằng 0
- từ chối giá trị hoặc trọng số âm

### `response.test.ts` — errorBody: tham số lỗi

- lỗi có tham số trả kèm `params` và thông điệp đã dịch theo ngôn ngữ
- lỗi không có tham số giữ nguyên định dạng cũ (không có trường `params`)
- `params` và `details` cùng tồn tại được
- lỗi validation không có `params`

## Tổng số

| File                                  | Số case                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `auth.session.test.ts`                | 23                                                                         |
| `auth.password.test.ts`               | 13                                                                         |
| `settings.test.ts`                    | 6                                                                          |
| `rate-limit.redis.test.ts`            | 6 khai báo (4 case chạy lại cho mỗi target đang bật, cộng 2 case dự phòng) |
| `two-factor.totp.test.ts`             | 23                                                                         |
| `two-factor.email.test.ts`            | 16                                                                         |
| `two-factor.passkey.test.ts`          | 16                                                                         |
| `two-factor.policy.test.ts`           | 10                                                                         |
| `two-factor.unit.test.ts`             | 5                                                                          |
| `server-kit/test/security.test.ts`    | 23                                                                         |
| `api-docs.test.ts`                    | 7                                                                          |
| `commerce.unit.test.ts`               | 6                                                                          |
| `inventory.core.test.ts`              | 9                                                                          |
| `commerce.permissions.test.ts`        | 3                                                                          |
| `commerce.permissions.matrix.test.ts` | 3 khai báo (2 `it.each` × 47 endpoint + 1 case = 95 case chạy)             |
| `catalog.test.ts`                     | 14                                                                         |
| `product-images.test.ts`              | 11                                                                         |
| `storage.minio.test.ts`               | 2 (bỏ qua khi thiếu `TEST_MINIO_URL`)                                      |
| `suppliers.test.ts`                   | 4                                                                          |
| `purchases.test.ts`                   | 11                                                                         |
| `sales.test.ts`                       | 15                                                                         |
| `inventory.test.ts`                   | 9                                                                          |
| `inventory.concurrency.test.ts`       | 3                                                                          |
| `reports.test.ts`                     | 9                                                                          |
| `server-kit/test/decimal.test.ts`     | 17                                                                         |
| `server-kit/test/response.test.ts`    | 4                                                                          |
| **Tổng**                              | **268** (khai báo)                                                         |
