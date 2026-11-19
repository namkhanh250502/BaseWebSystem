# Nút Đồng bộ quyền

Nút **Đồng bộ** ở trang **Admin → Quyền** đưa bảng `permissions` trong DB về khớp với danh sách quyền khai báo trong code (`PERMISSION_DEFINITIONS`). Tài liệu này mô tả nó so sánh gì, áp dụng gì và những điều cần lưu ý.

Liên quan: [Thiết kế phân quyền](permissions.md)

## 1. Vì sao cần đồng bộ

Quyền được **định nghĩa trong code** (`src/packages/shared/src/constants/permissions.ts`) nhưng việc **gán quyền cho role** lại cần dòng trong bảng `permissions` (bảng nối `role_permissions` tham chiếu tới `permissions.id`). Mỗi khi code thêm / sửa / xoá quyền, DB phải được cập nhật theo. Có 2 cách làm cùng một việc, dùng chung một hàm:

| Cách | Gọi | Khác biệt |
| ---- | --- | --------- |
| Nút **Đồng bộ** (admin) | `POST /api/v1/permissions/sync` | Xem trước được; chọn có xoá quyền thừa hay không. |
| `pnpm db:seed` (CLI) | `applyPermissionSync(db, { removeStale })` | Thêm `--prune` để xoá quyền thừa; **đồng thời gán mọi quyền cho role Administrator**, tạo setting mặc định, tạo super admin. |

Logic nằm ở [`src/packages/db/src/permissions-sync.ts`](../src/packages/db/src/permissions-sync.ts) để seed (không có NestJS) và API dùng chung.

## 2. Luồng hoạt động

```
PermissionsPage                      API (NestJS)                         @base/db
──────────────                       ────────────                         ────────
[Đồng bộ] (cần permissions.syncPreview + permissions.sync)
   │ mở SyncPermissionsModal
   ├─ GET /permissions/sync ───────► PermissionsService.previewSync() ──► previewPermissionSync(db)
   │                                  @RequirePermission('permissions.syncPreview')   (chỉ đọc)
   │ ◄── PermissionSyncPreview ─────────────────────────────────────────────────┘
   │ hiển thị: thống kê, bảng Thêm mới / Khác code / Thừa
   │ [Kiểm tra lại] → gọi lại GET
   │ tick "Xóa các quyền không còn trong code" (removeStale)
   │ [Áp dụng] (bị khoá nếu không có gì để làm)
   │   └─ removeStale && có quyền thừa → hộp xác nhận (nút đỏ)
   ├─ POST /permissions/sync ──────► PermissionsService.sync(removeStale) ─► applyPermissionSync(db, { removeStale })
   │   body { removeStale }           @RequirePermission('permissions.sync')          (transaction)
   │ ◄── { added, updated, removed } ────────────────────────────────────────────┘
   │ toast "Đồng bộ xong: thêm X, cập nhật Y, xóa Z"
   └─ invalidate query ['permissions'] và ['roles'] → bảng quyền và trang Vai trò tải lại
```

Frontend: [`SyncPermissionsModal.tsx`](../src/frontends/admin/src/features/permissions/SyncPermissionsModal.tsx), nút mở ở [`PermissionsPage.tsx`](../src/frontends/admin/src/features/permissions/PermissionsPage.tsx).
Backend: [`permissions.controller.ts`](../src/backends/api/src/permissions/permissions.controller.ts) → [`permissions.service.ts`](../src/backends/api/src/permissions/permissions.service.ts).

## 3. Xem trước — `previewPermissionSync`

Đọc toàn bộ bảng `permissions`, so với `PERMISSION_DEFINITIONS` theo **`key`**, phân thành 3 loại:

| Loại | Điều kiện | Trả về |
| ---- | --------- | ------ |
| **Thêm mới** (`toAdd`) | Key có trong code, chưa có trong DB | Định nghĩa đầy đủ (key, module, method, URL) |
| **Khác code** (`changes`) | Key có ở cả 2 nơi nhưng 1 trong 4 trường `module`, `type`, `method`, `apiPath` khác nhau | **Mỗi trường khác là 1 dòng**: `{ key, field, from (DB), to (code) }` |
| **Thừa** (`toRemove`) | Key có trong DB, không còn trong code | `{ key, module, roles }` — `roles` là tên các role đang được gán quyền này |

Kèm số liệu: `defined` (số quyền trong code) và `unchanged` (= `defined` − số thêm mới − số **key** khác code).

Không so sánh `description` — đó là ghi chú admin tự nhập, không có trong code.

