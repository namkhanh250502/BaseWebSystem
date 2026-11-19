---
name: api-testing
description: Cách viết và chạy test tự động trong BaseWebSystem — test e2e API (Vitest + supertest, NestJS thật trên DB <tên>_test) với helper createTestApp / Client / ok / fail / createUser / signedInClient / FakeMailService / TestTotpMethod / SoftAuthenticator, unit test @base/server-kit, và cập nhật docs/TEST-CASES.md. Dùng khi người dùng nói "viết test", "thêm testcase", "test e2e", "test API", "chạy test", "test fail", hoặc sau khi sửa logic backend cần kiểm chứng. Dùng kèm base-skill.
---

# Test tự động

## Bố cục

| Gói                       | Thư mục                                  | Lệnh                                     | Cần                                                 |
| ------------------------- | ---------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `@base/api` (e2e)         | `src/backends/api/test/*.test.ts`        | `pnpm --filter @base/api test`           | PostgreSQL local; Redis tuỳ chọn (`TEST_REDIS_URL`) |
| `@base/server-kit` (unit) | `src/packages/server-kit/test/*.test.ts` | `pnpm --filter @base/server-kit test`    | Không                                               |
| Toàn repo                 |                                          | `pnpm test` (turbo chạy typecheck trước) |                                                     |

- `test/global-setup.ts` **xoá và tạo lại** DB `<tên>_test` (chỉ nhận tên có hậu tố `_test`), chạy migration + seed. Đổi DB bằng `TEST_DATABASE_URL`.
- Các file chạy **tuần tự** (`fileParallelism: false`) trên cùng DB → mỗi test tự tạo dữ liệu riêng (email `uniqueEmail()`), không phụ thuộc thứ tự, không giả định bảng rỗng.
- Một file: `cd src/backends/api && pnpm exec vitest run test/<file>.test.ts`; lọc case: `-t "<một phần tên>"`.
- Test file được typecheck bằng `tsconfig.test.json` (nằm trong `pnpm typecheck`).

## Helper (`src/backends/api/test/helpers/`)

| Helper                                                                                                                 | Dùng để                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createTestApp()` → `t`                                                                                                | Khởi động AppModule thật (giống `main.ts`), có `t.server`, `t.db`, `t.mail` (FakeMailService), `t.totp`, `t.settings`, `t.setSetting(name, value)`, `t.close()`                                  |
| `new Client(t.server, 'user' \| 'admin')`                                                                              | Giả lập trình duyệt: giữ cookie refresh, access token, `x-app`, `x-lang: vi`, IP riêng mỗi client (rate limit không dính chéo). `get/post/put/patch/delete`, `login(email, pw)`, `remember(res)` |
| `ok(res, status = 200)`                                                                                                | Khẳng định thành công, trả `data`                                                                                                                                                                |
| `fail(res, status, key?)`                                                                                              | Khẳng định lỗi + key i18n (`res.body.error.key`)                                                                                                                                                 |
| `createUser(t.db, { admin, superAdmin, verified, isActive, lang, password })`                                          | Tạo user thẳng trong DB (admin = role Administrator)                                                                                                                                             |
| `signedInClient(t, options, app)`                                                                                      | Tạo user + đăng nhập sẵn → `{ user, email, password, client }`                                                                                                                                   |
| `t.mail.last('verificationCode' \| 'resetPassword' \| 'twoFactorCode', email)`                                         | Đọc mã/link email đã "gửi"                                                                                                                                                                       |
| `totpCode(secret)`, `wrongTotpCode(secret)`, `enableTotp`, `enableEmail`, `addPasskey`, `reauthWithTotp`, `startLogin` | Luồng 2FA dựng sẵn (`fixtures.ts`, `flows.ts`)                                                                                                                                                   |
| `SoftAuthenticator` (`webauthn.ts`)                                                                                    | Authenticator ES256 offline cho passkey                                                                                                                                                          |

## Khung test e2e

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fail, ok, type TestApp } from './helpers/app';
import { signedInClient } from './helpers/flows';

describe('Products: CRUD & phân quyền', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('admin tạo được sản phẩm và thấy trong danh sách', async () => {
    const { client } = await signedInClient(t, { admin: true }, 'admin');
    const created = ok(await client.post('/products', { name: 'A' }), 201);
    const list = await client.get('/products?search=A');
    expect(ok(list).map((p: { id: string }) => p.id)).toContain(created.id);
    expect(list.body.meta.total).toBeGreaterThan(0);
  });

  it('user thường không có quyền → 403', async () => {
    const { client } = await signedInClient(t);
    fail(await client.get('/products'), 403);
  });

  it('dữ liệu sai → 422; không tồn tại → 404 với key riêng', async () => {
    const { client } = await signedInClient(t, { admin: true }, 'admin');
    fail(await client.post('/products', { name: '' }), 422, 'errors.validation');
    fail(await client.get(`/products/${crypto.randomUUID()}`), 404, 'products.notFound');
  });
});
```

Quy ước:

- Tên `describe`/`it` viết **tiếng Việt có dấu**, mô tả hành vi mong đợi (đây cũng là nội dung ghi vào `docs/TEST-CASES.md`).
- Kiểm tra cả nhánh **thành công lẫn từ chối**: chưa đăng nhập (401), thiếu quyền (403), validate (422 `errors.validation`), lỗi nghiệp vụ `badRequest` (400), không tồn tại (404), trùng (409), rate limit (429) nếu có.
- Status đúng quy ước: tạo mới 201, hành động 200, không body 204.
- Đổi setting trong test qua `t.setSetting(...)` (xoá cache) và **trả lại giá trị cũ** trong `afterAll`/`finally` để không ảnh hưởng file khác.
- Kiểm tra side effect trong DB bằng `t.db` khi API không trả đủ (vd. token chỉ lưu hash).
- Không gọi dịch vụ ngoài: mail đã fake; IP test dải `10.x` nên không tra vị trí.
- Service mới gọi dịch vụ ngoài → thêm `.overrideProvider(...)` trong `createTestApp` theo mẫu `MailService`.
- Riêng file helper được phép `any` cho JSON động (đã có sẵn); trong test thường thì dùng kiểu cụ thể hoặc ép kiểu tối thiểu.

## Unit test

Hàm thuần (không DB/HTTP) đặt ở `src/packages/server-kit/test/` hoặc `two-factor.unit.test.ts` kiểu gọi trực tiếp service. Không cần `createTestApp`.

## Khi test fail

1. Đọc thông điệp của `ok()` (in cả status và body) → thường là key lỗi i18n chỉ ra nguyên nhân.
2. Lỗi khởi động/migration → kiểm tra Postgres đang chạy và `DATABASE_URL` trong `src/backends/api/.env`.
3. Sửa code cho đúng, **không** nới assertion để test qua trừ khi hành vi mong đợi thực sự đổi (khi đó nói rõ với người dùng).
4. Không chạy được (không có DB…) → báo rõ là **chưa xác minh**.

## Cập nhật `docs/TEST-CASES.md`

Khi thêm/sửa/xoá testcase, **hỏi người dùng** trước khi sửa file này (theo base-skill § 5). Khi được đồng ý: thêm mục `### \`<file>.test.ts\` — <tên describe>`, liệt kê case giữ **nguyên tên trong code**, nhóm theo endpoint nếu file đã làm vậy, và cập nhật mục **Tổng số** cuối file.
