# BaseWebSystem

Monorepo khung cho hệ thống quản lý: backend **NestJS** (chỉ API), 2 frontend **React + Vite + antd**, database **PostgreSQL**, hỗ trợ đa ngôn ngữ (Tiếng Việt / English).

## Tính năng

| | Trang admin (`src/frontends/admin`) | Trang user (`src/frontends/user`) |
|---|---|---|
| Đăng nhập | Email/mật khẩu, 2FA (**passkey**, ứng dụng xác thực TOTP, **mã qua email** + mã dự phòng), bắt buộc 2FA cho admin (tuỳ chọn) | Email/mật khẩu, **Google**, 2FA |
| Đăng ký | — | Có, captcha Cloudflare Turnstile (tuỳ chọn), bắt buộc xác minh email (tuỳ chọn) |
| Quên / đặt lại mật khẩu | Có | Có |
| Tài khoản | Họ, tên, avatar, xác minh email, đổi mật khẩu, quản lý 2FA (nhiều phương thức, nhiều passkey, phương thức mặc định) | Như admin |
| Lịch sử đăng nhập | Của chính mình (trang tài khoản) + xem của từng người dùng (modal thông tin, quyền `users.loginHistory`) | Của chính mình: thời gian, thiết bị, IP, vị trí |
| Khác | Dashboard (biểu đồ người dùng mới theo tháng), quản lý người dùng (sửa tại chỗ, đặt lại mật khẩu, tắt 2FA giúp), vai trò & phân quyền (sao chép vai trò kèm toàn bộ quyền), quyền theo API (xem/sửa URL, đồng bộ), cài đặt hệ thống (form sinh tự động từ API, import/export JSON), thông báo (chuông + trang danh sách) | Trang chủ, thông báo (chuông + trang danh sách) |

Lịch sử đăng nhập chỉ giữ **10 lần gần nhất** của mỗi người dùng (`LOGIN_HISTORY_LIMIT`). Thông báo hệ thống (chào mừng, đổi mật khẩu, thay đổi 2FA) tự gửi theo ngôn ngữ của người dùng; Cả 2 app đều có chuông thông báo trên header (badge chưa đọc, lọc Tất cả / Chưa đọc) và trang `/notifications`. API gửi thông báo từ admin (`POST /notifications`) đã có nhưng trang admin chưa có giao diện gửi.

## Cấu trúc

```
src/
├── backends/
│   └── api/            # @base/api   – NestJS (Express), port 4000
├── frontends/
│   ├── user/           # @base/user  – trang người dùng, port 5173
│   └── admin/          # @base/admin – trang quản trị, port 5174
└── packages/
    ├── config/         # tsconfig dùng chung
    ├── shared/         # zod schema, DTO, danh sách permission, setting key, locale
    ├── db/             # schema Drizzle, migration, seed, đồng bộ permission
    ├── server-kit/     # lỗi có i18n, JWT, mã hoá, TOTP, mailer, rate limit
    ├── api-client/     # SDK gọi API (tự refresh token) cho frontend
    └── ui/             # antd: provider, i18n, auth, layout, trang tài khoản dùng chung
docs/                   # tài liệu kiến trúc (xem bảng dưới)
.claude/                # launch.json (chạy preview 3 app) + skill cho Claude Code (xem dưới)
CLAUDE.md               # hướng dẫn cho Claude Code: quy trình, chọn skill, bản đồ tính năng
```

| Tài liệu | Nội dung |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Luồng request, xác thực, lịch sử đăng nhập, Cloudflare, thông báo, bản đồ API, đa ngôn ngữ, quy ước backend/frontend, thêm module mới |
| [docs/permissions.md](docs/permissions.md) | Thiết kế phân quyền (RBAC), kiểm tra quyền ở backend/frontend, thêm quyền mới |
| [docs/permission-sync.md](docs/permission-sync.md) | Nút Đồng bộ quyền giữa code và DB |
| [docs/settings.md](docs/settings.md) | Cài đặt hệ thống: khai báo, form sinh tự động, thêm cài đặt mới |
| [docs/two-factor.md](docs/two-factor.md) | 2FA đa phương thức (passkey, TOTP, email), API, giới hạn, danh sách test |
| [docs/TEST-CASES.md](docs/TEST-CASES.md) | Danh sách testcase tự động, cách chạy test |

