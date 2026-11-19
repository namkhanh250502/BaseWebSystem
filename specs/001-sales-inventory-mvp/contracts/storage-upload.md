# Storage Contract — Ảnh sản phẩm trên MinIO

## Thành phần

- `StorageModule` (`src/backends/api/src/storage/`, `@Global`): `StorageService` — `createPresignedPost(key, { mimeType, maxBytes, expiresSec })`, `presignedGetUrl(key, ttlSec)`, `stat(key)`, `readHead(key, bytes)`, `remove(key)`, `ensureBucket()`; `StorageCleanupService` (dọn định kỳ, research R15). Cấu hình từ `getEnv()`: `MINIO_ENDPOINT`, `MINIO_PUBLIC_URL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION`, `PRODUCT_IMAGE_MAX_BYTES`.
- `ProductImagesService` (`src/backends/api/src/products/`): nghiệp vụ ảnh, bảng `product_images`.
- Frontend: `api.products.images.uploadImage(productId, file, { replaceImageId? })` trong `@base/api-client` thực hiện 3 bước; component `ProductImagesManager` (admin).

Bucket private, không policy public. Trình duyệt **không bao giờ** nhận access key/secret — chỉ nhận URL + form fields đã ký, hết hạn sau 5 phút (upload) / 15 phút (xem).

## Luồng tải ảnh

```mermaid
sequenceDiagram
  autonumber
  actor U as Trình duyệt (admin)
  participant API as API NestJS
  participant DB as PostgreSQL
  participant S3 as MinIO (bucket private)

  U->>U: Kiểm tra sơ bộ loại (jpeg/png/webp) & ≤ 5 MB
  U->>API: POST /products/:id/images/upload-requests {fileName, mimeType, sizeBytes, replaceImageId?}
  API->>API: Quyền products.update · validate mime/size · đếm ảnh (≤10, khoá products FOR UPDATE)
  API->>DB: INSERT product_images (status=PENDING, object_key=products/<pid>/<uuid>.<ext>, upload_expires_at=now+10')
  API->>S3: (ký offline) presignedPostPolicy: key cố định, Content-Type = mimeType, content-length-range 1..MAX, hết hạn 5'
  API-->>U: 201 { imageId, upload: { url, fields }, expiresAt }
  U->>S3: POST multipart (fields + file) — trực tiếp, không qua API
  S3-->>U: 204 (hoặc 403 nếu sai kích thước/loại/hết hạn)
  U->>API: POST /products/:id/images/:imageId/complete
  API->>S3: statObject(key) → size, content-type
  API->>S3: getPartialObject(key, 0, 16) → kiểm tra magic bytes (FFD8FF / 89504E47 / RIFF…WEBP)
  alt hợp lệ
    API->>DB: TX: status=READY, size thực tế; nếu chưa có ảnh chính → is_primary; nếu replaceImageId → ảnh mới nhận sort_order + is_primary của ảnh cũ, ảnh cũ status=DELETED
    API-->>U: ProductImageDto (url = presigned GET 15')
    API--)S3: removeObject(ảnh cũ) — lỗi thì để cleanup xử lý
  else không hợp lệ / không có object
    API->>S3: removeObject(key)
    API->>DB: DELETE product_images
    API-->>U: 422 productImages.contentMismatch / 409 productImages.notUploaded
  end
```

## Xem ảnh

- DTO sản phẩm/ảnh trả `url` = `presignedGetObject(key, 900s)` ký bằng client `signer` với `MINIO_PUBLIC_URL`, kèm `expiresAt`. Frontend react-query `staleTime` < 15' để tự lấy URL mới; `<Image onError>` gọi refetch một lần.
- Không cache URL ở server (ký offline, chi phí thấp).

## Xoá & dọn mồ côi

| Tình huống | Xử lý |
| --- | --- |
| Xoá ảnh | TX: `status=DELETED`, nếu là ảnh chính → ảnh `READY` có `sort_order` nhỏ nhất thành chính; sau commit gọi `removeObject`; thành công → xoá bản ghi |
| Tải dở / không gọi complete | `PENDING` quá `upload_expires_at` → cleanup xoá object (nếu có) + bản ghi |
| removeObject lỗi | Bản ghi giữ `DELETED`, cleanup thử lại mỗi giờ |
| Xoá sản phẩm (chưa có giao dịch) | FK `CASCADE` xoá luôn bản ghi ảnh, nên service đọc danh sách object key **trước**, xoá sản phẩm trong TX, sau commit xoá các object; object nào xoá lỗi sẽ được sweep theo prefix dọn sau (object không còn bản ghi) |
| MinIO không khả dụng | API ảnh trả `503 storage.unavailable`; các API khác vẫn chạy, DTO trả `primaryImage.url = null` nếu ký URL lỗi |

Cleanup chạy mỗi giờ, khoá `pg_try_advisory_lock` để một instance chạy; sweep prefix (object không có bản ghi, cũ hơn 24 giờ) chạy mỗi ngày → SC-009.

## Cấu hình MinIO (triển khai)

- Bucket `products` private; CORS cho `USER_APP_URL`, `ADMIN_APP_URL` (method POST, GET).
- Domain riêng (vd. `files.example.com`) → Cloudflare → nginx → MinIO `:9000`, giữ `Host` gốc (chữ ký presigned phụ thuộc host + path). Không đặt MinIO dưới đường dẫn con của domain app.
- Tài khoản MinIO riêng cho API, policy chỉ `s3:PutObject/GetObject/DeleteObject/ListBucket` trên bucket `products`.
