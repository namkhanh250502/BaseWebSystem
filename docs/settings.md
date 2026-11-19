# Cài đặt hệ thống (Settings)

Tài liệu này mô tả cách trang **Admin → Cài đặt** được thiết kế, dữ liệu đi từ đâu tới đâu, và các bước khi thêm một cài đặt mới.

Liên quan: [Phân quyền](permissions.md) · [Kiến trúc chung](architecture.md)

## 1. Nguyên tắc thiết kế

- **Khai báo trong code, giá trị trong DB.** Danh sách key, nhóm, kiểu, giá trị mặc định… nằm trong code; DB chỉ lưu cặp `name → value`.
- **Không có key tự do.** Trang admin chỉ hiển thị và chỉ cho lưu các key đã khai báo; API từ chối key lạ, import bỏ qua key lạ.
- **Backend mô tả, frontend chỉ vẽ.** `GET /settings` trả danh sách nhóm → key kèm nhãn, mô tả (đã dịch theo ngôn ngữ request), kiểu, lựa chọn, placeholder, giá trị. Frontend sinh form hoàn toàn từ JSON này — **không có tên key, tên nhóm hay bản dịch key nào trong code frontend**. Thêm key = sửa backend/shared, không đụng frontend.
- **Mỗi nhóm lưu riêng**, chỉ gửi các key có thay đổi.
- **Key bí mật không bao giờ quay về client.**

```
SETTING_DEFINITIONS (shared)        i18n backend                 bảng settings (DB)
  name / group / type / default       settings.groups.<g>.*         name / value
  options / optionsSource             settings.keys.<k>.*             │
  isSecret / isPublic / example         │                            │
            └───────────────┬───────────┴────────────────────────────┘
                            ▼
              SettingsService.list(locale) ── GET /settings ──► SettingsPage
              (ghép khai báo + bản dịch + lựa chọn               ├─ SettingsSection (mỗi nhóm server trả)
               + giá trị, ẩn giá trị bí mật)                     │   └─ SettingsGroupForm
                                                                 │       └─ ô nhập theo type / options
              SettingsService.update()  ◄── PUT /settings ────── └─ chỉ gửi key thay đổi
              (kiểm tra & chuẩn hoá theo type / options)
```

Ví dụ 1 phần tử của `GET /settings` (header `x-lang: vi`):

```json
{
  "name": "security",
  "title": "Bảo mật",
  "description": "Xác minh email, xác thực 2 lớp và vị trí đăng nhập.",
  "hint": null,
  "items": [
    {
      "name": "two_factor_methods",
      "group": "security",
      "type": "multiselect",
      "label": "Phương thức 2FA được phép",
      "description": "Bỏ 1 phương thức thì ...",
      "placeholder": null,
      "defaultValue": "totp,email,passkey",
      "isSecret": false,
      "isPublic": false,
      "options": [
        { "value": "totp", "label": "Ứng dụng xác thực" },
        { "value": "email", "label": "Email" },
        { "value": "passkey", "label": "Passkey" }
      ],
      "value": "totp,email,passkey",
      "configured": true,
      "updatedAt": "2026-11-07T03:00:00.000Z"
    }
  ]
}
```

Kiểu TypeScript: `SettingGroupDto` / `SettingItemDto` / `SettingHintDto` trong [`src/packages/shared/src/schemas/setting.ts`](../src/packages/shared/src/schemas/setting.ts).

## 2. Khai báo

File: [`src/packages/shared/src/constants/settings.ts`](../src/packages/shared/src/constants/settings.ts)

```ts
export const SETTING_GROUPS = ['general', 'security', 'sendify', 'mail', 'google', 'captcha'] as const;

export const SETTING_DEFINITIONS = [
  { name: 'site_name', group: 'general', type: 'string', defaultValue: 'Base Web', isPublic: true },
  { name: 'smtp_port', group: 'mail', type: 'number', defaultValue: '587' },
  { name: 'smtp_password', group: 'mail', type: 'string', defaultValue: '', isSecret: true },
  { name: 'default_role', group: 'general', type: 'select', optionsSource: 'roles', defaultValue: 'User' },
  {
    name: 'two_factor_methods',
    group: 'security',
    type: 'multiselect',
    options: ['totp', 'email', 'passkey'],
    defaultValue: 'totp,email,passkey',
  },
  // ...
] as const satisfies readonly SettingDefinition[];
```

