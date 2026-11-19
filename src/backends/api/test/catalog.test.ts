import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fail, ok, type Client, type TestApp } from './helpers/app';
import { createProduct, getBalance, stockIn, uniqueCode } from './helpers/commerce';
import { signedInClient } from './helpers/flows';

describe('Danh mục: CRUD & ràng buộc', () => {
  let t: TestApp;
  let manager: Client;
  let staff: Client;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
    staff = (await signedInClient(t, { role: 'Staff' })).client;
  });
  afterAll(async () => {
    await t.close();
  });

  it('quản lý tạo, sửa, xem danh mục; danh sách có số sản phẩm', async () => {
    const name = uniqueCode('Đồ uống');
    const created = ok(await manager.post('/categories', { name }), 201);
    expect(created).toMatchObject({ name, status: 'ACTIVE', productCount: 0, description: null });
    const updated = ok(await manager.patch(`/categories/${created.id}`, { description: 'Mô tả' }));
    expect(updated).toMatchObject({ name, status: 'ACTIVE', description: 'Mô tả' });
    const list = await manager.get(`/categories?search=${encodeURIComponent(name)}`);
    expect(ok(list)).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);
  });

  it('sửa một phần không ghi đè trạng thái về mặc định', async () => {
    const created = ok(
      await manager.post('/categories', { name: uniqueCode('C'), status: 'INACTIVE' }),
      201,
    );
    const updated = ok(
      await manager.patch(`/categories/${created.id}`, { name: uniqueCode('C2') }),
    );
    expect(updated.status).toBe('INACTIVE');
  });

  it('trùng tên (không phân biệt hoa thường) → 409; tên rỗng → 422', async () => {
    const name = uniqueCode('trung');
    ok(await manager.post('/categories', { name }), 201);
    fail(
      await manager.post('/categories', { name: name.toLowerCase() }),
      409,
      'categories.nameExists',
    );
    fail(await manager.post('/categories', { name: '  ' }), 422, 'errors.validation');
  });

  it('xoá danh mục còn sản phẩm → 409; danh mục trống xoá được', async () => {
    const used = ok(await manager.post('/categories', { name: uniqueCode('C') }), 201);
    await createProduct(t, { categoryId: used.id });
    fail(await manager.delete(`/categories/${used.id}`), 409, 'categories.inUse');
    const empty = ok(await manager.post('/categories', { name: uniqueCode('C') }), 201);
    expect((await manager.delete(`/categories/${empty.id}`)).status).toBe(204);
    fail(await manager.get(`/categories/${empty.id}`), 404, 'categories.notFound');
  });

  it('Staff xem được nhưng không tạo được danh mục; chưa đăng nhập → 401', async () => {
    ok(await staff.get('/categories'));
    fail(await staff.post('/categories', { name: uniqueCode('X') }), 403);
    fail(await (await import('supertest')).default(t.server).get('/api/v1/categories'), 401);
  });
});

