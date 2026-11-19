# REST API Contract — 001 Quản lý bán hàng & tồn kho

Tất cả route có tiền tố `/api/v1`, cần đăng nhập (Bearer access token) trừ khi ghi khác; không route nào `@Public`. Response theo chuẩn hiện có:

```jsonc
// thành công
{ "data": <T>, "error": null, "meta": { "page": 1, "pageSize": 20, "total": 135 } } // meta chỉ có ở danh sách
// lỗi
{ "data": null, "error": { "code": "CONFLICT", "key": "sales.insufficientStock", "message": "…đã dịch…",
  "params": { … }, "details": [ … ] } }   // params: mới thêm (research R8)
```

Lỗi chung cho mọi route: `401 errors.unauthorized` (chưa đăng nhập), `403 errors.forbidden` (thiếu quyền), `422 errors.validation` (+`details` theo trường), `404 <module>.notFound`. Tiền và số lượng là **chuỗi thập phân**. Ngày chứng từ `YYYY-MM-DD`; thời điểm ISO 8601. Schema zod nằm ở `src/packages/shared/src/schemas/{category,product,supplier,purchase,sales,inventory,report}.ts`; Swagger sinh từ chính các schema này tại `/api/docs`.

Query danh sách chung (`paginationQuerySchema`): `page` (≥1, mặc định 1), `pageSize` (1–100, mặc định 20), `search?`, `sortBy?`, `sortOrder` (`asc|desc`).

## Danh mục — `categories/`

| Method | URL | Quyền | Request | Response | Lỗi riêng |
| --- | --- | --- | --- | --- | --- |
| GET | `/categories` | `categories.list` | query: `search`, `status`, `sortBy∈{name,createdAt}` | `CategoryDto[]` + meta | |
| GET | `/categories/:id` | `categories.list` | | `CategoryDto` | 404 |
| POST | `/categories` | `categories.create` | `{ name(1–150), description?(≤2000), status? }` | 201 `CategoryDto` | 409 `categories.nameExists` |
| PATCH | `/categories/:id` | `categories.update` | partial của create | `CategoryDto` | 409 `categories.nameExists` |
| DELETE | `/categories/:id` | `categories.delete` | | 204 | 409 `categories.inUse` |

`CategoryDto = { id, name, description, status, productCount, createdAt, updatedAt }`

## Sản phẩm — `products/`

| Method | URL | Quyền | Request | Response | Lỗi riêng |
| --- | --- | --- | --- | --- | --- |
| GET | `/products` | `products.list` | query: `search` (tên/SKU), `categoryId`, `status`, `stockState∈{IN_STOCK,LOW,OUT}`, `sortBy∈{name,sku,sellingPrice,stock,createdAt}` | `ProductDto[]` + meta | |
| GET | `/products/:id` | `products.list` | | `ProductDetailDto` | 404 |
| POST | `/products` | `products.create` | `{ sku(1–64, [A-Za-z0-9._-]), name(1–255), description?, categoryId, unit(1–30), allowDecimalQuantity?, purchasePrice?, sellingPrice, minStock?, status? }` | 201 `ProductDetailDto` | 409 `products.skuExists`; 422 `categories.inactive` |
| PATCH | `/products/:id` | `products.update` | partial (không có trường tồn kho) | `ProductDetailDto` | 409 `products.skuExists`; 409 `products.decimalQuantityLocked` (tắt cờ lẻ khi tồn đang lẻ) |
| DELETE | `/products/:id` | `products.delete` | | 204 | 409 `products.hasTransactions` |

`ProductDto = { id, sku, name, category: {id,name}, unit, allowDecimalQuantity, sellingPrice, purchasePrice?, avgCost?, minStock, status, stock: { quantity, state }, primaryImage: { id, url, expiresAt } | null, createdAt, updatedAt }` — `purchasePrice`, `avgCost` **chỉ có** khi có quyền `products.viewCost`.
`ProductDetailDto = ProductDto & { description, images: ProductImageDto[] }`.

Đổi trạng thái (ngừng/kinh doanh lại) qua `PATCH { status }`.

## Ảnh sản phẩm — `products/` (luồng chi tiết: [storage-upload.md](storage-upload.md))

