# Thiết kế phân quyền (RBAC)

Tài liệu này mô tả cách hệ thống quyết định một người dùng **được làm gì**: mô hình dữ liệu, nơi định nghĩa quyền, cách backend và frontend kiểm tra quyền, và các bước khi thêm quyền mới.

Liên quan: [Nút Đồng bộ quyền](permission-sync.md) · [Kiến trúc chung](architecture.md)

## 1. Tổng quan

```
User ──(0..1)──► Role ──(n..n)──► Permission
 │                 │                  │
 │ isSuperAdmin    │ isActive          │ key  (định danh cố định, dùng để kiểm tra)
 │ isActive        │ isSystem          │ module / type / method / apiPath / description
```

- Mỗi user có **tối đa 1 role** (`users.roleId`, có thể `null`).
- Role là **tập permission** (bảng nối `role_permissions`).
- `isSuperAdmin = true` → có **mọi quyền**, bỏ qua role.
- Danh sách permission là **nguồn sự thật nằm trong code**; DB chỉ là bản sao để gán cho role và hiển thị ở trang admin.

## 2. Nơi định nghĩa quyền

File: [`src/packages/shared/src/constants/permissions.ts`](../src/packages/shared/src/constants/permissions.ts)

```ts
export const PERMISSION_DEFINITIONS = [
  { key: 'admin.access', module: 'admin', type: 'CLIENT', method: null, apiPath: null },
  { key: 'users.list',   module: 'users', ...api('GET', '/users') },
  { key: 'users.update', module: 'users', ...api('PATCH', '/users/:id') },
  // ...
] as const satisfies readonly PermissionDefinition[];
```

| Trường    | Ý nghĩa |
| --------- | ------- |
| `key`     | Định danh cố định, dạng `<module>.<hành động>`. Là thứ **duy nhất** code dùng để kiểm tra quyền. Không sửa được ở admin. |
| `module`  | Nhóm hiển thị (trang Quyền, drawer gán quyền cho role). |
| `type`    | `SERVER` = quyền gắn với 1 API; `CLIENT` = quyền không gắn 1 API: quyền giao diện (vd. `admin.access`) hoặc **quyền năng lực** mà service backend kiểm tra để ẩn trường / giới hạn phạm vi dữ liệu (vd. `products.viewCost`, `sales.viewAll`, `sales.overridePrice`, `inventory.viewValue`). |
| `method` / `apiPath` | API tương ứng (helper `api()` tự thêm tiền tố `/api/v1`). Chỉ để **mô tả / hiển thị**, xem mục 6. |

Từ mảng này, file export thêm các giá trị dẫn xuất (không cần sửa tay):

- `PermissionKey` — union type của mọi key → gõ sai key ở `@RequirePermission(...)` hoặc `can(...)` là TypeScript báo lỗi.
- `PERMISSION_KEYS` — mảng key, dùng cho zod (`assignPermissionsSchema`) và cho super admin.
- `PERMISSION_MODULES` — key nhóm theo module, giữ thứ tự khai báo (dùng cho UI gán quyền).
- `getPermissionDefinition(key)`.

Role mặc định (`SYSTEM_ROLES`): `Administrator` và `User`, do seed tạo với `isSystem = true` → không đổi tên, không vô hiệu, không xoá được.

## 3. Mô hình dữ liệu

File: [`src/packages/db/src/schema/roles.ts`](../src/packages/db/src/schema/roles.ts)

| Bảng | Cột chính | Ghi chú |
| ---- | --------- | ------- |
| `roles` | `name` (unique), `description`, `isActive`, `isSystem` | Role bị vô hiệu → user thuộc role đó **mất toàn bộ quyền**. |
| `permissions` | `key` (unique), `module`, `type`, `method`, `apiPath`, `description` | `description` là ghi chú do admin tự nhập, đồng bộ **không** ghi đè. |
| `role_permissions` | `(roleId, permissionId)` PK | Cả 2 FK `ON DELETE CASCADE`: xoá role hoặc xoá permission thì dòng gán tự mất. |
| `users` | `roleId`, `isSuperAdmin`, `isActive` | |

