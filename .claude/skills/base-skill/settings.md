# Cài đặt hệ thống (Settings): thêm key và cách giao diện được sinh ra

Tài liệu đầy đủ: `docs/settings.md`. File này là checklist khi làm việc.

## Nguyên tắc

- **Khai báo trong code, giá trị trong DB.** Danh sách key/nhóm/kiểu/mặc định nằm ở `src/packages/shared/src/constants/settings.ts`; bảng `settings` chỉ lưu `name → value` (luôn là chuỗi, `''` = chưa cấu hình).
- **Không có key tự do.** API từ chối key lạ (`400 settings.unknownKey`), import bỏ qua key lạ.
- **Backend mô tả, frontend chỉ vẽ.** `GET /settings` trả nhóm → key kèm nhãn/mô tả đã dịch, kiểu, lựa chọn, placeholder, giá trị. Frontend admin không chứa tên key, tên nhóm hay bản dịch key nào. **Thêm key = sửa shared + i18n backend, không sửa frontend.**

## Luồng dữ liệu

```
SETTING_DEFINITIONS (shared)      i18n backend (vi.ts / en.ts)       bảng settings
  name, group, type,                settings.groups.<g>.title/...      name / value
  defaultValue, options,            settings.keys.<k>.label/...          │
  optionsSource, isSecret,              │                                │
  isPublic, example                     │                                │
         └──────────────┬───────────────┴────────────────────────────────┘
                        ▼
     SettingsService.list(locale)  ──  GET /settings (x-lang)  ──►  SettingsPage.tsx
     ghép khai báo + bản dịch + options + giá trị;                   └─ mỗi nhóm: SettingsSection
     key bí mật trả value = null                                         └─ SettingsGroupForm.tsx
                                                                            renderInput(item) theo type
     SettingsService.update()  ◄──  PUT /settings { values }  ─────── chỉ gửi key thay đổi
     normalizeValue() kiểm tra & chuẩn hoá theo type/options
```

- Backend: `src/backends/api/src/settings/settings.service.ts` (`list`, `update`, `normalizeValue`, `loadOptionValues`, `GROUP_HINT_CODE`, `getPublic`), `settings.controller.ts`.
- DTO: `SettingGroupDto`, `SettingItemDto` trong `src/packages/shared/src/schemas/setting.ts`.
- Frontend: `src/frontends/admin/src/features/settings/` — `SettingsPage.tsx` (lặp nhóm server trả, query key có ngôn ngữ), `SettingsGroupForm.tsx` (sinh ô nhập), `ImportSettingsModal.tsx`.
- Thứ tự nhóm = thứ tự trong `SETTING_GROUPS`; thứ tự key trong nhóm = thứ tự khai báo trong `SETTING_DEFINITIONS`.

## `type` → ô nhập (do `SettingsGroupForm.renderInput` quyết định)

| Khai báo | Ô nhập antd | Form ↔ chuỗi DB | Backend kiểm tra |
| -------- | ----------- | ---------------- | ---------------- |
| `isSecret: true` (mọi type) | `Input.Password`, luôn bắt đầu rỗng; để trống = giữ nguyên; có nút **Xóa giá trị** | chuỗi | theo `type` |
| `boolean` | `Switch` | `true/false` ↔ `'true'/'false'` | chỉ `true`/`false` |
| `number` | `InputNumber` | số ↔ chuỗi số, rỗng ↔ `null` | số hữu hạn, lưu `String(Number(v))` |
| `text` | `Input.TextArea` 3 dòng | giữ nguyên | — |
| `select` | `Select` 1 giá trị | giá trị ↔ chuỗi | phải thuộc lựa chọn |
| `multiselect` | `Select mode="multiple"` | mảng ↔ `'a,b,c'` | mọi phần tử thuộc lựa chọn, bỏ trùng, lưu theo thứ tự lựa chọn |
| `string` / `email` / `url` | `Input` (placeholder = `example`) | giữ nguyên | `email`/`url` kiểm tra định dạng |

Mỗi ô có nhãn (`label`), key gốc dạng `code`, tag **Bí mật** / **Đã cấu hình**, mô tả (`description`). Không có quyền `settings.update` → form chỉ đọc. Giá trị rỗng luôn hợp lệ.

## Checklist: thêm một key

Ví dụ: `max_login_attempts`, kiểu số, nhóm `security`.