| Method | URL | Quyền | Request | Response | Lỗi riêng |
| --- | --- | --- | --- | --- | --- |
| POST | `/products/:id/images/upload-requests` | `products.update` | `{ fileName, mimeType∈IMAGE_MIME_TYPES, sizeBytes(1–MAX), replaceImageId? }` | 201 `{ imageId, upload: { url, fields: Record<string,string> }, expiresAt }` | 422 `productImages.invalidType` / `productImages.tooLarge`; 409 `productImages.limitReached` |
| POST | `/products/:id/images/:imageId/complete` | `products.update` | `{}` | `ProductImageDto` | 409 `productImages.notUploaded`; 422 `productImages.contentMismatch`; 409 `productImages.expired` |
| PATCH | `/products/:id/images/:imageId` | `products.update` | `{ isPrimary?: true }` | `ProductImageDto[]` | |
| PUT | `/products/:id/images/order` | `products.update` | `{ imageIds: uuid[] }` (đủ và đúng bộ ảnh READY) | `ProductImageDto[]` | 422 `productImages.orderMismatch` |
| DELETE | `/products/:id/images/:imageId` | `products.update` | | 204 | |

`ProductImageDto = { id, url, expiresAt, mimeType, sizeBytes, originalName, sortOrder, isPrimary }` (`url` = presigned GET, hạn 15 phút).

## Nhà cung cấp — `suppliers/`

| Method | URL | Quyền | Request | Response | Lỗi riêng |
| --- | --- | --- | --- | --- | --- |
| GET | `/suppliers` | `suppliers.list` | query: `search` (tên/điện thoại/email), `status`, `sortBy∈{name,createdAt}` | `SupplierDto[]` + meta | |
| GET | `/suppliers/:id` | `suppliers.list` | | `SupplierDetailDto` (`+ purchaseSummary: { receiptCount, totalConfirmedAmount, lastReceiptDate }`) | 404 |
| POST | `/suppliers` | `suppliers.create` | `{ name(1–255), contactPerson?, phone?(≤30), email?(email), address?, notes?, status? }` | 201 | |
| PATCH | `/suppliers/:id` | `suppliers.update` | partial | `SupplierDto` | |
| DELETE | `/suppliers/:id` | `suppliers.delete` | | 204 | 409 `suppliers.inUse` |

Lịch sử nhập theo nhà cung cấp: `GET /purchases?supplierId=`.

## Nhập hàng — `purchases/`

| Method | URL | Quyền | Request | Response | Lỗi riêng |
| --- | --- | --- | --- | --- | --- |
| GET | `/purchases` | `purchases.list` | query: `search` (mã), `supplierId`, `status`, `dateFrom`, `dateTo`, `productId`, `sortBy∈{receiptDate,code,totalAmount,createdAt}` | `PurchaseReceiptDto[]` + meta | |
| GET | `/purchases/:id` | `purchases.list` | | `PurchaseReceiptDetailDto` | 404 |
| POST | `/purchases` | `purchases.create` | `PurchaseInput = { supplierId, receiptDate, discountAmount?, notes?, items: [{ productId, quantity>0, unitPrice≥0, discountAmount? }] (1–200) }` | 201 `PurchaseReceiptDetailDto` (DRAFT) | 422 `suppliers.inactive`, `products.inactive`, `inventory.decimalNotAllowed` (+details theo dòng), `documents.discountExceedsAmount` |
| PATCH | `/purchases/:id` | `purchases.update` | `PurchaseInput & { version }` | `PurchaseReceiptDetailDto` | 409 `purchases.notDraft`, `purchases.stale` |
| POST | `/purchases/:id/confirm` | `purchases.confirm` | `{ version }` | `PurchaseReceiptDetailDto` (CONFIRMED) | 409 `purchases.alreadyProcessed`, `purchases.stale` |
| POST | `/purchases/:id/cancel` | `purchases.cancel` | `{ version, reason? }` | `PurchaseReceiptDetailDto` (CANCELLED) | 409 `purchases.notDraft` (phiếu đã xác nhận không huỷ được) |