## 4. Tính quyền hiệu lực (Principal)

File: [`src/backends/api/src/auth/principal.ts`](../src/backends/api/src/auth/principal.ts) — `PrincipalService.load(userId)`

```
isSuperAdmin?           ──► permissions = toàn bộ PERMISSION_KEYS
role tồn tại & isActive ──► permissions = key của role (JOIN role_permissions → permissions)
                            rồi LỌC chỉ giữ key còn trong PERMISSION_KEYS
còn lại                 ──► permissions = []

can(key) = isSuperAdmin || permissions.includes(key)
```

Điểm quan trọng:

- **Nạp lại từ DB ở mỗi request** (trong `AuthGuard`) → khoá tài khoản, đổi role, đổi quyền của role có hiệu lực ngay, không chờ access token hết hạn.
- Permission còn trong DB nhưng **đã bị xoá khỏi code** sẽ bị lọc bỏ → không còn tác dụng dù vẫn đang gán cho role.
- Danh sách `permissions` này cũng được trả về cho frontend qua thông tin user hiện tại (`user.mapper.ts`) để ẩn/hiện giao diện.

## 5. Kiểm tra quyền ở backend

### 5.1 `AuthGuard` (toàn cục)

File: [`src/backends/api/src/auth/auth.guard.ts`](../src/backends/api/src/auth/auth.guard.ts). Thứ tự kiểm tra cho mỗi request:

1. Route có `@Public()` → cho qua.
2. Không có / sai access token → `401`.
3. Nạp `Principal`; user không tồn tại → `401`; user bị khoá → `401 auth.accountLocked`.
4. Bắt buộc xác minh email mà user chưa xác minh và route không có `@AllowUnverifiedEmail()` → `403 emailVerification.required`.
5. Route có `@RequirePermission(...)` → cần **ít nhất 1** trong các key (super admin luôn qua), thiếu → `403`.
6. Gắn principal vào request (lấy ra bằng `@CurrentPrincipal()`).

Route không có `@RequirePermission` thì **chỉ cần đăng nhập** (vd. các API `/me`, `/account`).

### 5.2 Decorator

File: [`src/backends/api/src/decorators/customize.ts`](../src/backends/api/src/decorators/customize.ts)

```ts
@RequirePermission('users.update')
@Patch(':id')
update(...) {}

// Nhiều key = cần 1 trong các quyền (OR)
// Trang Người dùng cũng cần danh sách role để chọn khi gán
@RequirePermission('roles.list', 'users.list')
@Get()
list(...) {}
```

Có thể đặt ở mức class (`getAllAndOverride` đọc handler trước, rồi tới class).

### 5.3 Kiểm tra trong service

Khi quyền phụ thuộc dữ liệu, kiểm tra thủ công bằng `principal.can(...)` hoặc `principal.user.isSuperAdmin`:

```ts
// settings.controller.ts — chỉ người có quyền sửa mới được export kèm bí mật
this.settingsService.exportAll(includeSecrets && principal.can('settings.update'));
```

Các ràng buộc nghiệp vụ hiện có:

| Ràng buộc | Vị trí |
| --------- | ------ |
| Chỉ super admin được tạo / cấp / thu hồi super admin, và sửa tài khoản super admin khác | `users.service.ts` (`users.cannotModifySuperAdmin`) |
| Không tự bỏ super admin hay tự khoá chính mình | `users.service.ts` (`users.cannotModifySelf`) |
| Role hệ thống không đổi tên / vô hiệu / xoá được | `roles.service.ts` (`roles.systemRole`) |
| Không xoá role đang có user | `roles.service.ts` (`roles.inUse`) |

### 5.4 Quyền vào trang admin (`admin.access`)

