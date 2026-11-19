import { randomUUID } from 'node:crypto';
import { eq, inventoryMovements } from '@base/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fail, ok, type Client, type TestApp } from './helpers/app';
import { createProduct, getBalance, ledgerMismatches, uniqueCode } from './helpers/commerce';
import { signedInClient } from './helpers/flows';

describe('Nhập hàng: phiếu nháp, xác nhận, huỷ', () => {
  let t: TestApp;
  let manager: Client;
  let staff: Client;
  let supplierId: string;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
    staff = (await signedInClient(t, { role: 'Staff' })).client;
    supplierId = ok(await manager.post('/suppliers', { name: uniqueCode('NCC') }), 201).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const create = (items: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
    manager.post('/purchases', { supplierId, receiptDate: '2026-11-19', items, ...extra });

  it('tạo phiếu nháp: sinh mã PN-…, tính tiền, không đổi tồn kho', async () => {
    const product = await createProduct(t);
    const receipt = ok(
      await create(
        [{ productId: product.id, quantity: '10', unitPrice: '20000', discountAmount: '5000' }],
        { discountAmount: '15000', notes: 'Lô đầu' },
      ),
      201,
    );
    expect(receipt).toMatchObject({
      status: 'DRAFT',
      version: 1,
      itemCount: 1,
      subtotal: '195000.00',
      discountAmount: '15000.00',
      totalAmount: '180000.00',
      notes: 'Lô đầu',
      confirmedAt: null,
      createdBy: { id: expect.any(String), name: expect.any(String) },
    });
    expect(receipt.code).toMatch(/^PN-\d{8}-\d{4}$/);
    expect(receipt.items[0]).toMatchObject({ lineNo: 1, lineAmount: '195000.00', unitCost: null });
    expect((await getBalance(t, product.id)).quantity).toBe('0.000');
  });

  it('dòng không hợp lệ bị từ chối: SL ≤ 0, giá âm, chiết khấu dòng / phiếu vượt thành tiền, SL lẻ', async () => {
    const product = await createProduct(t);
    fail(
      await create([{ productId: product.id, quantity: '0', unitPrice: '1' }]),
      422,
      'errors.validation',
    );
    fail(
      await create([{ productId: product.id, quantity: '1', unitPrice: '-1' }]),
      422,
      'errors.validation',
    );
    fail(await create([]), 422, 'errors.validation');
    fail(
      await create([
        { productId: product.id, quantity: '1', unitPrice: '1000', discountAmount: '2000' },
      ]),
      422,
      'documents.lineDiscountExceedsAmount',
    );
    fail(
      await create([{ productId: product.id, quantity: '1', unitPrice: '1000' }], {
        discountAmount: '1001',
      }),
      422,
      'documents.discountExceedsAmount',
    );
    const err = fail(
      await create([{ productId: product.id, quantity: '1.5', unitPrice: '1000' }]),
      422,
      'inventory.decimalNotAllowed',
    );
    expect(err.message).toContain(product.sku);
    fail(
      await create([{ productId: randomUUID(), quantity: '1', unitPrice: '1' }]),
      404,
      'products.notFound',
    );
  });

  it('nhà cung cấp ngừng hợp tác / sản phẩm ngừng kinh doanh → 422', async () => {
    const product = await createProduct(t);
    const stopped = ok(
      await manager.post('/suppliers', { name: uniqueCode('NCC'), status: 'INACTIVE' }),
      201,
    );
    fail(
      await manager.post('/purchases', {
        supplierId: stopped.id,
        receiptDate: '2026-11-19',
        items: [{ productId: product.id, quantity: '1', unitPrice: '1' }],
      }),
      422,
      'suppliers.inactive',
    );
    const inactive = await createProduct(t, { status: 'INACTIVE' });
    fail(
      await create([{ productId: inactive.id, quantity: '1', unitPrice: '1' }]),
      422,
      'products.inactive',
    );
  });

  it('sửa phiếu nháp ghi lại dòng, tăng version; version lệch → 409', async () => {
    const a = await createProduct(t);
    const b = await createProduct(t);
    const receipt = ok(await create([{ productId: a.id, quantity: '1', unitPrice: '1000' }]), 201);
    const updated = ok(
      await manager.patch(`/purchases/${receipt.id}`, {
        version: receipt.version,
        supplierId,
        receiptDate: '2026-11-18',
        items: [
          { productId: a.id, quantity: '2', unitPrice: '1000' },
          { productId: b.id, quantity: '3', unitPrice: '500' },
        ],
      }),
    );
    expect(updated).toMatchObject({
      version: 2,
      itemCount: 2,
      totalAmount: '3500.00',
      receiptDate: '2026-11-18',
    });
    fail(
      await manager.patch(`/purchases/${receipt.id}`, {
        version: 1,
        supplierId,
        receiptDate: '2026-11-18',
        items: [{ productId: a.id, quantity: '1', unitPrice: '1' }],
      }),
      409,
      'purchases.stale',
    );
  });

  it('xác nhận: cộng tồn, giá vốn bình quân, sổ cái theo dòng; phiếu thành bất biến', async () => {
    const product = await createProduct(t);
    const first = ok(
      await create([{ productId: product.id, quantity: '10', unitPrice: '100000' }]),
      201,
    );
    const confirmed = ok(
      await manager.post(`/purchases/${first.id}/confirm`, { version: first.version }),
    );
    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      version: 2,
      confirmedBy: { id: expect.any(String) },
    });
    expect(confirmed.items[0].unitCost).toBe('100000.0000');
    const second = ok(
      await create([{ productId: product.id, quantity: '10', unitPrice: '120000' }]),
      201,
    );
    ok(await manager.post(`/purchases/${second.id}/confirm`, { version: 1 }));
    expect(await getBalance(t, product.id)).toEqual({ quantity: '20.000', avgCost: '110000.0000' });

    const moves = await t.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.productId, product.id));
    expect(moves.map((m) => [m.type, m.refCode, m.quantityChange])).toEqual([
      ['PURCHASE_IN', first.code, '10.000'],
      ['PURCHASE_IN', second.code, '10.000'],
    ]);
    fail(
      await manager.patch(`/purchases/${first.id}`, {
        version: 2,
        supplierId,
        receiptDate: '2026-11-19',
        items: [{ productId: product.id, quantity: '1', unitPrice: '1' }],
      }),
      409,
      'purchases.notDraft',
    );
    fail(
      await manager.post(`/purchases/${first.id}/cancel`, { version: 2 }),
      409,
      'purchases.notDraft',
    );
  });

  it('chiết khấu phiếu phân bổ vào giá vốn từng dòng', async () => {
    const a = await createProduct(t);
    const b = await createProduct(t);
    const receipt = ok(
      await create(
        [
          { productId: a.id, quantity: '10', unitPrice: '100000' },
          { productId: b.id, quantity: '3', unitPrice: '10000' },
        ],
        { discountAmount: '10300' },
      ),
      201,
    );
    const done = ok(await manager.post(`/purchases/${receipt.id}/confirm`, { version: 1 }));
    expect(done.items.map((i: { unitCost: string }) => i.unitCost)).toEqual([
      '99000.0000',
      '9900.0000',
    ]);
    expect((await getBalance(t, a.id)).avgCost).toBe('99000.0000');
  });

  it('xác nhận trùng (tuần tự và đồng thời): chỉ một lần có hiệu lực, tồn chỉ tăng một lần', async () => {
    const product = await createProduct(t);
    const receipt = ok(
      await create([{ productId: product.id, quantity: '5', unitPrice: '1000' }]),
      201,
    );
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        manager.post(`/purchases/${receipt.id}/confirm`, { version: 1 }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of results.filter((x) => x.status !== 200)) {
      expect(r.status).toBe(409);
      expect(['purchases.alreadyProcessed', 'purchases.stale']).toContain(r.body.error.key);
    }
    fail(
      await manager.post(`/purchases/${receipt.id}/confirm`, { version: 2 }),
      409,
      'purchases.alreadyProcessed',
    );
    expect((await getBalance(t, product.id)).quantity).toBe('5.000');
  });

  it('huỷ phiếu nháp: không biến động tồn, không sửa được nữa', async () => {
    const product = await createProduct(t);
    const receipt = ok(
      await create([{ productId: product.id, quantity: '5', unitPrice: '1000' }]),
      201,
    );
    const cancelled = ok(
      await manager.post(`/purchases/${receipt.id}/cancel`, { version: 1, reason: 'Nhập nhầm' }),
    );
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Nhập nhầm',
      cancelledBy: { id: expect.any(String) },
    });
    fail(
      await manager.post(`/purchases/${receipt.id}/confirm`, { version: 2 }),
      409,
      'purchases.alreadyProcessed',
    );
    expect(
      await t.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.productId, product.id)),
    ).toEqual([]);
  });

  it('giá nhập trên sản phẩm đổi sau khi xác nhận không làm đổi phiếu cũ', async () => {
    const product = await createProduct(t, { purchasePrice: '1000' });
    const receipt = ok(
      await create([{ productId: product.id, quantity: '1', unitPrice: '1000' }]),
      201,
    );
    ok(await manager.post(`/purchases/${receipt.id}/confirm`, { version: 1 }));
    ok(await manager.patch(`/products/${product.id}`, { purchasePrice: '5000' }));
    const again = ok(await manager.get(`/purchases/${receipt.id}`));
    expect(again.items[0]).toMatchObject({ unitPrice: '1000.00', unitCost: '1000.0000' });
  });

  it('lọc danh sách theo nhà cung cấp, trạng thái, khoảng ngày, sản phẩm; Staff → 403', async () => {
    const product = await createProduct(t);
    const r = ok(
      await manager.post('/purchases', {
        supplierId,
        receiptDate: '2026-01-05',
        items: [{ productId: product.id, quantity: '1', unitPrice: '1' }],
      }),
      201,
    );
    const list = await manager.get(
      `/purchases?supplierId=${supplierId}&status=DRAFT&dateFrom=2026-01-01&dateTo=2026-01-31&productId=${product.id}`,
    );
    expect(ok(list).map((x: { id: string }) => x.id)).toEqual([r.id]);
    expect(ok(await manager.get(`/purchases?search=${r.code}`))).toHaveLength(1);
    fail(await staff.get('/purchases'), 403);
    fail(await staff.post('/purchases', { supplierId, receiptDate: '2026-01-01', items: [] }), 403);
  });

  it('đối soát: tồn mọi sản phẩm khớp Σ sổ cái', async () => {
    expect(await ledgerMismatches(t)).toEqual([]);
  });
});