Skill cho Claude Code (`.claude/skills/`, bảng chọn skill đầy đủ ở [CLAUDE.md](CLAUDE.md)):

| Skill | Dùng khi |
|---|---|
| `base-skill` | Mọi thay đổi code: techstack, code style, permission, setting, định nghĩa "hoàn thành" |
| `feature-module` | Thêm module nghiệp vụ mới end-to-end (DB → API → SDK → trang admin → test) |
| `db-schema` | Thêm/sửa bảng, cột, index, migration, seed, truy vấn Drizzle |
| `frontend-page` | Trang, form, menu, route, i18n ở app admin/user hoặc `@base/ui` |
| `auth-account` | Đăng nhập, phiên, đăng ký, Google, quên mật khẩu, xác minh email, 2FA, rate limit, trang tài khoản |
| `notifications` | Thông báo hệ thống, gửi thông báo từ admin, chuông/trang thông báo |
| `api-testing` | Viết/chạy test e2e API, unit test, cập nhật `docs/TEST-CASES.md` |
| `security-audit` | Rà soát bảo mật |
| `speckit-*` | Đặc tả → kế hoạch → task → triển khai cho tính năng lớn |

Đổi logo: thay `src/frontends/<user|admin>/src/assets/logo.svg` (sidebar mở rộng) và `logo-mini.svg` (sidebar thu gọn).