Giao diện hiển thị 5 ô thống kê (Trong code · Không đổi · Thêm mới · Khác code · Thừa) và một bảng cho mỗi loại có dữ liệu; không có khác biệt nào thì hiện "Cơ sở dữ liệu đã khớp với mã nguồn". Lưu ý ô **Khác code** đếm số **trường** khác, nên một quyền sai cả method lẫn URL được tính là 2.

Nguồn gốc của "Khác code" thường là admin đã sửa module / loại / method / URL ở nút **Sửa** trên trang Quyền, hoặc developer đổi route / module trong code. Trên bảng quyền, những dòng này mang nhãn **Khác với code** (cờ `modified` do `PermissionsService.list()` tính bằng cùng phép so sánh), quyền thừa mang nhãn **Không còn trong code** (`defined = false`).

## 4. Áp dụng — `applyPermissionSync`

1. **Tính lại bản xem trước ở server** (không dùng dữ liệu client gửi lên — client chỉ gửi `removeStale`).
2. Mở **transaction**:
   - **Thêm mới**: insert các quyền `toAdd` với `module`, `type`, `method`, `apiPath` theo code; `ON CONFLICT (key) DO NOTHING` để an toàn khi 2 người bấm cùng lúc.
   - **Khác code**: với mỗi key khác, `UPDATE` cả 4 trường về đúng như code. `description` **được giữ nguyên**.
   - **Thừa**: chỉ khi `removeStale = true` thì `DELETE` các quyền đó. FK `ON DELETE CASCADE` tự gỡ chúng khỏi mọi role.
3. Trả `{ added, updated (số key), removed }`.

Đồng bộ **chỉ thêm / chỉnh / xoá quyền**: không sửa role, không đụng tới `role_permissions` (ngoài việc cascade khi xoá quyền thừa).

## 5. Sau khi đồng bộ

- **Quyền mới chưa thuộc role nào** (kể cả `Administrator`). Người có quyền vẫn phải vào **Admin → Vai trò → Phân quyền** để gán. Super admin không bị ảnh hưởng vì luôn có mọi quyền. Muốn `Administrator` tự có đủ quyền mới thì chạy `pnpm db:seed`.
- **Quyền thừa không xoá vẫn vô hại**: khi tính quyền của user, key không còn trong code bị lọc bỏ (`PrincipalService.load`), nên giữ lại trong DB chỉ để tham khảo / tránh mất dữ liệu gán quyền.
- **Đổi tên key** hiển thị trong màn hình đồng bộ thành 1 quyền **Thêm mới** + 1 quyền **Thừa** kèm danh sách role đang dùng. Ghi lại các role đó, đồng bộ, rồi gán quyền mới cho chúng.
- Các thay đổi có hiệu lực ngay ở request tiếp theo, vì quyền được nạp lại từ DB mỗi request.

## 6. Quyền liên quan

| Key | API | Dùng cho |
| --- | --- | -------- |
| `permissions.list` | `GET /permissions` | Vào trang Quyền |
| `permissions.update` | `PATCH /permissions/:id` | Nút Sửa (module / loại / method / URL / mô tả) |
| `permissions.syncPreview` | `GET /permissions/sync` | Xem trước |
| `permissions.sync` | `POST /permissions/sync` | Áp dụng |

Nút **Đồng bộ** chỉ hiện khi user có **cả** `permissions.syncPreview` và `permissions.sync`.

## 7. Lưu ý vận hành

- **Triển khai bản mới có thêm quyền**: chạy migrate rồi `pnpm db:seed` trong quy trình deploy (idempotent, chạy nhiều lần không sao), hoặc đăng nhập admin bấm Đồng bộ. Trước khi đồng bộ, quyền mới chưa gán được cho role (API gán quyền bỏ qua key chưa có trong DB), nhưng super admin vẫn dùng được.
- **Bản xem trước có thể cũ**: trang xem trước được lấy lúc mở modal; nếu trong lúc đó có người sửa quyền hoặc deploy code mới, kết quả áp dụng (tính lại ở server) có thể khác bản đang xem. Bấm **Kiểm tra lại** trước khi áp dụng nếu nghi ngờ.
- **Nhiều instance chạy các phiên bản code khác nhau** (đang rolling deploy): instance cũ sẽ coi quyền mới là "thừa". Không tick xoá quyền thừa cho tới khi mọi instance đã lên bản mới.
- **Sửa URL / method ở trang admin không thay đổi việc chặn API** — backend chỉ kiểm tra theo key (xem [permissions.md § 6](permissions.md#6-key-method-và-url-cái-nào-thật-sự-được-kiểm-tra)). Đồng bộ sẽ đưa các trường đó về như code.