`PurchaseReceiptDetailDto = { id, code, supplier: {id,name}, receiptDate, status, subtotal, discountAmount, totalAmount, notes, version, items: [{ id, lineNo, product: {id,sku,name,unit}, quantity, unitPrice, discountAmount, lineAmount, unitCost? }], createdBy, confirmedBy, cancelledBy, confirmedAt, cancelledAt, createdAt, updatedAt }`.

## Bán hàng — `sales/`

| Method | URL | Quyền | Request | Response | Lỗi riêng |
| --- | --- | --- | --- | --- | --- |
| GET | `/sales-orders` | `sales.list` | query: `search` (mã đơn/SĐT), `status`, `paymentStatus`, `paymentMethod`, `dateFrom`, `dateTo`, `createdById`, `mine?`, `sortBy∈{orderDate,code,totalAmount,createdAt}` | `SalesOrderDto[]` + meta | |
| GET | `/sales-orders/:id` | `sales.list` | | `SalesOrderDetailDto` | 404 (đơn của người khác khi thiếu `sales.viewAll` → 404) |
| POST | `/sales-orders` | `sales.create` | `SalesOrderInput = { clientRequestId: uuid, orderDate?, customerName?(≤150), customerPhone?(≤30), paymentMethod, discountAmount?, notes?, items: [{ productId, quantity>0, unitPrice?, discountAmount? }] (1–200), confirm?: boolean, markPaid?: boolean }` | 201 (tạo mới) / 200 (trùng `clientRequestId`) `SalesOrderDetailDto` | 409 `sales.insufficientStock` (+details); 403 `sales.priceOverrideForbidden`; 422 `products.inactive`, `inventory.decimalNotAllowed` |
| PATCH | `/sales-orders/:id` | `sales.update` | `SalesOrderInput (không clientRequestId) & { version }` | `SalesOrderDetailDto` | 409 `sales.notDraft`, `sales.stale` |
| POST | `/sales-orders/:id/confirm` | `sales.confirm` | `{ version, markPaid?: boolean, paymentMethod? }` | `SalesOrderDetailDto` | 409 `sales.alreadyProcessed`, `sales.stale`, `sales.insufficientStock` |
| POST | `/sales-orders/:id/pay` | `sales.pay` | `{ paymentMethod? }` | `SalesOrderDetailDto` | 409 `sales.notConfirmed`, `sales.alreadyPaid` |
| POST | `/sales-orders/:id/cancel` | `sales.cancel` (đơn CONFIRMED) · `sales.update` (đơn DRAFT của mình) | `{ version, reason? }` | `SalesOrderDetailDto` | 409 `sales.alreadyCancelled`, `sales.stale` |

Quy tắc:
- `unitPrice` bỏ trống = giá niêm yết; khác giá niêm yết cần quyền `sales.overridePrice`.
- Thiếu `sales.viewAll`: danh sách và chi tiết chỉ gồm đơn `createdBy = mình`.
- `unitCost`, `costAmount`, `totalCost`, lợi nhuận chỉ có khi có `products.viewCost`.
- `details` của `sales.insufficientStock`: `[{ productId, sku, name, requested, available }]`.

`SalesOrderDetailDto = { id, code, orderDate, customerName, customerPhone, status, paymentMethod, paymentStatus, paidAt, subtotal, discountAmount, totalAmount, totalCost?, notes, version, items: [{ id, lineNo, productId, sku, name, unit, quantity, listPrice, unitPrice, discountAmount, lineAmount, netAmount, unitCost?, costAmount? }], createdBy: {id,name}, confirmedBy, cancelledBy, paidBy, confirmedAt, cancelledAt, createdAt, updatedAt }`.

## Tồn kho — `inventory/`

