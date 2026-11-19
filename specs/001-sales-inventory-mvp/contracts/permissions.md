# Permission Contract — 001 Quản lý bán hàng & tồn kho

Bổ sung vào `PERMISSION_DEFINITIONS` (`src/packages/shared/src/constants/permissions.ts`); quyền hiện có giữ nguyên. Tên hiển thị dịch ở `src/frontends/admin/src/locales/{vi,en}.ts` → `permissions.modules.<module>`, `permissions.items.<key>`.

## Danh sách quyền mới

| Key | Module | Loại | API |
| --- | --- | --- | --- |
| `categories.list` | categories | SERVER | GET `/categories` (dùng cho cả GET `/:id`) |
| `categories.create` | categories | SERVER | POST `/categories` |
| `categories.update` | categories | SERVER | PATCH `/categories/:id` |
| `categories.delete` | categories | SERVER | DELETE `/categories/:id` |
| `products.list` | products | SERVER | GET `/products` (+ `/:id`) |
| `products.create` | products | SERVER | POST `/products` |
| `products.update` | products | SERVER | PATCH `/products/:id` (+ mọi API ảnh) |
| `products.delete` | products | SERVER | DELETE `/products/:id` |
| `products.viewCost` | products | CLIENT* | — xem giá nhập, giá vốn, lợi nhuận dòng |
| `suppliers.list` | suppliers | SERVER | GET `/suppliers` (+ `/:id`) |
| `suppliers.create` | suppliers | SERVER | POST `/suppliers` |
| `suppliers.update` | suppliers | SERVER | PATCH `/suppliers/:id` |
| `suppliers.delete` | suppliers | SERVER | DELETE `/suppliers/:id` |
| `purchases.list` | purchases | SERVER | GET `/purchases` (+ `/:id`) |
| `purchases.create` | purchases | SERVER | POST `/purchases` |
| `purchases.update` | purchases | SERVER | PATCH `/purchases/:id` |
| `purchases.confirm` | purchases | SERVER | POST `/purchases/:id/confirm` |
| `purchases.cancel` | purchases | SERVER | POST `/purchases/:id/cancel` |
| `sales.list` | sales | SERVER | GET `/sales-orders` (+ `/:id`) |
| `sales.create` | sales | SERVER | POST `/sales-orders` |
| `sales.update` | sales | SERVER | PATCH `/sales-orders/:id` |
| `sales.confirm` | sales | SERVER | POST `/sales-orders/:id/confirm` |
| `sales.pay` | sales | SERVER | POST `/sales-orders/:id/pay` |
| `sales.cancel` | sales | SERVER | POST `/sales-orders/:id/cancel` |
| `sales.viewAll` | sales | CLIENT* | — xem đơn của mọi người |
| `sales.overridePrice` | sales | CLIENT* | — bán khác giá niêm yết |
| `inventory.list` | inventory | SERVER | GET `/inventory` |
| `inventory.movements` | inventory | SERVER | GET `/inventory/movements` |
| `inventory.adjustments.list` | inventory | SERVER | GET `/inventory/adjustments` (+ `/:id`) |
| `inventory.adjust` | inventory | SERVER | POST `/inventory/adjustments` |
| `inventory.viewValue` | inventory | CLIENT* | — xem giá vốn/giá trị tồn |
| `dashboard.salesSummary` | dashboard | SERVER | GET `/dashboard/sales-summary` |
| `reports.sales` | reports | SERVER | GET `/reports/sales/*` |
| `reports.purchases` | reports | SERVER | GET `/reports/purchases` |
| `reports.inventory` | reports | SERVER | GET `/reports/inventory`, `/reports/inventory-movements` |
| `reports.profit` | reports | SERVER | GET `/reports/profit` |

\* `CLIENT` = quyền năng lực không gắn 1 API; **vẫn được backend kiểm tra** trong service (lọc trường / phạm vi dữ liệu) — research R10. Với route có nhiều API con (vd. `/reports/sales/*`), mỗi handler dùng cùng key; trường `apiPath` ghi route chính.

## Vai trò mặc định (seed tạo nếu chưa có — research R9)

| Key | Administrator | Manager | Staff |
| --- | :-: | :-: | :-: |
| `admin.access` (có sẵn) | ✓ | ✓ | |
| `dashboard.userGrowth` (có sẵn) | ✓ | | |
| users / roles / permissions / settings / notifications (có sẵn) | ✓ | | |
| `categories.list`, `products.list` | ✓ | ✓ | ✓ |
| `categories.create/update/delete`, `products.create/update/delete` | ✓ | ✓ | |
| `products.viewCost` | ✓ | ✓ | |
| `suppliers.*` | ✓ | ✓ | |
| `purchases.*` | ✓ | ✓ | |
| `sales.list`, `sales.create`, `sales.update`, `sales.confirm`, `sales.pay` | ✓ | ✓ | ✓ |
| `sales.cancel`, `sales.viewAll`, `sales.overridePrice` | ✓ | ✓ | |
| `inventory.list`, `inventory.movements` | ✓ | ✓ | ✓ |
| `inventory.adjustments.list`, `inventory.adjust`, `inventory.viewValue` | ✓ | ✓ | |
| `dashboard.salesSummary`, `reports.*` | ✓ | ✓ | |

Ghi chú:
- Administrator có mọi quyền (logic seed hiện có tự gán quyền mới).
- Staff không có `admin.access` → chỉ dùng app user; Manager dùng được cả hai app.
- Staff huỷ được đơn **nháp của mình** qua `sales.update`; huỷ đơn đã chốt cần `sales.cancel`.
- Bộ quyền mặc định khai báo ở `DEFAULT_ROLE_PERMISSIONS` (`@base/shared`) và **chỉ áp khi seed tạo vai trò lần đầu**.