Triển khai production (domain đặt sau Cloudflare): xem mục [Triển khai production (Cloudflare)](#triển-khai-production-cloudflare).

## Chạy lần đầu

Yêu cầu: Node.js 22+, pnpm 11 (bản ghi trong `packageManager` của `package.json`; `corepack enable` để dùng đúng bản), PostgreSQL đang chạy (mặc định `localhost:5432`, user `postgres` / pass `postgres`).

```bash
pnpm install
cp src/backends/api/.env.example src/backends/api/.env
```

Tạo database `base_web` (nếu chưa có), sửa `DATABASE_URL` trong `src/backends/api/.env` nếu Postgres khác mặc định, và **đổi `JWT_SECRET`, `ENCRYPTION_KEY`** thành chuỗi ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
pnpm db:migrate   # tạo bảng
pnpm db:seed      # permission, role Administrator/User, setting mặc định, tài khoản super admin
pnpm dev          # chạy api + user + admin
```

- API: http://localhost:4000/api/v1/health
- User: http://localhost:5173
- Admin: http://localhost:5174 — đăng nhập bằng `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` trong `src/backends/api/.env` (mặc định `admin@example.com` / `Admin@123`, **đổi ngay sau lần đầu**).

### Biến môi trường

| File | Dùng cho |
|---|---|
| `src/backends/api/.env` | **Toàn bộ phía server**: API, script DB (`db:migrate`, `db:seed`, `db:generate`, `db:studio`) và test e2e. `DATABASE_URL` chỉ khai báo ở đây. |
| `src/frontends/user/.env`, `src/frontends/admin/.env` | Tuỳ chọn: `VITE_API_BASE_URL`, `API_PROXY_TARGET` (đều có giá trị mặc định). |

Danh sách đầy đủ, chú thích và giá trị mặc định nằm trong `.env.example` cùng thư mục. Biến đặt sẵn trong môi trường (systemd, shell) luôn được ưu tiên hơn giá trị trong file.

Biến môi trường chỉ chứa cấu hình hạ tầng (database, cổng, secret, URL app, thư mục upload, Redis). Các cấu hình vận hành — SMTP/Sendify, Google OAuth, Cloudflare Turnstile, tên site, cho phép đăng ký, bắt buộc 2FA… — **không nằm trong `.env`** mà lưu ở bảng `settings` của database, sửa trực tiếp ở trang Admin (xem [docs/settings.md](docs/settings.md)).

Cấu hình ở trang **Admin → Cài đặt**:

- **Email**: mã xác minh email và link đặt lại mật khẩu gửi qua **Sendify** (`sendify_*`, theo template) nếu đã cấu hình, nếu không thì qua SMTP (`smtp_*`). Chưa cấu hình gì thì nội dung email (kèm mã) được ghi ra log của API.
- **Đăng nhập Google**: điền `google_client_id` / `google_client_secret` (OAuth client loại *Web application*). Redirect URI cần khai báo trên Google: `<URL trang user>/api/v1/auth/google/callback` (ví dụ `http://localhost:5173/api/v1/auth/google/callback`). Frontend gọi API qua proxy cùng domain nên callback đi qua domain của app.
- **Bắt buộc xác minh email** (`require_email_verification`): bật thì mã được gửi ngay khi đăng ký, tài khoản chưa xác minh chỉ thấy màn hình nhập mã.

## Lệnh thường dùng

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Chạy tất cả app |
| `pnpm dev:api` / `dev:user` / `dev:admin` | Chạy riêng từng app |
| `pnpm build` | Build tất cả |
| `pnpm typecheck` | Kiểm tra type toàn repo |
| `pnpm test` | Test tự động: unit (`server-kit`) + e2e API (NestJS thật trên DB `<tên DB>_test`, **xoá và tạo lại mỗi lần chạy**; đổi bằng `TEST_DATABASE_URL`) |
| `pnpm lint` / `lint:fix` | ESLint (typescript-eslint, react-hooks, react-refresh) |
| `pnpm format` | Prettier định dạng toàn repo |
| `pnpm check` | Lint + typecheck + build (chạy trước khi commit) |
| `pnpm db:generate` | Sinh migration sau khi sửa schema trong `src/packages/db/src/schema` |
| `pnpm db:migrate` | Áp dụng migration |
| `pnpm db:seed` | Seed lại (chạy nhiều lần không sao); `pnpm db:seed -- --prune` xoá thêm permission không còn trong code |
| `pnpm db:studio` | Mở Drizzle Studio xem dữ liệu |

## Triển khai production (Cloudflare)

Domain luôn đặt sau **Cloudflare**. Ví dụ dưới đây dùng `app.example.com` (trang user) và `admin.example.com` (trang admin); API không cần domain riêng vì mỗi trang gọi `/api` trên chính domain của nó.

```
Trình duyệt ──HTTPS──▶ Cloudflare (SSL, chống DDoS, header IP + vị trí)
                          │  Cloudflare Tunnel (khuyên dùng): server không mở cổng web ra Internet
                          ▼
                       nginx 127.0.0.1:80 trên server
                          ├─ app.example.com    → src/frontends/user/dist   + /api → 127.0.0.1:4000
                          └─ admin.example.com  → src/frontends/admin/dist  + /api → 127.0.0.1:4000
                                                     API NestJS (node dist/main.js) → PostgreSQL, Redis
```

### 1. Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

Kết quả: `src/frontends/user/dist`, `src/frontends/admin/dist` (file tĩnh) và `src/backends/api/dist/main.js` (server API, đã gộp sẵn các package `@base/*`; thư viện như `@nestjs/*`, `express`, `pg` vẫn đọc từ `node_modules` nên server cần chạy `pnpm install`).

### 2. Database

Script DB đọc `DATABASE_URL` (và `SEED_ADMIN_*`) từ biến môi trường, nếu không có thì từ `src/backends/api/.env`. Nạp file env của API (tạo ở bước 3, chưa có thì làm bước đó trước) rồi chạy (lần đầu và mỗi lần cập nhật code):

```bash
set -a && . /etc/base-web/api.env && set +a
pnpm db:migrate
pnpm db:seed
```

### 3. Chạy API

Tạo file biến môi trường, ví dụ `/etc/base-web/api.env` (API cũng tự đọc file `.env` trong thư mục chạy nếu có; biến đặt qua systemd được ưu tiên):

```ini
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
DATABASE_URL=postgres://user:pass@localhost:5432/base_web
JWT_SECRET=<chuỗi ngẫu nhiên, tối thiểu 32 ký tự>
ENCRYPTION_KEY=<chuỗi ngẫu nhiên khác, tối thiểu 32 ký tự>
USER_APP_URL=https://app.example.com
ADMIN_APP_URL=https://admin.example.com
# Passkey: domain gốc chung của 2 app (bỏ trống = hostname của USER_APP_URL)
WEBAUTHN_RP_ID=example.com
# Nên dùng đường dẫn tuyệt đối, nằm ngoài thư mục code
UPLOAD_DIR=/var/lib/base-web/uploads
# Bộ đếm giới hạn số lần thử (đăng nhập, 2FA, quên mật khẩu…), bắt buộc khi chạy nhiều instance API
REDIS_URL=redis://127.0.0.1:6379/0
```

- `HOST=127.0.0.1` để API chỉ nghe nội bộ (chỉ nginx gọi vào). Cookie tự có cờ `Secure` vì `NODE_ENV=production`.
- `TRUSTED_PROXIES` (mặc định `127.0.0.1,::1`): API chỉ đọc header IP (`CF-Connecting-IP`, `X-Forwarded-For`) khi request đến từ các địa chỉ này; request từ địa chỉ khác bị lấy IP của kết nối. nginx chạy cùng máy thì giữ mặc định; nginx/load balancer ở máy khác thì thêm IP hoặc dải của nó, ví dụ `TRUSTED_PROXIES=127.0.0.1,::1,10.0.0.0/8`.
- `REDIS_URL` bỏ trống thì bộ đếm lưu trong bộ nhớ (chỉ đúng khi chạy 1 instance). Redis lỗi thì API vẫn chạy, tạm đếm trong bộ nhớ của từng instance và ghi lỗi vào log. Nhiều app dùng chung 1 Redis thì đặt thêm `REDIS_KEY_PREFIX` khác nhau.

Cài Redis (Ubuntu; mặc định chỉ nghe `127.0.0.1`, không mở ra ngoài):

```bash
sudo apt install redis-server
sudo systemctl enable --now redis-server
```

Chạy nhiều instance API trên nhiều máy thì dùng 1 Redis chung (đặt mật khẩu, mở cổng chỉ cho các máy API) và `REDIS_URL=redis://:<mật khẩu>@<IP Redis>:6379/0`. Cài đặt hệ thống được cache 30 giây ở mỗi instance, nên đổi cài đặt có thể mất tối đa 30 giây mới áp dụng ở các instance khác.

Chạy bằng systemd, file `/etc/systemd/system/base-web-api.service`:

```ini
[Unit]
Description=Base Web API
After=network.target postgresql.service redis-server.service

[Service]
WorkingDirectory=/srv/base-web/src/backends/api
EnvironmentFile=/etc/base-web/api.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now base-web-api
```

### 4. nginx

Mỗi domain một khối `server`. Trang admin giống hệt, chỉ đổi `server_name` và `root` sang `src/frontends/admin/dist`:

```nginx
server {
    # Dùng Cloudflare Tunnel: chỉ nghe nội bộ, cloudflared gọi vào qua 127.0.0.1.
    # Không dùng Tunnel thì đổi thành `listen 443 ssl;` (xem 5.1) và chỉ mở cổng cho dải IP Cloudflare.
    listen 127.0.0.1:80;
    server_name app.example.com;
    root /srv/base-web/src/frontends/user/dist;

    # Avatar tối đa 2MB, mặc định nginx chỉ cho 1MB
    client_max_body_size 5m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        # Không xoá các header CF-* (CF-Connecting-IP, CF-IPCountry, CF-IPCity…):
        # API dùng chúng để lấy IP thật và vị trí cho lịch sử đăng nhập. API tin các header này
        # vì request đến từ nginx (127.0.0.1), nên nginx chỉ được nhận traffic từ Cloudflare.
    }

    # File build có hash trong tên → cache lâu dài
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA: mọi đường dẫn khác trả về index.html
    location / {
        try_files $uri /index.html;
    }
}
```

### 5. Cloudflare

#### 5.1. Kết nối domain tới server bằng Cloudflare Tunnel (khuyên dùng)

1. Thêm domain vào Cloudflare, đổi nameserver theo hướng dẫn của Cloudflare.
2. Vào **Zero Trust → Networks → Tunnels → Create a tunnel** (loại *Cloudflared*), chạy trên server lệnh cài connector mà Cloudflare đưa ra.
3. Ở tab **Public Hostname** của tunnel, thêm 2 dòng:
   - `app.example.com` → Service `HTTP`, URL `127.0.0.1:80`
   - `admin.example.com` → Service `HTTP`, URL `127.0.0.1:80`

   Cloudflare tự tạo bản ghi DNS (Proxied) cho 2 domain.
4. Đóng cổng web trên firewall của server, chỉ giữ SSH:

   ```bash
   sudo ufw default deny incoming
   sudo ufw allow OpenSSH
   sudo ufw enable
   ```

**Không dùng Tunnel?** Làm theo cách sau thay cho 5.1:

- Tạo bản ghi `A` trỏ về IP server, chế độ **Proxied** (đám mây cam).
- Vào **SSL/TLS → Origin Server → Create Certificate**, cài chứng chỉ đó vào nginx (`listen 443 ssl`).
- **Bắt buộc** chỉ mở cổng 443 cho [dải IP của Cloudflare](https://www.cloudflare.com/ips/):

  ```bash
  for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
    sudo ufw allow proto tcp from "$ip" to any port 443
  done
  ```

> ⚠️ **Vì sao phải khoá origin:** API lấy IP client từ header `CF-Connecting-IP` khi request đi qua nginx. Nếu nginx nhận được request không đi qua Cloudflare, người ngoài có thể gọi thẳng vào nginx kèm header giả để lách giới hạn số lần đăng nhập sai và làm sai IP trong lịch sử đăng nhập. (Gọi thẳng vào cổng API thì không lách được: API chỉ tin header khi request đến từ `TRUSTED_PROXIES`.)

#### 5.2. SSL/TLS

- **SSL/TLS → Overview**: chọn **Full (strict)**.
- **SSL/TLS → Edge Certificates**: bật **Always Use HTTPS**.

#### 5.3. Vị trí cho lịch sử đăng nhập

- **Rules → Transform Rules → Managed Transforms**: bật **Add visitor location headers**. Cloudflare sẽ gửi thành phố và vùng (`cf-ipcity`, `cf-region`), API không phải tra IP qua dịch vụ ngoài.
- **Network → IP Geolocation**: để **bật** (mặc định đã bật, cung cấp `cf-ipcountry`).
- Nếu chưa bật Managed Transform: log API có cảnh báo *"Cloudflare chưa gửi cf-ipcity"*. Khi đó, nếu setting `login_geoip_enabled` đang bật (**Admin → Cài đặt → Bảo mật**), vị trí được tra qua ipwho.is (IP người dùng được gửi tới dịch vụ này).

#### 5.4. Cache

Không cần thêm rule: mặc định Cloudflare không cache JSON của `/api`. Nếu có tạo Cache Rule *Cache Everything* cho domain, phải thêm rule **Bypass cache** cho đường dẫn bắt đầu bằng `/api/` (response chứa dữ liệu riêng của từng người dùng).

#### 5.5. Turnstile: captcha khi đăng ký (tuỳ chọn)

Vào **Turnstile → Add widget**, hostname `app.example.com`, rồi điền *Site key* và *Secret key* vào **Admin → Cài đặt → Captcha** (`turnstile_site_key`, `turnstile_secret_key`).

#### 5.6. Đăng nhập Google (tuỳ chọn)

Redirect URI khai báo trên Google Cloud Console: `https://app.example.com/api/v1/auth/google/callback`.

### 6. Kiểm tra sau khi triển khai

- `https://app.example.com/api/v1/health` trả về `"database": "up"` (làm tương tự với `admin.example.com`).
- Đăng nhập, vào **Tài khoản → Lịch sử đăng nhập**: IP phải trùng dòng `ip=` ở `https://app.example.com/cdn-cgi/trace`, và có tên thành phố.
- Từ một máy khác, gọi thẳng IP server (`curl -m 5 http://<IP server>`) phải bị từ chối hoặc hết thời gian chờ.
- Log API (`journalctl -u base-web-api`) không có cảnh báo về `cf-ipcity`, có dòng *"Rate limit: đã kết nối Redis"* và không có lỗi *"không gọi được Redis"*.
