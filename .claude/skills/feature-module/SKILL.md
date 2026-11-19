---
name: feature-module
description: Quy trình thêm một module/tính năng nghiệp vụ mới end-to-end trong BaseWebSystem (bảng Drizzle → zod schema/DTO ở @base/shared → permission → module NestJS controller/service → endpoint SDK @base/api-client → trang admin + route + menu + i18n → test e2e). Dùng khi người dùng muốn "thêm module", "thêm chức năng quản lý X", "CRUD cho X", "thêm màn hình danh sách X", hoặc thêm API mới cho một domain chưa có. Dùng kèm base-skill.
---

# Thêm module mới end-to-end

Ví dụ xuyên suốt: module `products`. Đổi tên theo domain thật. Làm **đúng thứ tự** dưới đây — mỗi bước phụ thuộc kiểu của bước trước, nên typecheck sẽ dẫn đường.

Mẫu tham chiếu tốt nhất trong repo: **roles** (`src/backends/api/src/roles/`, `src/packages/shared/src/schemas/role.ts`, `src/packages/api-client/src/endpoints/admin.ts` → `createRolesApi`, `src/frontends/admin/src/features/roles/`). Đọc trước khi viết.

## 0. Chốt phạm vi (hỏi người dùng nếu chưa rõ)

- Các trường dữ liệu, trường bắt buộc, unique, quan hệ (FK tới `users`?).
- Những thao tác cần: list (search/sort/filter?), view, create, update, delete, hành động riêng.
- App nào dùng: chỉ admin, hay cả user (user thường chỉ thao tác dữ liệu của chính mình qua `/me/...`).
- Có cần thông báo (skill `notifications`), setting (base-skill → `settings.md`) không.

## 1. DB schema — `src/packages/db/src/schema/products.ts`

Chi tiết: skill `db-schema`.

```ts
import { boolean, index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.name)],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
```

Export trong `schema/index.ts` (giữ thứ tự alphabet) → `pnpm db:generate` → xem file SQL sinh ra → `pnpm db:migrate`.

## 2. Zod schema + DTO — `src/packages/shared/src/schemas/product.ts`

```ts
import { z } from 'zod';
import { paginationQuerySchema, sortOrderSchema, type PageQuery } from './common';

export const PRODUCT_SORT_FIELDS = ['name', 'createdAt'] as const;

export const listProductsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  sortBy: z.enum(PRODUCT_SORT_FIELDS).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).nullable().optional(),
  isActive: z.boolean().default(true),
});
export const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ListProductsQuery = PageQuery;

export interface ProductDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string; // ISO
  updatedAt: string;
}
```

Export trong `src/packages/shared/src/index.ts`. Message lỗi validate tuỳ biến (vd. `{ message: 'product.xxx' }`) là key i18n — thêm vào i18n backend.

## 3. Permission

Theo base-skill → [permissions.md](../base-skill/permissions.md). Tóm tắt:

- `src/packages/shared/src/constants/permissions.ts` → `PERMISSION_DEFINITIONS`:
  `{ key: 'products.list', module: 'products', ...api('GET', '/products') }`, tương tự `view`, `create`, `update`, `delete`.
- `src/frontends/admin/src/locales/{vi,en}.ts` → `permissions.modules.products` và `permissions.items['products.list']`…
- `pnpm db:seed` (Administrator tự nhận đủ quyền mới).

## 4. Backend — `src/backends/api/src/products/`

- `products.module.ts`: `@Module({ controllers: [ProductsController], providers: [ProductsService] })`; module cần service của module khác thì module kia phải `exports` service đó và module này `imports` nó.
- Thêm `ProductsModule` vào `imports` của `src/backends/api/src/app.module.ts`.
- Controller mỏng, theo mẫu `roles.controller.ts`:

```ts
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
  create(@ZodBody(createProductSchema) input: z.infer<typeof createProductSchema>) {
    return this.productsService.create(input);
  }

  @RequirePermission('products.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@ZodParams(idParamSchema) { id }: IdParam) {
    await this.productsService.remove(id);
  }
}
```

- Service: `constructor(@InjectDb() private readonly db: Database)`. `list` trả `{ items, meta: { page, pageSize, total } }` (chạy query dữ liệu và `count()` song song bằng `Promise.all`, search bằng `ilike`, sort theo `sortBy`/`sortOrder`). Map entity → DTO trong service (ngày `.toISOString()`). Thao tác nhiều bảng dùng `this.db.transaction(async (tx) => …)`, hàm phụ nhận `DbOrTx`.
- Lỗi: `throw notFound('products.notFound')`, `conflict('products.nameExists', { name })` → thêm key vào `src/backends/api/src/i18n/vi.ts` **và** `en.ts`. Trường unique: kiểm tra trùng trước khi insert/update và ném `conflict(...)` (như `roles.service.ts`), đừng để lỗi unique của Postgres thành 500.

## 5. SDK — `src/packages/api-client/src/endpoints/products.ts`

```ts
export function createProductsApi(http: HttpClient) {
  return {
    list: async (query: ListProductsQuery = {}) =>
      toPaginated(await http.get<ProductDto[]>('/products', { query })),
    get: async (id: string) => (await http.get<ProductDto>(`/products/${id}`)).data,
    create: async (input: CreateProductInput) =>
      (await http.post<ProductDto>('/products', input)).data,
    update: async (id: string, input: UpdateProductInput) =>
      (await http.patch<ProductDto>(`/products/${id}`, input)).data,
    remove: async (id: string) => {
      await http.delete(`/products/${id}`);
    },
  };
}
```

Đăng ký `products: createProductsApi(http)` trong `createApi` (`src/packages/api-client/src/index.ts`).

## 6. Frontend admin

Chi tiết: skill `frontend-page`. Checklist:

- `src/frontends/admin/src/features/products/ProductsPage.tsx` (+ `ProductFormModal.tsx`), copy khung từ `RolesPage.tsx`: `b-page` + `PageHeader` + `Card` + `b-toolbar` + `Table` (pagination `showTotal`), `useQuery({ queryKey: ['products', query] })`, mutation `invalidateQueries({ queryKey: ['products'] })`, `useNotifyError()`.
- Route trong `src/frontends/admin/src/app/router.tsx`, bọc `<RequirePermission permission="products.list">`.
- Menu trong `src/frontends/admin/src/app/AdminLayout.tsx` (`hidden: !can('products.list')`), dịch `menu.products`.
- Namespace dịch `products` trong `src/frontends/admin/src/locales/{vi,en}.ts` (title, subtitle, fields, messages…).
- Nút hành động ẩn theo `can('products.create' | 'products.update' | 'products.delete')`.

## 7. Test e2e — `src/backends/api/test/products.test.ts`

Chi tiết: skill `api-testing`. Tối thiểu: CRUD thành công với admin, user không có quyền nhận 403, validate sai nhận 400, không tồn tại nhận 404 với đúng key.

## 8. Hoàn tất

`pnpm lint`, `pnpm typecheck`, `pnpm test` (nếu chạy được DB) → báo kết quả → hỏi cập nhật: `README.md` (bảng Tính năng), `docs/architecture.md` (Bản đồ API), `docs/permissions.md` (nếu có quy tắc quyền đặc biệt), `docs/TEST-CASES.md` (testcase mới).
