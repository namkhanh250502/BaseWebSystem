# Role / Permission và cách bảo vệ một route

Tài liệu đầy đủ: `docs/permissions.md`, `docs/permission-sync.md`. File này là checklist khi làm việc.

## Mô hình

```
User ──(0..1)──► Role ──(n..n)──► Permission
 isSuperAdmin      isActive          key (cố định, code dùng để kiểm tra)
 isActive          isSystem          module / type / method / apiPath / description
```

- Mỗi user **tối đa 1 role** (`users.roleId`, có thể `null`). Role = tập permission (bảng `role_permissions`, FK cascade).
- `isSuperAdmin` → có **mọi quyền**, bỏ qua role. Chỉ super admin được cấp/sửa super admin.
- Role bị vô hiệu (`isActive = false`) → user thuộc role mất toàn bộ quyền.
- Role hệ thống (`SYSTEM_ROLES`: `Administrator`, `User`, `isSystem = true`) không đổi tên / vô hiệu / xoá được.
- **Nguồn sự thật là code**: `PERMISSION_DEFINITIONS` trong `src/packages/shared/src/constants/permissions.ts`. DB chỉ là bản sao để gán cho role (đồng bộ bằng `pnpm db:seed` hoặc nút **Đồng bộ** ở Admin → Quyền).

```ts
const api = (method: HttpMethod, path: string) =>
  ({ type: 'SERVER', method, apiPath: `/api/v1${path}` }) as const;

export const PERMISSION_DEFINITIONS = [
  { key: 'admin.access', module: 'admin', type: 'CLIENT', method: null, apiPath: null },
  { key: 'users.list', module: 'users', ...api('GET', '/users') },
  { key: 'users.update', module: 'users', ...api('PATCH', '/users/:id') },
  // ...
] as const satisfies readonly PermissionDefinition[];
```

- `key` dạng `<module>.<hànhĐộng>` (camelCase sau dấu chấm, vd. `users.resetPassword`). Sinh union `PermissionKey` → gõ sai key ở `@RequirePermission` / `can()` là lỗi compile.
- `type`: `SERVER` = gắn 1 API (dùng helper `api()`); `CLIENT` = quyền giao diện thuần (vd. `admin.access`).
- `method` / `apiPath` **chỉ để mô tả/hiển thị**, backend **không** dùng chúng để chặn request.
- Dẫn xuất tự động: `PERMISSION_KEYS`, `PERMISSION_MODULES`, `getPermissionDefinition()`.

## Request đi qua những bước kiểm tra nào

`AuthGuard` (`src/backends/api/src/auth/auth.guard.ts`) đăng ký **toàn cục** (`APP_GUARD`), nên mọi route mặc định đã bị chặn nếu chưa đăng nhập. Thứ tự:

1. Route/class có `@Public()` → cho qua (không có principal).
2. Không có / sai access token (`Authorization: Bearer`) → `401`.
3. `PrincipalService.load(userId)` nạp user + role + quyền **từ DB ở mỗi request** (đổi role/quyền/khoá tài khoản có hiệu lực ngay). Không có user → `401`; `isActive = false` → `401 auth.accountLocked`.
4. Hệ thống bắt buộc xác minh email, user chưa xác minh, route không có `@AllowUnverifiedEmail()` → `403 emailVerification.required`.
5. Route có `@RequirePermission(...keys)` → cần **ít nhất 1** key (OR); super admin luôn qua. Thiếu → `403 errors.forbidden`.
6. Gắn principal vào request → lấy bằng `@CurrentPrincipal()`.

Metadata đọc bằng `reflector.getAllAndOverride` (handler trước, rồi class) → decorator ở handler **ghi đè** decorator ở class, không cộng dồn.

Tính quyền hiệu lực (`src/backends/api/src/auth/principal.ts`):

```
isSuperAdmin            → permissions = toàn bộ PERMISSION_KEYS
role tồn tại & isActive → key của role (JOIN role_permissions → permissions), LỌC chỉ giữ key còn trong PERMISSION_KEYS
còn lại                 → []
can(key) = isSuperAdmin || permissions.includes(key)
```

Key đã xoá khỏi code nhưng còn trong DB bị lọc bỏ → mất tác dụng ngay.

## Decorator (`src/backends/api/src/decorators/customize.ts`)

| Decorator | Ý nghĩa |
| --------- | ------- |
| `@Public()` | Không cần đăng nhập. Không dùng `@CurrentPrincipal()` trong route public. |
| `@RequirePermission('a.b', 'c.d')` | Cần 1 trong các quyền (OR). Đặt ở handler (hoặc class). |
| *(không có gì)* | **Chỉ cần đăng nhập** (vd. `/me`, `/account`). |
| `@AllowUnverifiedEmail()` | Vẫn gọi được khi user chưa xác minh email (chỉ cho API tài khoản). |
| `@CurrentPrincipal()` | `Principal { user, role, permissions, can(), emailVerificationRequired }`. |
| `@ReqCtx()` | `RequestContext` (header, `app` từ `x-app`, `locale` từ `x-lang`). |
| `@ZodBody / @ZodQuery / @ZodParams(schema)` | Validate bằng zod của `@base/shared`. |

