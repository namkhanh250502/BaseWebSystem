# Quickstart — kiểm chứng 001 Quản lý bán hàng & tồn kho

Hướng dẫn chạy và kiểm tra end-to-end sau khi triển khai. Chi tiết API: [contracts/rest-api.md](contracts/rest-api.md); quyền: [contracts/permissions.md](contracts/permissions.md); ảnh: [contracts/storage-upload.md](contracts/storage-upload.md); dữ liệu: [data-model.md](data-model.md).

## Chuẩn bị

1. PostgreSQL local như README (`base_web`).
2. MinIO local:
   ```bash
   # macOS: brew install minio/stable/minio
   minio server ~/minio-data --address :9000 --console-address :9001
   ```
   Tạo access key cho API trong console `http://localhost:9001` (hoặc dùng tài khoản root khi dev). Lưu ý: binary `minio` mới có thể là **AIStor** (cần license — không có license thì mọi thao tác S3 bị từ chối); dùng bản MinIO community.
3. Thêm vào `src/backends/api/.env` (xem `.env.example`):
   ```ini
   MINIO_ENDPOINT=http://localhost:9000
   MINIO_PUBLIC_URL=http://localhost:9000
   MINIO_ACCESS_KEY=...
   MINIO_SECRET_KEY=...
   MINIO_BUCKET=products
   MINIO_REGION=us-east-1
   API_DOCS_ENABLED=true
   ```
4. ```bash
   pnpm install
   pnpm db:migrate
   pnpm db:seed      # thêm quyền mới, tạo role Manager/Staff nếu chưa có
   pnpm dev
   ```
5. Admin → Người dùng: tạo `manager@example.com` (role Manager) và `staff@example.com` (role Staff).

## Kiểm tra tự động

```bash
pnpm lint && pnpm typecheck
pnpm test                                    # e2e dùng FakeStorageService
TEST_MINIO_URL=http://minioadmin:minioadmin@localhost:9000 \
  pnpm --filter @base/api test -- storage    # tích hợp MinIO thật (tuỳ chọn)
```

Kỳ vọng: toàn bộ pass, gồm bộ đồng thời (SC-003) và đối soát sổ cái (SC-004).

## Kịch bản thủ công

| # | Bước | Kết quả mong đợi |
| --- | --- | --- |
| 1 | `http://localhost:4000/api/docs` | Swagger liệt kê các nhóm categories/products/suppliers/purchases/sales-orders/inventory/reports |
| 2 | Manager đăng nhập admin → tạo danh mục "Đồ uống", sản phẩm `CF01` giá bán 30.000 | Sản phẩm tồn 0, trạng thái Hết hàng |
| 3 | Tải 3 ảnh (jpg, png, webp), đổi ảnh chính, xoá 1 ảnh, thử file PDF và ảnh 6 MB | Ảnh chính đổi đúng; PDF/6 MB bị từ chối; MinIO console không còn object của ảnh đã xoá |
| 4 | Tạo nhà cung cấp, phiếu nhập 10 × 20.000 → Xác nhận; phiếu nhập 10 × 26.000 → Xác nhận | Tồn 20, giá vốn bình quân 23.000; sổ biến động 2 dòng `PURCHASE_IN` |
| 5 | Bấm Xác nhận lại phiếu thứ nhất (2 tab) | Lỗi "phiếu đã được xử lý", tồn vẫn 20 |
| 6 | Staff đăng nhập **app user** → menu Bán hàng → bán 5 `CF01`, tiền mặt, đã thanh toán | Tồn 15; chi tiết đơn không hiện giá vốn |
| 7 | Staff thử bán 16 `CF01` | Lỗi thiếu hàng gắn vào dòng `CF01`, còn 15 |
| 8 | Staff thử vào admin app | Bị từ chối (thiếu quyền vào trang quản trị) |
| 9 | Tài khoản tự đăng ký mới đăng nhập app user | Không thấy menu Bán hàng; gọi `POST /sales-orders` → 403 |
| 10 | Manager huỷ đơn ở bước 6 | Tồn 20, sổ có `SALE_CANCEL_IN`, doanh thu hôm nay giảm |
| 11 | Điều chỉnh kiểm kê `CF01` đếm thực tế 18 | Chênh lệch −2, tồn 18, lý do `STOCKTAKE` |
| 12 | Báo cáo lợi nhuận hôm nay sau khi bán lại 5 × 30.000 | Doanh thu 150.000, giá vốn 115.000, lợi nhuận gộp 35.000 |
| 13 | Chuyển English ở cả hai app | Nhãn, trạng thái, lỗi tiếng Anh; tiền vẫn hiển thị VND |
| 14 | Tắt MinIO, mở danh sách sản phẩm và bán hàng | Bán hàng vẫn chạy; ảnh không hiện; API ảnh trả lỗi `storage.unavailable` |
