import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fail, ok, type Client, type TestApp } from './helpers/app';
import {
  createCategory,
  createProduct,
  getBalance,
  ledgerMismatches,
  stockIn,
  uniqueCode,
} from './helpers/commerce';
import { signedInClient } from './helpers/flows';

describe('Tồn kho: danh sách, sổ biến động, điều chỉnh', () => {
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

  const adjust = (body: Record<string, unknown>) =>
    manager.post('/inventory/adjustments', { clientRequestId: randomUUID(), ...body });

  it('danh sách tồn: lọc sắp hết / hết hàng, tổng hợp; Staff không thấy giá trị', async () => {
    const category = await createCategory(t);
    const tag = uniqueCode('INV');
    const low = await createProduct(t, {
      sku: `${tag}-L`,
      categoryId: category.id,
      minStock: '10',
    });
    const out = await createProduct(t, {
      sku: `${tag}-O`,
      categoryId: category.id,
      minStock: '10',
    });
    const ok1 = await createProduct(t, {
      sku: `${tag}-K`,
      categoryId: category.id,
      minStock: '10',
    });
    await stockIn(t, low.id, '4', '1000');
    await stockIn(t, ok1.id, '20', '2500');

    const lowList = ok(await manager.get(`/inventory?categoryId=${category.id}&stockState=LOW`));
    expect(
      lowList.map((i: { productId: string; state: string }) => [i.productId, i.state]),
    ).toEqual([[low.id, 'LOW']]);
    expect(
      ok(await manager.get(`/inventory?search=${tag}&stockState=OUT`)).map(
        (i: { productId: string }) => i.productId,
      ),
    ).toEqual([out.id]);
    const sorted = ok(
      await manager.get(`/inventory?categoryId=${category.id}&sortBy=value&sortOrder=desc`),
    );
    expect(sorted[0]).toMatchObject({
      productId: ok1.id,
      quantity: '20.000',
      value: '50000.00',
      avgCost: '2500.0000',
    });

    const summary = ok(await manager.get(`/inventory/summary?categoryId=${category.id}`));
    expect(summary).toEqual({
      totalQuantity: '24.000',
      totalValue: '54000.00',
      lowCount: 1,
      outCount: 1,
    });
    const staffSummary = ok(await staff.get(`/inventory/summary?categoryId=${category.id}`));
    expect(staffSummary).not.toHaveProperty('totalValue');
    const staffList = ok(await staff.get(`/inventory?categoryId=${category.id}`));
    expect(staffList[0]).not.toHaveProperty('value');
    expect(staffList[0]).not.toHaveProperty('avgCost');
  });

  it('điều chỉnh giảm do hư hỏng: tồn giảm, sổ cái ghi lý do, ghi chú, người thực hiện; giá vốn không đổi', async () => {
    const p = await createProduct(t);
    await stockIn(t, p.id, '5', '1000');
    const res = await adjust({
      reason: 'DAMAGED',
      note: 'Vỡ khi vận chuyển',
      items: [{ productId: p.id, quantityChange: '-2' }],
    });
    const adjustment = ok(res, 201);
    expect(adjustment.code).toMatch(/^DC-\d{8}-\d{4}$/);
    expect(adjustment).toMatchObject({
      reason: 'DAMAGED',
      note: 'Vỡ khi vận chuyển',
      itemCount: 1,
    });
    expect(adjustment.items[0]).toMatchObject({
      quantityBefore: '5.000',
      quantityChange: '-2.000',
      quantityAfter: '3.000',
      countedQuantity: null,
      unitCost: '1000.0000',
    });
    expect(await getBalance(t, p.id)).toEqual({ quantity: '3.000', avgCost: '1000.0000' });
    const moves = ok(
      await manager.get(`/inventory/movements?productId=${p.id}&type=ADJUSTMENT_OUT`),
    );
    expect(moves[0]).toMatchObject({
      reason: 'DAMAGED',
      note: 'Vỡ khi vận chuyển',
      quantityChange: '-2.000',
      ref: { type: 'INVENTORY_ADJUSTMENT', code: adjustment.code },
      createdBy: { id: expect.any(String) },
    });
  });

  it('không cho tồn âm: giảm quá tồn → 409 kèm details', async () => {
    const p = await createProduct(t);
    await stockIn(t, p.id, '5', '1000');
    const error = fail(
      await adjust({ reason: 'LOST', items: [{ productId: p.id, quantityChange: '-6' }] }),
      409,
      'inventory.negativeStock',
    );
    expect(error).toMatchObject({ params: { sku: p.sku, available: '5.000', requested: '6.000' } });
    expect((await getBalance(t, p.id)).quantity).toBe('5.000');
  });

  it('kiểm kê: nhập số đếm thực tế, hệ thống tính chênh lệch (+ và −) trong một phiếu', async () => {
    const a = await createProduct(t);
    const b = await createProduct(t);
    await stockIn(t, a.id, '5', '1000');
    await stockIn(t, b.id, '10', '1000');
    const adjustment = ok(
      await adjust({
        reason: 'STOCKTAKE',
        items: [
          { productId: a.id, countedQuantity: '8' },
          { productId: b.id, countedQuantity: '7' },
        ],
      }),
      201,
    );
    const byProduct = Object.fromEntries(
      adjustment.items.map(
        (i: { product: { id: string }; quantityChange: string; countedQuantity: string }) => [
          i.product.id,
          [i.quantityChange, i.countedQuantity],
        ],
      ),
    );
    expect(byProduct[a.id]).toEqual(['3.000', '8.000']);
    expect(byProduct[b.id]).toEqual(['-3.000', '7.000']);
    expect((await getBalance(t, a.id)).quantity).toBe('8.000');
    expect((await getBalance(t, b.id)).quantity).toBe('7.000');
    const types = ok(await manager.get(`/inventory/movements?search=${adjustment.code}`)).map(
      (m: { type: string }) => m.type,
    );
    expect(types.sort()).toEqual(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']);
  });

  it('kiểm kê bằng tồn hiện tại → 422 noChange; thiếu lý do / "Khác" không ghi chú / sai trường → 422', async () => {
    const p = await createProduct(t);
    await stockIn(t, p.id, '5', '1000');
    fail(
      await adjust({ reason: 'STOCKTAKE', items: [{ productId: p.id, countedQuantity: '5' }] }),
      422,
      'inventory.noChange',
    );
    fail(
      await adjust({ items: [{ productId: p.id, quantityChange: '1' }] }),
      422,
      'errors.validation',
    );
    const noNote = fail(
      await adjust({ reason: 'OTHER', items: [{ productId: p.id, quantityChange: '1' }] }),
      422,
      'errors.validation',
    );
    expect(JSON.stringify(noNote)).toContain('note');
    fail(
      await adjust({ reason: 'STOCKTAKE', items: [{ productId: p.id, quantityChange: '1' }] }),
      422,
      'errors.validation',
    );
    fail(
      await adjust({ reason: 'DAMAGED', items: [{ productId: p.id, quantityChange: '0' }] }),
      422,
      'errors.validation',
    );
    fail(
      await adjust({
        reason: 'DAMAGED',
        items: [
          { productId: p.id, quantityChange: '-1' },
          { productId: p.id, quantityChange: '-1' },
        ],
      }),
      422,
      'errors.validation',
    );
    expect((await getBalance(t, p.id)).quantity).toBe('5.000');
  });

  it('idempotent: gửi lại cùng clientRequestId trả về phiếu cũ (200), không điều chỉnh 2 lần', async () => {
    const p = await createProduct(t);
    await stockIn(t, p.id, '5', '1000');
    const body = {
      clientRequestId: randomUUID(),
      reason: 'LOST',
      items: [{ productId: p.id, quantityChange: '-1' }],
    };
    const first = await manager.post('/inventory/adjustments', body);
    const again = await manager.post('/inventory/adjustments', body);
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect((await getBalance(t, p.id)).quantity).toBe('4.000');
  });

  it('điều chỉnh tăng sản phẩm ngừng kinh doanh vẫn được; lọc danh sách phiếu theo lý do, mã', async () => {
    const p = await createProduct(t, { status: 'INACTIVE' });
    const adjustment = ok(
      await adjust({
        reason: 'OTHER',
        note: 'Tìm thấy hàng',
        items: [{ productId: p.id, quantityChange: '2' }],
      }),
      201,
    );
    const list = ok(
      await manager.get(`/inventory/adjustments?reason=OTHER&search=${adjustment.code}`),
    );
    expect(list.map((a: { id: string }) => a.id)).toEqual([adjustment.id]);
    const detail = ok(await manager.get(`/inventory/adjustments/${adjustment.id}`));
    expect(detail.items[0].product.id).toBe(p.id);
  });

  it('Staff xem tồn + sổ biến động (không giá vốn) nhưng không điều chỉnh / xem phiếu điều chỉnh', async () => {
    const p = await createProduct(t);
    await stockIn(t, p.id, '1', '1000');
    const moves = ok(await staff.get(`/inventory/movements?productId=${p.id}`));
    expect(moves[0]).not.toHaveProperty('unitCost');
    fail(await staff.get('/inventory/adjustments'), 403);
    fail(
      await staff.post('/inventory/adjustments', {
        clientRequestId: randomUUID(),
        reason: 'LOST',
        items: [{ productId: p.id, quantityChange: '-1' }],
      }),
      403,
    );
  });

  it('không có API sửa tồn trực tiếp; sau mọi thao tác Σ sổ cái = tồn hiện tại (SC-004)', async () => {
    const p = await createProduct(t);
    fail(await manager.patch(`/inventory/${p.id}`, { quantity: '100' }), 404);
    fail(await manager.put(`/inventory/${p.id}`, { quantity: '100' }), 404);
    expect(await ledgerMismatches(t)).toEqual([]);
  });
});