`canAccessAdmin(principal)` = `principal.can('admin.access')`. Được kiểm tra khi request có header `x-app: admin` tại:

- đăng nhập mật khẩu / 2FA (`auth.service.ts`), đăng nhập Google (`google.service.ts`) → `403 auth.adminAccessDenied`;
- refresh token (`session.service.ts`) → bị thu quyền thì phiên admin không làm mới được nữa;
- setting `require_2fa_admin` áp dụng cho mọi tài khoản có `admin.access` (`account.service.ts`).

**Cờ "Được vào trang quản trị" của role (`adminAccess`).** Không phải cột riêng trong bảng `roles` mà là cách hiển thị/bật tắt nhanh quyền `admin.access` — vẫn chỉ có một nguồn sự thật nên logic đăng nhập ở trên không đổi.

- `RoleDto.adminAccess` = role có `admin.access` trong `role_permissions` (tính ở `RolesService.hydrate`).
- `POST /roles` và `PATCH /roles/:id` nhận `adminAccess?: boolean` (bỏ trống = không đụng tới). Service gọi `setAdminAccess` thêm/xoá đúng dòng `admin.access` trong cùng transaction với việc tạo/sửa role; khi sao chép role, cờ được áp **sau** bước copy nên giá trị trong form ghi đè quyền của role nguồn.
- Gửi `adminAccess` cần thêm quyền `roles.assignPermissions` (ngoài `roles.create` / `roles.update`), thiếu → `403 roles.adminAccessForbidden` (`roles.controller.ts`). Form admin chỉ gửi trường này khi người dùng có quyền đó và (khi sửa) giá trị thực sự thay đổi, nên sửa tên/mô tả không bị chặn.
- Bật cờ khi `admin.access` chưa được đồng bộ vào DB → `400 roles.adminPermissionMissing`; tắt thì bỏ qua.
- Bỏ tick `admin.access` trong drawer **Phân quyền** cũng tắt cờ (và ngược lại) — hai nơi cùng sửa một dữ liệu. Hiện không chặn tắt cờ trên role hệ thống `Administrator`.

### 5.5 Quyền năng lực trong nghiệp vụ bán hàng

Một số quyền không ứng với API riêng mà quyết định **dữ liệu nào được trả / thao tác nào được phép** trong API đã có. Service kiểm tra bằng `principal.can(...)`, không chỉ ẩn ở giao diện:

| Key                   | Hiệu lực ở backend                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `products.viewCost`   | Thiếu → DTO sản phẩm / đơn bán không có `purchasePrice`, `avgCost`, `unitCost`, `costAmount`, `totalCost`          |
| `sales.viewAll`       | Thiếu → danh sách đơn bán chỉ gồm đơn mình tạo; đơn người khác trả 404; không thanh toán / huỷ được đơn người khác |
| `sales.overridePrice` | Thiếu → dòng đơn có giá khác giá niêm yết bị từ chối 403 `sales.priceOverrideForbidden`                            |
| `inventory.viewValue` | Thiếu → tồn kho, sổ biến động, báo cáo tồn không có giá vốn / giá trị                                              |

Huỷ đơn bán: `@RequirePermission('sales.cancel', 'sales.update')` cho vào API; service chỉ cho huỷ đơn **đã chốt** khi có `sales.cancel` (403 `sales.cancelForbidden`), đơn nháp thì người tạo huỷ được bằng `sales.update`.

### 5.6 Vai trò mặc định Manager / Staff

`pnpm db:seed` (và setup DB test) gọi `ensureBusinessRoles` (`src/packages/db/src/business-roles.ts`): tạo vai trò hệ thống **Manager** và **Staff** nếu chưa có và gán bộ quyền mặc định `DEFAULT_ROLE_PERMISSIONS` (`src/packages/shared/src/constants/permissions.ts`) **chỉ khi vừa tạo** — quyền admin chỉnh sau đó không bị seed ghi đè. Administrator vẫn tự nhận mọi quyền mới. Ma trận đầy đủ: [contracts/permissions.md](../specs/001-sales-inventory-mvp/contracts/permissions.md).