| Trường | Ý nghĩa |
| ------ | ------- |
| `name` | Key, dạng `snake_case`. Sinh ra type `SettingName` → gọi `getString('sai_ten')` là TypeScript báo lỗi. |
| `group` | Nhóm hiển thị, phải thuộc `SETTING_GROUPS`. Thứ tự nhóm trên trang = thứ tự trong `SETTING_GROUPS`; thứ tự key trong nhóm = thứ tự khai báo. |
| `type` | `string` · `text` · `number` · `boolean` · `email` · `url` · `select` · `multiselect` — quyết định ô nhập và cách kiểm tra (mục 4). |
| `options` | `select` / `multiselect`: danh sách giá trị cố định. Nhãn từng lựa chọn dịch ở `settings.keys.<name>.options.<value>` (thiếu thì hiện chính giá trị). |
| `optionsSource` | `select` / `multiselect`: lấy lựa chọn từ DB thay cho `options`. Hiện có `'roles'` (tên các role). |
| `defaultValue` | Luôn là **chuỗi** (`'true'`, `'587'`…). Dùng khi DB chưa có dòng cho key này. |
| `isSecret` | Không trả giá trị về client, không export trừ khi chọn "kèm bí mật". |
| `isPublic` | Được phép đưa vào `GET /settings/public` (không cần đăng nhập). Xem lưu ý ở mục 6. |
| `example` | Hiện làm placeholder của ô nhập. |

Bảng DB: `settings (id, name unique, value text, createdAt, updatedAt)` — [`src/packages/db/src/schema/settings.ts`](../src/packages/db/src/schema/settings.ts). Mọi giá trị lưu dạng chuỗi; giá trị rỗng `''` nghĩa là "chưa cấu hình".

## 3. Giao diện

Thư mục: [`src/frontends/admin/src/features/settings/`](../src/frontends/admin/src/features/settings/)

| File | Vai trò |
| ---- | ------- |
| `SettingsPage.tsx` | Gọi `GET /settings` (query key gồm ngôn ngữ hiện tại → đổi ngôn ngữ thì tải lại), lặp qua các nhóm server trả, mỗi nhóm render 1 `SettingsSection` (tiêu đề + mô tả bên trái, form bên phải) chứa 1 `SettingsGroupForm`; nhóm có `hint` thì hiện khung gợi ý ở đầu form. Header có nút **Export JSON** và **Import JSON**. |
| `SettingsGroupForm.tsx` | Form của 1 nhóm: sinh ô nhập theo `type` / `options`, so sánh với giá trị cũ, chỉ gửi key thay đổi qua `PUT /settings`, rồi ghi kết quả trả về vào cache react-query. |
| `ImportSettingsModal.tsx` | Đọc file JSON, chuẩn hoá về mảng `[{ name, value }]`, hiển thị xem trước (gắn nhãn "Bỏ qua" cho key không có trong `GET /settings`), tuỳ chọn ghi đè. |

`SettingsSection` là component dùng chung trong `@base/ui` (`packages/ui/src/components/PageHeader.tsx`).

### 3.1 Ô nhập theo kiểu

| `type` / điều kiện | Ô nhập | Giá trị form ↔ chuỗi DB |
| ------------------ | ------ | ------------------------ |
| `boolean` | `Switch` | `true/false` ↔ `'true'/'false'` |
| `number` | `InputNumber` | số ↔ chuỗi số, rỗng ↔ `null` |
| `isSecret` | `Input.Password`, placeholder "Đã cấu hình — để trống nếu không đổi" | luôn bắt đầu rỗng |
| `text` | `Input.TextArea` (3 dòng) | giữ nguyên |
| `select` | `Select` 1 giá trị, lựa chọn = `options` server trả | giá trị ↔ chuỗi, rỗng ↔ `''` |
| `multiselect` | `Select mode="multiple"` | mảng ↔ `'a,b,c'` |
| `string`, `email`, `url` | `Input`, placeholder = `placeholder` | giữ nguyên |

Mỗi ô có: nhãn (`label`), key gốc dạng `code`, tag **Bí mật** / **Đã cấu hình**, và dòng mô tả (`description`). Key bí mật đã cấu hình có thêm nút **Xóa giá trị** (gửi `''`).

Bản dịch của nhóm/key nằm ở **backend** (`src/backends/api/src/i18n/{vi,en}.ts`, mục `settings`), dịch theo header `x-lang` mà frontend gửi:

