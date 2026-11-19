import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fail, ok, type Client, type TestApp } from './helpers/app';
import { createProduct, uniqueCode } from './helpers/commerce';
import { signedInClient } from './helpers/flows';

describe('Nhà cung cấp: CRUD, tìm kiếm, lịch sử nhập', () => {
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

  it('tạo / sửa / xem; chuỗi rỗng lưu thành null; sửa một phần không đổi trạng thái', async () => {
    const created = ok(
      await manager.post('/suppliers', {
        name: 'Công ty ABC',
        phone: '0901234567',
        email: 'abc@example.com',
        address: '',
        status: 'INACTIVE',
      }),
      201,
    );
    expect(created).toMatchObject({ name: 'Công ty ABC', address: null, status: 'INACTIVE' });
    const updated = ok(
      await manager.patch(`/suppliers/${created.id}`, { contactPerson: 'Anh Bình' }),
    );
    expect(updated).toMatchObject({ contactPerson: 'Anh Bình', status: 'INACTIVE' });
    const detail = ok(await manager.get(`/suppliers/${created.id}`));
    expect(detail.purchaseSummary).toEqual({
      receiptCount: 0,
      totalConfirmedAmount: '0.00',
      lastReceiptDate: null,
    });
  });

  it('tìm theo tên, điện thoại, email; lọc trạng thái', async () => {
    const tag = uniqueCode('NCC');
    const phone = `09${Math.floor(Math.random() * 1e8)}`;
    const a = ok(await manager.post('/suppliers', { name: `${tag} Một`, phone }), 201);
    ok(
      await manager.post('/suppliers', {
        name: `${tag} Hai`,
        email: `${tag.toLowerCase()}@mail.vn`,
        status: 'INACTIVE',
      }),
      201,
    );
    expect(
      ok(await manager.get(`/suppliers?search=${phone}`)).map((s: { id: string }) => s.id),
    ).toEqual([a.id]);
    expect(ok(await manager.get(`/suppliers?search=${tag.toLowerCase()}@`))).toHaveLength(1);
    expect(ok(await manager.get(`/suppliers?search=${tag}&status=ACTIVE`))).toHaveLength(1);
  });

  it('email sai → 422; Staff không xem được nhà cung cấp → 403', async () => {
    fail(
      await manager.post('/suppliers', { name: 'X', email: 'khong-hop-le' }),
      422,
      'errors.validation',
    );
    fail(await staff.get('/suppliers'), 403);
  });

  it('tóm tắt nhập hàng chỉ tính phiếu đã xác nhận; có phiếu thì không xoá được', async () => {
    const supplier = ok(await manager.post('/suppliers', { name: uniqueCode('NCC') }), 201);
    const product = await createProduct(t);
    const line = { productId: product.id, quantity: '2', unitPrice: '50000' };
    const draft = ok(
      await manager.post('/purchases', {
        supplierId: supplier.id,
        receiptDate: '2026-11-10',
        items: [line],
      }),
      201,
    );
    const confirmed = ok(
      await manager.post('/purchases', {
        supplierId: supplier.id,
        receiptDate: '2026-11-12',
        items: [line],
      }),
      201,
    );
    ok(await manager.post(`/purchases/${confirmed.id}/confirm`, { version: confirmed.version }));
    const detail = ok(await manager.get(`/suppliers/${supplier.id}`));
    expect(detail.purchaseSummary).toEqual({
      receiptCount: 1,
      totalConfirmedAmount: '100000.00',
      lastReceiptDate: '2026-11-12',
    });
    const history = ok(await manager.get(`/purchases?supplierId=${supplier.id}`));
    expect(history.map((r: { id: string }) => r.id).sort()).toEqual(
      [draft.id, confirmed.id].sort(),
    );
    fail(await manager.delete(`/suppliers/${supplier.id}`), 409, 'suppliers.inUse');
    const unused = ok(await manager.post('/suppliers', { name: uniqueCode('NCC') }), 201);
    expect((await manager.delete(`/suppliers/${unused.id}`)).status).toBe(204);
  });
});