| Vai trò       | Phạm vi                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator | Mọi quyền                                                                                                                                                                                      |
| Manager       | `admin.access`, dashboard bán hàng, toàn bộ danh mục / sản phẩm / nhà cung cấp / nhập hàng / bán hàng / tồn kho / báo cáo (gồm giá vốn, xem mọi đơn, sửa giá, huỷ đơn đã chốt, điều chỉnh tồn) |
| Staff         | Xem danh mục, sản phẩm, tồn, sổ biến động; tạo / sửa nháp / chốt / thanh toán đơn bán của mình. Không vào trang admin, không thấy giá vốn                                                      |

## 6. Key, method và URL: cái nào thật sự được kiểm tra?

Backend **chỉ so khớp theo `key`** khai báo trong `@RequirePermission`. Các cột `method` / `apiPath` trong DB **không** tham gia việc chặn request: chúng là thông tin mô tả để admin biết quyền đó ứng với API nào.

Hệ quả:

- Sửa URL / method của một quyền ở trang Admin → Quyền **không** thay đổi API nào bị chặn; nó chỉ khiến quyền bị đánh dấu "Khác với code" cho tới khi đồng bộ lại.
- Khi đổi route trong controller, nhớ sửa `apiPath` tương ứng trong `PERMISSION_DEFINITIONS` để mô tả còn đúng, rồi đồng bộ.
- `key` là hợp đồng giữa code và dữ liệu gán quyền. **Đổi tên key = xoá quyền cũ + thêm quyền mới**: các role đang có quyền cũ sẽ không tự có quyền mới, phải gán lại.

## 7. Kiểm tra quyền ở frontend

Frontend nhận danh sách `permissions` của user (super admin = mọi key). Helper trong `@base/ui`:

| Helper | Dùng khi | File |
| ------ | -------- | ---- |
| `useAuth().can('x.y')` | Ẩn/hiện nút, bật `enabled` của query | `packages/ui/src/auth/AuthProvider.tsx` |
| `<Can permission="x.y" fallback={...}>` | Bọc một khối giao diện | `packages/ui/src/auth/guards.tsx` |
| `<RequirePermission permission="x.y">` | Bọc cả trang trong router, thiếu quyền hiện trang 403 | `packages/ui/src/auth/guards.tsx` |

`permission` nhận 1 key hoặc mảng key (OR), giống backend.

Ví dụ trong admin:

```tsx
// router.tsx
{ path: 'roles', element: <RequirePermission permission="roles.list"><RolesPage /></RequirePermission> }

// AdminLayout.tsx — ẩn menu
{ key: '/roles', label: t('roles'), hidden: !can('roles.list') }

// PermissionsPage.tsx — nút Đồng bộ cần cả 2 quyền
can('permissions.syncPreview') && can('permissions.sync') && <Button>...</Button>
```

> Kiểm tra ở frontend chỉ để **trải nghiệm**; bảo mật thật nằm ở backend. Mọi API cần bảo vệ phải có `@RequirePermission`.

## 8. Giao diện quản trị