Quyền vào trang admin: `canAccessAdmin(principal)` = `principal.can('admin.access')`, được kiểm tra ở đăng nhập/2FA/Google/refresh khi `x-app: admin` — không cần thêm vào từng route admin.

Cờ role `adminAccess` (switch "Được vào trang quản trị", tag "Admin") **không phải cột DB**: `RoleDto.adminAccess` suy ra từ quyền `admin.access`; `POST/PATCH /roles` nhận `adminAccess?: boolean` → `RolesService.setAdminAccess` thêm/xoá đúng quyền đó, và controller đòi thêm `roles.assignPermissions` (`roles.adminAccessForbidden`). Đừng thêm cột `canAccessAdmin` riêng — sẽ thành hai nguồn sự thật.

## Mẫu controller

```ts
import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  createProductSchema,
  idParamSchema,
  listProductsQuerySchema,
  updateProductSchema,
  type IdParam,
} from '@base/shared';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { paginated } from '../core/transform.interceptor';
import {
  CurrentPrincipal,
  RequirePermission,
  ZodBody,
  ZodParams,
  ZodQuery,
} from '../decorators/customize';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermission('products.list')
  @Get()
  async list(@ZodQuery(listProductsQuerySchema) query: z.infer<typeof listProductsQuerySchema>) {
    return paginated(await this.productsService.list(query));
  }

  @RequirePermission('products.create')
  @Post()
  create(
    @ZodBody(createProductSchema) input: z.infer<typeof createProductSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.productsService.create(input, principal.user.id);
  }

  @RequirePermission('products.update')
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updateProductSchema) input: z.infer<typeof updateProductSchema>,
  ) {
    return this.productsService.update(id, input);
  }

  @RequirePermission('products.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@ZodParams(idParamSchema) { id }: IdParam) {
    await this.productsService.remove(id);
  }
}
```

Quy ước: decorator quyền đứng **trên cùng**, rồi `@HttpCode` (nếu có), rồi decorator method HTTP. Mỗi route cần bảo vệ phải có `@RequirePermission` — kiểm tra ở frontend chỉ là trải nghiệm.

**Quyền phụ thuộc dữ liệu** → kiểm tra thêm trong controller/service bằng `principal.can(...)` hoặc `principal.user.isSuperAdmin`, ném `forbidden('<module>.<lý do>')` (thêm key vào i18n vi + en):

```ts
// settings.controller.ts — chỉ người có quyền sửa mới export kèm bí mật
return this.settingsService.exportAll(includeSecrets && principal.can('settings.update'));
```

## Checklist: thêm route có phân quyền

Ví dụ `DELETE /api/v1/users/:id`.

1. **Khai báo** trong `PERMISSION_DEFINITIONS` (đặt cạnh các quyền cùng module):

   ```ts
   { key: 'users.delete', module: 'users', ...api('DELETE', '/users/:id') },
   ```

   `apiPath` phải khớp route thật (không gồm `/api/v1`, helper tự thêm; tham số dạng `:id`).

2. **Dịch tên quyền** ở `src/frontends/admin/src/locales/vi.ts` **và** `en.ts`, mục `permissions.items`:

   ```ts
   'users.delete': 'Xóa người dùng',
   ```

   Module mới thì thêm cả `permissions.modules.<module>`. (`en.ts` cùng kiểu với `vi.ts` → thiếu là lỗi type.)

3. **Bảo vệ API**: `@RequirePermission('users.delete')` trên handler (mẫu ở trên). Module mới → đăng ký trong `app.module.ts`.

4. **Frontend** (nếu có UI):
   - Nút/khối: `const { can } = useAuth();` → `can('users.delete') && <Button .../>` hoặc `<Can permission="users.delete">`.
   - Trang: bọc route trong `router.tsx` bằng `<RequirePermission permission="users.list">`, menu trong `AdminLayout.tsx` dùng `hidden: !can('users.list')`.
   - `permission` nhận 1 key hoặc mảng key (OR), giống backend.

5. **Đưa vào DB**: `pnpm db:seed` (thêm quyền mới **và** gán mọi quyền cho `Administrator`) hoặc nút **Đồng bộ** ở Admin → Quyền (không tự gán cho role nào). Sau đó gán quyền cho role cần thiết ở Admin → Vai trò → Phân quyền.

## Đổi / xoá quyền

- Đổi route trong controller → sửa `apiPath`/`method` tương ứng trong `PERMISSION_DEFINITIONS`.
- **Đổi tên `key` = xoá quyền cũ + thêm quyền mới**: role đang có quyền cũ không tự có quyền mới. Cập nhật mọi `@RequirePermission` / `can()` (TypeScript chỉ ra), xoá bản dịch cũ, đồng bộ, gán lại cho role.
- Dọn quyền thừa trong DB: Đồng bộ → tick "Xóa các quyền không còn trong code", hoặc `pnpm db:seed -- --prune`.

Xong việc: chạy `pnpm lint` và `pnpm typecheck` (xem SKILL.md § 4).