| Bản dịch | Dùng cho |
| -------- | -------- |
| `settings.groups.<group>.title` / `.description` | Tiêu đề và mô tả nhóm (thiếu → tên nhóm / rỗng) |
| `settings.groups.<group>.hint` | (Tuỳ chọn) dòng gợi ý đầu nhóm |
| `settings.keys.<name>.label` / `.description` | Nhãn và mô tả ô nhập (thiếu → tên key / rỗng) |
| `settings.keys.<name>.options.<value>` | Nhãn lựa chọn của `select` / `multiselect` (thiếu → chính giá trị) |

Locale của frontend admin (`settings.*` trong `src/frontends/admin/src/locales`) chỉ còn chữ chung của trang: tiêu đề, nút Lưu, Export/Import, tag Bí mật…

### 3.2 Quyền

| Hành động | Quyền | Ghi chú |
| --------- | ----- | ------- |
| Vào trang, xem | `settings.list` | Không có `settings.update` → form chỉ đọc, ẩn nút Lưu. |
| Lưu | `settings.update` | |
| Export | `settings.export` | Mục "Kèm giá trị bí mật" chỉ hiện (và backend chỉ chấp nhận) khi có thêm `settings.update`. |
| Import | `settings.import` | |

## 4. Backend

Files: [`settings.controller.ts`](../src/backends/api/src/settings/settings.controller.ts), [`settings.service.ts`](../src/backends/api/src/settings/settings.service.ts)

| API | Mô tả |
| --- | ----- |
| `GET /settings/public` (`@Public`) | Object `PublicSettings` đã ép kiểu, cho frontend trước khi đăng nhập. |
| `GET /settings` | Mảng `SettingGroupDto` theo thứ tự `SETTING_GROUPS` (bỏ nhóm không có key): tiêu đề, mô tả, `hint` của nhóm + từng key với `label`, `description`, `type`, `options`, `placeholder`, `value` (bí mật → `null`), `configured` (DB có giá trị khác rỗng), `updatedAt`. Chữ dịch theo `x-lang`. Key chưa có dòng trong DB trả `defaultValue`. |
| `PUT /settings` | Body `{ values: { name: value } }`. Key lạ → `400 settings.unknownKey`. Trả lại danh sách đầy đủ (cùng dạng `GET`). |
| `GET /settings/export?includeSecrets=` | File `{ version: 1, exportedAt, includeSecrets, settings: [{ name, value }] }`. |
| `POST /settings/import` | Body `{ settings: [{ name, value }], overwrite }`. Trả `{ created, updated, skipped, unknown }`. |

**Kiểm tra & chuẩn hoá** (`normalizeValue`): giá trị được `trim`; rỗng luôn hợp lệ. `boolean` chỉ nhận `true`/`false`; `number` phải là số hữu hạn (lưu `String(Number(v))`); `email`, `url` kiểm tra định dạng; `select` phải thuộc danh sách lựa chọn; `multiselect` mọi phần tử phải thuộc danh sách, bỏ trùng và lưu theo thứ tự của danh sách (`'passkey, totp'` → `'totp,passkey'`); `string`/`text` giữ nguyên. Sai → `400 settings.invalidValue` (import: cả file bị từ chối).

**Import**: key trùng trong file lấy giá trị cuối; key chưa có giá trị (hoặc rỗng) → đặt mới; key đã có giá trị → chỉ ghi khi `overwrite = true` và giá trị khác; còn lại tính là bỏ qua.

**Đọc giá trị trong code** — luôn đi qua `SettingsService`, không query bảng trực tiếp:

```ts
constructor(private readonly settings: SettingsService) {}

await this.settings.getString('site_name');
await this.settings.getBoolean('require_2fa_admin');   // 'true' (không phân biệt hoa thường) → true
await this.settings.getNumber('smtp_port');            // không phải số → defaultValue
```

Chưa có trong DB → `defaultValue`. Giá trị được **cache trong bộ nhớ 30 giây**, xoá cache ngay khi lưu / import ở chính instance đó. Chạy nhiều instance thì instance khác có thể thấy giá trị cũ tối đa 30 giây.

## 5. Thêm một cài đặt mới

Ví dụ thêm `max_login_attempts` (số, nhóm Bảo mật).

1. **Khai báo** trong `src/packages/shared/src/constants/settings.ts`, đặt đúng vị trí muốn hiển thị trong nhóm:

   ```ts
   { name: 'max_login_attempts', group: 'security', type: 'number', defaultValue: '5' },
   ```