| Trang | Chức năng | Quyền |
| ----- | --------- | ----- |
| Admin → Vai trò | CRUD role; switch **Được vào trang quản trị** trong form (= quyền `admin.access`, xem [§5.4](#54-quyền-vào-trang-admin-adminaccess)) và tag "Admin" trên dòng; **sao chép role** (nút sao chép trên dòng hoặc chế độ "Sao chép từ vai trò khác" khi thêm, cờ admin mặc định theo role nguồn); drawer **Phân quyền** chọn quyền theo module (chọn cả module / chọn tất cả) | `roles.*`, gán quyền: `roles.assignPermissions` |
| Admin → Quyền | Danh sách quyền trong DB, lọc theo module, sửa module / loại / method / URL / mô tả, nhãn "Khác với code" và "Không còn trong code", nút **Đồng bộ** | `permissions.list`, `permissions.update`, `permissions.syncPreview` + `permissions.sync` |
| Admin → Người dùng | Gán role, bật super admin (chỉ super admin) | `users.*` |

Lưu gán quyền (`PUT /roles/:id/permissions`) **thay toàn bộ** quyền của role bằng danh sách gửi lên, trong 1 transaction. Key gửi lên phải nằm trong `PERMISSION_KEYS` (zod kiểm tra); key hợp lệ nhưng **chưa có trong DB** (chưa đồng bộ) sẽ bị bỏ qua — vì vậy phải đồng bộ trước khi gán quyền mới.

Sao chép role dùng chung API tạo role: `POST /roles` kèm `cloneFromRoleId` (uuid, chỉ có ở `createRoleSchema`, không có trong `updateRoleSchema`). Service kiểm tra role nguồn tồn tại (không thì `roles.notFound`), rồi tạo role mới và copy toàn bộ dòng `role_permissions` của role nguồn trong 1 transaction. Role mới luôn có `isSystem = false`. API chỉ yêu cầu `roles.create` (giống GPMPay) — tức người có quyền tạo role có thể nhân bản role nhiều quyền như `Administrator` dù không có `roles.assignPermissions`; nếu cần chặt hơn thì kiểm tra thêm quyền này khi có `cloneFromRoleId`.

## 9. Thêm quyền mới

Ví dụ thêm quyền xoá người dùng `DELETE /api/v1/users/:id`.

1. **Khai báo** trong `src/packages/shared/src/constants/permissions.ts`:

   ```ts
   { key: 'users.delete', module: 'users', ...api('DELETE', '/users/:id') },
   ```

   Quyền giao diện thuần (không gắn API): `{ key: 'reports.view', module: 'reports', type: 'CLIENT', method: null, apiPath: null }`.

2. **Bản dịch** tên quyền trong `src/frontends/admin/src/locales/vi.ts` và `en.ts`, mục `permissions.items`:

   ```ts
   'users.delete': 'Xóa người dùng',
   ```

   Nếu là **module mới**, thêm cả `permissions.modules.<module>`. File `en.ts` có kiểu bắt buộc giống `vi.ts` nên thiếu key là TypeScript báo lỗi.

3. **Bảo vệ API** ở controller:

   ```ts
   @RequirePermission('users.delete')
   @HttpCode(HttpStatus.NO_CONTENT)
   @Delete(':id')
   async remove(@ZodParams(idParamSchema) { id }: IdParam) { ... }
   ```

4. **Giao diện** (nếu cần): `can('users.delete')` để hiện nút.

5. **Đưa vào DB**: bấm **Đồng bộ** ở Admin → Quyền, hoặc chạy

   ```bash
   pnpm db:seed
   ```

   Khác biệt: `db:seed` còn gán **mọi** quyền cho role `Administrator`; nút Đồng bộ thì **không** gán quyền mới cho role nào (xem [permission-sync.md](permission-sync.md#5-sau-khi-đồng-bộ)).

6. **Gán quyền** cho các role cần thiết ở Admin → Vai trò → Phân quyền.

### Xoá hoặc đổi tên quyền

1. Xoá / đổi `key` trong `PERMISSION_DEFINITIONS`, cập nhật các chỗ `@RequirePermission` và `can(...)` (TypeScript sẽ chỉ ra), xoá bản dịch cũ.
2. Quyền cũ lập tức **mất tác dụng** (bị lọc khi tính principal) nhưng vẫn nằm trong DB với nhãn "Không còn trong code".
3. Dọn DB: Đồng bộ → tick "Xóa các quyền không còn trong code", hoặc `pnpm --filter @base/db seed --prune`.
4. Nếu là đổi tên: gán quyền mới cho các role từng có quyền cũ (danh sách role được hiển thị trong màn hình Đồng bộ trước khi xoá).