describe('Sản phẩm: CRUD, tìm kiếm, lọc, quyền xem giá vốn', () => {
  let t: TestApp;
  let manager: Client;
  let staff: Client;
  let categoryId: string;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
    staff = (await signedInClient(t, { role: 'Staff' })).client;
    categoryId = ok(await manager.post('/categories', { name: uniqueCode('Thời trang') }), 201).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const body = (overrides: Record<string, unknown> = {}) => ({
    sku: uniqueCode('SP'),
    name: 'Áo thun',
    categoryId,
    unit: 'cái',
    sellingPrice: '150000',
    purchasePrice: '90000',
    ...overrides,
  });

  it('tạo sản phẩm: tồn 0, trạng thái Hết hàng, đang kinh doanh, chưa có ảnh', async () => {
    const created = ok(await manager.post('/products', body({ minStock: '5' })), 201);
    expect(created).toMatchObject({
      status: 'ACTIVE',
      sellingPrice: '150000.00',
      purchasePrice: '90000.00',
      avgCost: '0.0000',
      minStock: '5.000',
      allowDecimalQuantity: false,
      hasTransactions: false,
      stock: { quantity: '0.000', state: 'OUT' },
      primaryImage: null,
      images: [],
    });
    expect(created.category).toEqual({ id: categoryId, name: expect.any(String) });
  });

  it('SKU trùng (khác hoa thường) → 409; SKU sai ký tự → 422; giá âm → 422', async () => {
    const sku = uniqueCode('dup');
    ok(await manager.post('/products', body({ sku })), 201);
    fail(
      await manager.post('/products', body({ sku: sku.toLowerCase() })),
      409,
      'products.skuExists',
    );
    const bad = fail(
      await manager.post('/products', body({ sku: 'A B' })),
      422,
      'errors.validation',
    );
    expect(JSON.stringify(bad)).toContain('SKU');
    fail(await manager.post('/products', body({ sellingPrice: '-1' })), 422);
    fail(await manager.post('/products', body({ sellingPrice: '1.999' })), 422);
  });

  it('danh mục ngừng sử dụng → không tạo sản phẩm mới được', async () => {
    const inactive = ok(
      await manager.post('/categories', { name: uniqueCode('Ngừng'), status: 'INACTIVE' }),
      201,
    );
    fail(
      await manager.post('/products', body({ categoryId: inactive.id })),
      422,
      'categories.inactive',
    );
    fail(
      await manager.post('/products', body({ categoryId: randomUUID() })),
      404,
      'categories.notFound',
    );
  });

  it('tìm theo tên/SKU (không phân biệt hoa thường, ký tự đặc biệt không là wildcard), lọc kết hợp', async () => {
    const tag = uniqueCode('Q');
    const a = ok(
      await manager.post('/products', body({ sku: `${tag}_A`, name: `Áo ${tag}` })),
      201,
    );
    ok(
      await manager.post(
        '/products',
        body({ sku: `${tag}XB`, name: `Quần ${tag}`, status: 'INACTIVE' }),
      ),
      201,
    );
    const bySku = ok(await manager.get(`/products?search=${encodeURIComponent(`${tag}_`)}`));
    expect(bySku.map((p: { id: string }) => p.id)).toEqual([a.id]);
    const byName = ok(
      await manager.get(`/products?search=${encodeURIComponent(`áo ${tag}`.toLowerCase())}`),
    );
    expect(byName).toHaveLength(1);
    const active = await manager.get(
      `/products?search=${tag}&status=ACTIVE&categoryId=${categoryId}`,
    );
    expect(ok(active)).toHaveLength(1);
    expect(active.body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('lọc theo trạng thái tồn và sắp xếp theo tồn', async () => {
    const tag = uniqueCode('ST');
    const out = await createProduct(t, { sku: `${tag}-OUT`, categoryId, minStock: '5' });
    const low = await createProduct(t, { sku: `${tag}-LOW`, categoryId, minStock: '5' });
    const plenty = await createProduct(t, { sku: `${tag}-OK`, categoryId, minStock: '5' });
    await stockIn(t, low.id, '3', '1000');
    await stockIn(t, plenty.id, '50', '1000');
    const ids = async (state: string) =>
      ok(await manager.get(`/products?search=${tag}&stockState=${state}`)).map(
        (p: { id: string }) => p.id,
      );
    expect(await ids('OUT')).toEqual([out.id]);
    expect(await ids('LOW')).toEqual([low.id]);
    expect(await ids('IN_STOCK')).toEqual([plenty.id]);
    const sorted = ok(await manager.get(`/products?search=${tag}&sortBy=stock&sortOrder=desc`));
    expect(sorted.map((p: { id: string }) => p.id)).toEqual([plenty.id, low.id, out.id]);
  });

  it('Staff xem được sản phẩm nhưng không thấy giá nhập / giá vốn, không sửa được', async () => {
    const created = ok(await manager.post('/products', body()), 201);
    const seen = ok(await staff.get(`/products/${created.id}`));
    expect(seen).not.toHaveProperty('purchasePrice');
    expect(seen).not.toHaveProperty('avgCost');
    expect(seen.sellingPrice).toBe('150000.00');
    const list = ok(await staff.get(`/products?search=${created.sku}`));
    expect(list[0]).not.toHaveProperty('avgCost');
    fail(await staff.patch(`/products/${created.id}`, { name: 'X' }), 403);
  });

  it('sửa một phần: không ghi đè trường khác, không có trường tồn kho', async () => {
    const created = ok(
      await manager.post('/products', body({ status: 'INACTIVE', minStock: '2' })),
      201,
    );
    const updated = ok(await manager.patch(`/products/${created.id}`, { sellingPrice: '160000' }));
    expect(updated).toMatchObject({
      sellingPrice: '160000.00',
      status: 'INACTIVE',
      minStock: '2.000',
    });
    const ignored = await manager.patch(`/products/${created.id}`, { stock: '100' });
    expect(ok(ignored).stock.quantity).toBe('0.000');
  });

  it('không tắt được "cho phép số lẻ" khi tồn đang lẻ', async () => {
    const created = ok(await manager.post('/products', body({ allowDecimalQuantity: true })), 201);
    await stockIn(t, created.id, '1.5', '1000');
    fail(
      await manager.patch(`/products/${created.id}`, { allowDecimalQuantity: false }),
      409,
      'products.decimalQuantityLocked',
    );
  });

  it('ngừng kinh doanh sản phẩm đã giao dịch; không xoá cứng được; sản phẩm mới xoá được', async () => {
    const used = ok(await manager.post('/products', body()), 201);
    await stockIn(t, used.id, '1', '1000');
    fail(await manager.delete(`/products/${used.id}`), 409, 'products.hasTransactions');
    const stopped = ok(await manager.patch(`/products/${used.id}`, { status: 'INACTIVE' }));
    expect(stopped).toMatchObject({ status: 'INACTIVE', hasTransactions: true });
    expect((await getBalance(t, used.id)).quantity).toBe('1.000');

    const fresh = ok(await manager.post('/products', body()), 201);
    expect((await manager.delete(`/products/${fresh.id}`)).status).toBe(204);
    fail(await manager.get(`/products/${fresh.id}`), 404, 'products.notFound');
  });
});