2. **Bản dịch** ở backend, `src/backends/api/src/i18n/vi.ts` và `en.ts`, mục `settings.keys`:

   ```ts
   max_login_attempts: {
     label: 'Số lần đăng nhập sai tối đa',
     description: 'Vượt quá thì tạm khoá đăng nhập.',
   },
   ```

   Nên có cả `label` và `description` (để `''` nếu không cần mô tả); quên dịch thì trang vẫn hiện, nhãn = tên key. `en.ts` có kiểu bắt buộc giống `vi.ts` → thiếu là TypeScript báo lỗi. Key `select` / `multiselect` thêm `options: { <value>: '<nhãn>' }`.

3. **Dùng giá trị** ở backend:

   ```ts
   const max = await this.settings.getNumber('max_login_attempts');
   ```

4. **(Tuỳ chọn) Tạo dòng mặc định trong DB**:

   ```bash
   pnpm db:seed
   ```

   Không bắt buộc — khi chưa có dòng, cả API lẫn `getString/getBoolean/getNumber` đều trả `defaultValue`. Seed chỉ thêm key còn thiếu, không ghi đè giá trị đã có.

Xong — ô nhập tự xuất hiện trong nhóm Bảo mật; lưu, export, import đều hoạt động. **Không sửa gì ở frontend.**

### 5.1 Thêm nhóm mới

1. Thêm tên nhóm vào `SETTING_GROUPS` (vị trí = thứ tự hiển thị).
2. Thêm `settings.groups.<group>.title` và `.description` vào i18n backend (`vi.ts` / `en.ts`).
3. Khai báo các key với `group: '<group>'`.

### 5.2 Cài đặt bí mật

Thêm `isSecret: true` (vd. API key, mật khẩu). Hệ quả tự động: ô `Input.Password`, `GET /settings` trả `value: null`, để trống khi lưu = giữ nguyên, có nút **Xóa giá trị**, export mặc định loại bỏ. Code backend vẫn đọc giá trị thật bằng `getString(...)`.

### 5.3 Cài đặt công khai cho frontend

`isPublic` chỉ là **nhãn khai báo**; `GET /settings/public` trả object được viết tay trong `SettingsService.getPublic()` với kiểu `PublicSettings`. Để frontend đọc được một key mới khi chưa đăng nhập:

1. Đặt `isPublic: true` trong khai báo (để người đọc biết key này lộ ra ngoài).
2. Thêm trường vào interface `PublicSettings` (`constants/settings.ts`) với kiểu đã ép (`boolean`, `number`…).
3. Thêm trường vào `getPublic()` trong `settings.service.ts`.
4. Frontend user đọc qua hook `usePublicSettings()` (`src/frontends/user/src/lib/usePublicSettings.ts`).

Không bao giờ đưa key `isSecret` vào `getPublic()`. Có thể trả giá trị dẫn xuất thay vì giá trị gốc (như `google_login_enabled` chỉ cho biết đã cấu hình Google hay chưa).

### 5.4 Danh sách lựa chọn, gợi ý nhóm, kiểu mới

- **Lựa chọn cố định**: `type: 'select'` (hoặc `'multiselect'`) + `options: [...]`, nhãn dịch ở `settings.keys.<name>.options.<value>`. Không sửa frontend.
- **Lựa chọn từ DB**: thêm giá trị vào `SettingOptionsSource` (shared) và nhánh nạp trong `SettingsService.loadOptionValues()` (như `'roles'`), rồi khai báo `optionsSource`. Không sửa frontend.
- **Gợi ý cho cả nhóm**: thêm `settings.groups.<group>.hint` vào i18n backend; cần kèm dòng code (URL…) thì khai báo trong `GROUP_HINT_CODE` của `settings.service.ts` (như redirect URI của nhóm `google`, lấy từ `ADMIN_APP_URL` / `USER_APP_URL`). Không sửa frontend.
- **Kiểu dữ liệu mới** (vd. `json`) — trường hợp duy nhất phải sửa frontend: thêm vào `SettingValueType`, thêm nhánh kiểm tra trong `normalizeValue()` (backend) và nhánh ô nhập + chuyển đổi `toFormValue` / `toSettingValue` trong `SettingsGroupForm.tsx`.

### 5.5 Xoá một cài đặt

Xoá khai báo và bản dịch, sửa các chỗ gọi `get*('...')` (TypeScript chỉ ra). Dòng cũ trong DB không còn hiển thị và bị bỏ qua khi import; có thể xoá tay bằng SQL nếu muốn dọn.