1. **Khai báo** — `src/packages/shared/src/constants/settings.ts`, đặt đúng vị trí muốn hiển thị trong nhóm:

   ```ts
   { name: 'max_login_attempts', group: 'security', type: 'number', defaultValue: '5' },
   ```

   | Trường | Ghi chú |
   | ------ | ------- |
   | `name` | `snake_case`, duy nhất. Sinh type `SettingName`. |
   | `group` | Phải thuộc `SETTING_GROUPS`. |
   | `type` | `string` · `text` · `number` · `boolean` · `email` · `url` · `select` · `multiselect`. |
   | `defaultValue` | **Luôn là chuỗi** (`'true'`, `'587'`, `''`). |
   | `options` | `select`/`multiselect`: giá trị cố định. |
   | `optionsSource` | `select`/`multiselect`: lấy lựa chọn từ DB (hiện có `'roles'`). |
   | `isSecret` | Không bao giờ trả giá trị về client, export mặc định loại bỏ. |
   | `isPublic` | Nhãn cho biết key lộ ra `GET /settings/public` (xem bước 5). |
   | `example` | Placeholder của ô nhập. |

2. **Dịch** — `src/backends/api/src/i18n/vi.ts` **và** `en.ts`, mục `settings.keys`:

   ```ts
   max_login_attempts: {
     label: 'Số lần đăng nhập sai tối đa',
     description: 'Vượt quá thì tạm khoá đăng nhập.',
   },
   ```

   - Luôn có cả `label` và `description` (`''` nếu không cần). Thiếu bản dịch thì trang vẫn hiện nhưng nhãn = tên key — coi là lỗi.
   - `select`/`multiselect` thêm `options: { <value>: '<nhãn>' }`.
   - `en.ts` có kiểu bắt buộc giống `vi.ts` → thiếu key là `pnpm typecheck` báo lỗi.

3. **Dùng giá trị** ở backend — luôn qua `SettingsService` (cache 30 giây, chưa có trong DB thì trả `defaultValue`):

   ```ts
   constructor(private readonly settings: SettingsService) {}
   const max = await this.settings.getNumber('max_login_attempts');
   ```

4. **(Tuỳ chọn)** `pnpm db:seed` để tạo dòng mặc định (chỉ thêm key thiếu, không ghi đè).

5. **Chỉ khi frontend cần đọc lúc chưa đăng nhập** (`isPublic`):
   1. `isPublic: true` trong khai báo.
   2. Thêm trường (đã ép kiểu) vào interface `PublicSettings` cùng file.
   3. Thêm trường vào `SettingsService.getPublic()`.
   4. Frontend user đọc qua `usePublicSettings()` (`src/frontends/user/src/lib/usePublicSettings.ts`).

   Không bao giờ đưa key `isSecret` vào `getPublic()`; có thể trả giá trị dẫn xuất (như `google_login_enabled`).

**Không sửa** `SettingsPage.tsx` / `SettingsGroupForm.tsx` / locale admin cho key mới — ô nhập tự xuất hiện; lưu, export, import tự hoạt động.

## Các trường hợp khác

- **Nhóm mới**: thêm vào `SETTING_GROUPS` (vị trí = thứ tự hiển thị) + `settings.groups.<group>.title` / `.description` trong i18n backend (vi + en).
- **Gợi ý đầu nhóm**: `settings.groups.<group>.hint`; cần dòng code (URL…) thì thêm hàm vào `GROUP_HINT_CODE` trong `settings.service.ts`.
- **Lựa chọn từ DB mới**: thêm giá trị vào `SettingOptionsSource` (shared) + nhánh nạp trong `SettingsService.loadOptionValues()`, rồi khai báo `optionsSource`.
- **Kiểu dữ liệu mới** (vd. `json`) — trường hợp duy nhất phải sửa frontend: thêm vào `SettingValueType`, nhánh kiểm tra trong `normalizeValue()` (backend), nhánh ô nhập trong `renderInput` và chuyển đổi `toFormValue` / `toSettingValue` trong `SettingsGroupForm.tsx`.
- **Xoá key**: xoá khai báo + bản dịch, sửa các chỗ `get*('...')` (TypeScript chỉ ra). Dòng cũ trong DB bị bỏ qua.

## Quyền liên quan

`settings.list` (xem), `settings.update` (lưu; cũng là điều kiện export kèm bí mật), `settings.export`, `settings.import`.

Xong việc: chạy `pnpm lint` và `pnpm typecheck` (xem SKILL.md § 4).