| Method | URL | Quyền | Request | Response | Lỗi riêng |
| --- | --- | --- | --- | --- | --- |
| GET | `/inventory` | `inventory.list` | query: `search`, `categoryId`, `stockState`, `status`, `sortBy∈{name,sku,quantity,value}` | `InventoryItemDto[]` + meta (`+ summary: { totalQuantity, totalValue?, lowCount, outCount }`) | |
| GET | `/inventory/movements` | `inventory.movements` | query: `productId?`, `type?`, `refType?`, `dateFrom`, `dateTo`, `search` (mã chứng từ) | `InventoryMovementDto[]` + meta | |
| GET | `/inventory/adjustments` | `inventory.adjustments.list` | query: `reason`, `dateFrom`, `dateTo`, `search` | `InventoryAdjustmentDto[]` + meta | |
| GET | `/inventory/adjustments/:id` | `inventory.adjustments.list` | | `InventoryAdjustmentDetailDto` | 404 |
| POST | `/inventory/adjustments` | `inventory.adjust` | `{ clientRequestId, reason∈ADJUSTMENT_REASONS, note? (bắt buộc khi OTHER), items: [{ productId, quantityChange≠0 } | { productId, countedQuantity≥0 }] (1–200) }` — `countedQuantity` chỉ khi `STOCKTAKE` | 201/200 `InventoryAdjustmentDetailDto` | 409 `inventory.negativeStock` (+details); 422 `inventory.noteRequired`, `inventory.noChange` |

`InventoryItemDto = { productId, sku, name, category, unit, quantity, minStock, state, avgCost?, value?, lastMovementAt }` — `avgCost`, `value` khi có `inventory.viewValue`.
`InventoryMovementDto = { id, createdAt, product: {id,sku,name}, type, quantityChange, quantityBefore, quantityAfter, unitCost?, ref: { type, id, code }, reason, note, createdBy }`.

## Dashboard & báo cáo — `dashboard/` (có sẵn), `reports/`

Mọi báo cáo nhận `dateFrom`, `dateTo` (bắt buộc, khoảng ≤ 366 ngày → `422 reports.rangeTooLarge`), tuỳ báo cáo thêm `productId`, `categoryId`, `supplierId`. Ngày theo giờ VN. Chỉ tính chứng từ `CONFIRMED`.

| Method | URL | Quyền | Response |
| --- | --- | --- | --- |
| GET | `/dashboard/sales-summary` | `dashboard.salesSummary` | `{ productCount, supplierCount, totalStockQuantity, inventoryValue, today: { revenue, orderCount, purchaseAmount }, lowStock: InventoryItemDto[≤10], outOfStock: InventoryItemDto[≤10], lowStockCount, outOfStockCount }` |
| GET | `/reports/sales/daily` | `reports.sales` | `[{ date, orderCount, revenue, cost, grossProfit }]` + totals |
| GET | `/reports/sales/monthly` | `reports.sales` | `[{ month: 'YYYY-MM', orderCount, revenue, cost, grossProfit }]` + totals |
| GET | `/reports/sales/by-product` | `reports.sales` | query `sortBy∈{quantity,revenue,grossProfit}`, `limit?` (bán chạy = `sortBy=quantity&limit=10`) → `[{ product, quantity, revenue, cost, grossProfit, marginPct }]` + meta |
| GET | `/reports/purchases` | `reports.purchases` | `[{ receipt: {id,code,date}, supplier, itemCount, totalAmount }]` + totals |
| GET | `/reports/inventory` | `reports.inventory` | ảnh chụp tồn tại `dateTo` (từ sổ cái): `[{ product, openingQty, inQty, outQty, closingQty, closingValue }]` |
| GET | `/reports/inventory-movements` | `reports.inventory` | như `/inventory/movements`, kèm tổng vào/ra theo loại |
| GET | `/reports/profit` | `reports.profit` | `{ revenue, discounts, netRevenue, costOfGoodsSold, grossProfit, marginPct, byDay: [...] }` |

Mọi số liệu tiền dạng chuỗi thập phân; `revenue` = Σ `net_amount` (sau mọi chiết khấu).

## SDK (`@base/api-client`)

File mới `src/packages/api-client/src/endpoints/commerce.ts` export `createCategoriesApi`, `createProductsApi` (gồm `images.*` và helper `uploadImage(productId, file)` thực hiện đủ 3 bước), `createSuppliersApi`, `createPurchasesApi`, `createSalesOrdersApi`, `createInventoryApi`, `createReportsApi`; `createDashboardApi` thêm `salesSummary()`. Đăng ký trong `createApi`.
