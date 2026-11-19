import { randomUUID } from 'node:crypto';
import { eq, inventoryMovements, salesOrders, sql } from '@base/db';
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

describe('Bán hàng: tạo đơn, chốt, thanh toán, huỷ', () => {
  let t: TestApp;
  let manager: Client;
  let staff: Client;
  let staff2: Client;
  let staffId: string;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
    const s = await signedInClient(t, { role: 'Staff' });
    staff = s.client;
    staffId = s.user.id;
    staff2 = (await signedInClient(t, { role: 'Staff' })).client;
  });
  afterAll(async () => {
    await t.close();
  });

  /** Sản phẩm có sẵn tồn với giá vốn cho trước */
  async function stocked(quantity = '10', cost = '20000', price = '30000') {
    const product = await createProduct(t, { sellingPrice: price });
    await stockIn(t, product.id, quantity, cost);
    return product;
  }

  const order = (items: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
    clientRequestId: randomUUID(),
    paymentMethod: 'CASH',
    items,
    ...extra,
  });

  it('chốt đơn: trừ tồn, lưu giá bán + giá vốn lúc chốt, sổ cái SALE_OUT, mã DH-…', async () => {
    const p = await stocked('10', '20000', '30000');
    const res = await staff.post(
      '/sales-orders',
      order([{ productId: p.id, quantity: '3' }], {
        confirm: true,
        markPaid: true,
        customerName: 'Chị Lan',
      }),
    );
    const sold = ok(res, 201);
    expect(sold).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
      totalAmount: '90000.00',
      customerName: 'Chị Lan',
      createdBy: { id: staffId },
    });
    expect(sold.code).toMatch(/^DH-\d{8}-\d{4}$/);
    expect(sold.paidAt).toBeTruthy();
    expect(sold.items[0]).toMatchObject({
      sku: p.sku,
      listPrice: '30000.00',
      unitPrice: '30000.00',
      netAmount: '90000.00',
    });
    // Staff không thấy giá vốn; Manager thấy
    expect(sold.items[0]).not.toHaveProperty('unitCost');
    expect(sold).not.toHaveProperty('totalCost');
    const managed = ok(await manager.get(`/sales-orders/${sold.id}`));
    expect(managed).toMatchObject({ totalCost: '60000.00' });
    expect(managed.items[0]).toMatchObject({ unitCost: '20000.0000', costAmount: '60000.00' });
    expect((await getBalance(t, p.id)).quantity).toBe('7.000');
    const [move] = await t.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.refId, sold.id));
    expect(move).toMatchObject({ type: 'SALE_OUT', quantityChange: '-3.000', refCode: sold.code });
  });

  it('đơn nháp không đổi tồn; mở lại, sửa, chốt sau; chốt lần 2 → 409', async () => {
    const p = await stocked('5');
    const draft = ok(
      await staff.post('/sales-orders', order([{ productId: p.id, quantity: '1' }])),
      201,
    );
    expect(draft).toMatchObject({ status: 'DRAFT', paymentStatus: 'UNPAID', version: 1 });
    expect((await getBalance(t, p.id)).quantity).toBe('5.000');
    const edited = ok(
      await staff.patch(`/sales-orders/${draft.id}`, {
        version: 1,
        paymentMethod: 'BANK_TRANSFER',
        items: [{ productId: p.id, quantity: '2' }],
      }),
    );
    expect(edited).toMatchObject({
      version: 2,
      totalAmount: '60000.00',
      paymentMethod: 'BANK_TRANSFER',
    });
    const confirmed = ok(await staff.post(`/sales-orders/${draft.id}/confirm`, { version: 2 }));
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'UNPAID' });
    expect((await getBalance(t, p.id)).quantity).toBe('3.000');
    fail(
      await staff.post(`/sales-orders/${draft.id}/confirm`, { version: 3 }),
      409,
      'sales.alreadyProcessed',
    );
    fail(
      await staff.patch(`/sales-orders/${draft.id}`, {
        version: 3,
        paymentMethod: 'CASH',
        items: [{ productId: p.id, quantity: '1' }],
      }),
      409,
      'sales.notDraft',
    );
  });

  it('thiếu hàng: 409 kèm details theo sản phẩm, không trừ tồn, đơn vẫn là nháp', async () => {
    const a = await stocked('5');
    const b = await stocked('2');
    const draft = ok(
      await staff.post(
        '/sales-orders',
        order([
          { productId: a.id, quantity: '1' },
          { productId: b.id, quantity: '5' },
        ]),
      ),
      201,
    );
    const error = fail(
      await staff.post(`/sales-orders/${draft.id}/confirm`, { version: 1 }),
      409,
      'sales.insufficientStock',
    );
    expect(error).toMatchObject({ params: { sku: b.sku, requested: '5.000', available: '2.000' } });
    expect((error as unknown as { details: unknown[] }).details).toEqual([
      { productId: b.id, sku: b.sku, name: b.name, requested: '5.000', available: '2.000' },
    ]);
    expect((await getBalance(t, a.id)).quantity).toBe('5.000');
    expect(ok(await staff.get(`/sales-orders/${draft.id}`)).status).toBe('DRAFT');
    // Tạo + chốt một bước thiếu hàng: không tạo đơn nào
    const requestId = randomUUID();
    fail(
      await staff.post(
        '/sales-orders',
        order([{ productId: b.id, quantity: '3' }], { confirm: true, clientRequestId: requestId }),
      ),
      409,
      'sales.insufficientStock',
    );
    const created = await t.db
      .select()
      .from(salesOrders)
      .where(eq(salesOrders.clientRequestId, requestId));
    expect(created).toEqual([]);
  });

  it('idempotent: gửi lại cùng clientRequestId trả về đơn cũ (200), không trừ tồn 2 lần', async () => {
    const p = await stocked('10');
    const body = order([{ productId: p.id, quantity: '2' }], { confirm: true });
    const first = await staff.post('/sales-orders', body);
    const again = await staff.post('/sales-orders', body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect((await getBalance(t, p.id)).quantity).toBe('8.000');
    // Gửi song song
    const parallel = order([{ productId: p.id, quantity: '1' }], { confirm: true });
    const results = await Promise.all([
      staff.post('/sales-orders', parallel),
      staff.post('/sales-orders', parallel),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((await getBalance(t, p.id)).quantity).toBe('7.000');
  });

  it('giá khác niêm yết: Staff → 403; Manager được; chiết khấu dòng + đơn phân bổ đúng', async () => {
    const p = await stocked('10', '1000', '10000');
    fail(
      await staff.post(
        '/sales-orders',
        order([{ productId: p.id, quantity: '1', unitPrice: '9000' }]),
      ),
      403,
      'sales.priceOverrideForbidden',
    );
    const sold = ok(
      await manager.post(
        '/sales-orders',
        order(
          [
            { productId: p.id, quantity: '1', unitPrice: '9000', discountAmount: '1000' },
            { productId: p.id, quantity: '2' },
          ],
          { discountAmount: '1000', confirm: true },
        ),
      ),
      201,
    );
    expect(sold).toMatchObject({
      subtotal: '28000.00',
      discountAmount: '1000.00',
      totalAmount: '27000.00',
    });
    expect(
      sold.items.map((i: { listPrice: string; netAmount: string }) => [i.listPrice, i.netAmount]),
    ).toEqual([
      ['10000.00', '7714.29'],
      ['10000.00', '19285.71'],
    ]);
  });

  it('sản phẩm ngừng kinh doanh trong giỏ: chốt bị từ chối chỉ rõ sản phẩm', async () => {
    const p = await stocked('5');
    const draft = ok(
      await staff.post('/sales-orders', order([{ productId: p.id, quantity: '1' }])),
      201,
    );
    ok(await manager.patch(`/products/${p.id}`, { status: 'INACTIVE' }));
    const error = fail(
      await staff.post(`/sales-orders/${draft.id}/confirm`, { version: 1 }),
      422,
      'products.inactive',
    );
    expect(error.message).toContain(p.sku);
  });

  it('thanh toán sau khi chốt: một chiều; nháp → 409', async () => {
    const p = await stocked('5');
    const draft = ok(
      await staff.post('/sales-orders', order([{ productId: p.id, quantity: '1' }])),
      201,
    );
    fail(await staff.post(`/sales-orders/${draft.id}/pay`, {}), 409, 'sales.notConfirmed');
    ok(await staff.post(`/sales-orders/${draft.id}/confirm`, { version: 1 }));
    const paid = ok(
      await staff.post(`/sales-orders/${draft.id}/pay`, { paymentMethod: 'BANK_TRANSFER' }),
    );
    expect(paid).toMatchObject({
      paymentStatus: 'PAID',
      paymentMethod: 'BANK_TRANSFER',
      paidBy: { id: staffId },
    });
    fail(await staff.post(`/sales-orders/${draft.id}/pay`, {}), 409, 'sales.alreadyPaid');
  });

  it('huỷ đơn đã chốt: Staff → 403; Manager huỷ → cộng lại tồn, sổ SALE_CANCEL_IN, huỷ lần 2 → 409', async () => {
    const p = await stocked('10', '20000');
    const sold = ok(
      await staff.post(
        '/sales-orders',
        order([{ productId: p.id, quantity: '4' }], { confirm: true }),
      ),
      201,
    );
    fail(
      await staff.post(`/sales-orders/${sold.id}/cancel`, { version: sold.version }),
      403,
      'sales.cancelForbidden',
    );
    const cancelled = ok(
      await manager.post(`/sales-orders/${sold.id}/cancel`, {
        version: sold.version,
        reason: 'Khách trả hàng',
      }),
    );
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Khách trả hàng' });
    expect(await getBalance(t, p.id)).toEqual({ quantity: '10.000', avgCost: '20000.0000' });
    const moves = await t.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.refId, sold.id));
    expect(moves.map((m) => m.type).sort()).toEqual(['SALE_CANCEL_IN', 'SALE_OUT']);
    fail(
      await manager.post(`/sales-orders/${sold.id}/cancel`, { version: cancelled.version }),
      409,
      'sales.alreadyCancelled',
    );
  });

  it('huỷ đơn khi sản phẩm đã ngừng kinh doanh vẫn cộng lại tồn', async () => {
    const p = await stocked('3');
    const sold = ok(
      await staff.post(
        '/sales-orders',
        order([{ productId: p.id, quantity: '3' }], { confirm: true }),
      ),
      201,
    );
    ok(await manager.patch(`/products/${p.id}`, { status: 'INACTIVE' }));
    ok(await manager.post(`/sales-orders/${sold.id}/cancel`, { version: sold.version }));
    expect((await getBalance(t, p.id)).quantity).toBe('3.000');
  });

  it('Staff huỷ được đơn nháp của mình, không thấy đơn người khác (404)', async () => {
    const p = await stocked('3');
    const mine = ok(
      await staff.post('/sales-orders', order([{ productId: p.id, quantity: '1' }])),
      201,
    );
    fail(await staff2.get(`/sales-orders/${mine.id}`), 404, 'sales.notFound');
    fail(
      await staff2.post(`/sales-orders/${mine.id}/cancel`, { version: 1 }),
      404,
      'sales.notFound',
    );
    fail(
      await staff2.post(`/sales-orders/${mine.id}/confirm`, { version: 1 }),
      404,
      'sales.notFound',
    );
    ok(await staff.post(`/sales-orders/${mine.id}/cancel`, { version: 1 }));
  });

  it('lịch sử: Staff chỉ thấy đơn mình; Manager thấy tất cả và lọc theo người tạo, trạng thái, ngày, SĐT', async () => {
    const p = await stocked('20');
    const phone = `09${Math.floor(Math.random() * 1e8)}`;
    const a = ok(
      await staff.post(
        '/sales-orders',
        order([{ productId: p.id, quantity: '1' }], { customerPhone: phone, confirm: true }),
      ),
      201,
    );
    const b = ok(
      await staff2.post(
        '/sales-orders',
        order([{ productId: p.id, quantity: '1' }], { customerPhone: phone }),
      ),
      201,
    );
    const staffList = ok(await staff.get(`/sales-orders?search=${phone}`));
    expect(staffList.map((o: { id: string }) => o.id)).toEqual([a.id]);
    const all = ok(await manager.get(`/sales-orders?search=${phone}`));
    expect(all.map((o: { id: string }) => o.id).sort()).toEqual([a.id, b.id].sort());
    expect(
      ok(await manager.get(`/sales-orders?search=${phone}&createdById=${staffId}`)),
    ).toHaveLength(1);
    expect(
      ok(await manager.get(`/sales-orders?search=${phone}&status=DRAFT`)).map(
        (o: { id: string }) => o.id,
      ),
    ).toEqual([b.id]);
    expect(ok(await manager.get(`/sales-orders?search=${phone}&mine=true`))).toHaveLength(0);
    const today = a.orderDate;
    expect(
      ok(await manager.get(`/sales-orders?search=${phone}&dateFrom=${today}&dateTo=${today}`)),
    ).toHaveLength(2);
    expect(ok(await manager.get(`/sales-orders?search=${a.code}`))).toHaveLength(1);
  });

  it('người dùng tự đăng ký (role User) không gọi được API bán hàng', async () => {
    const { client } = await signedInClient(t);
    fail(await client.get('/sales-orders'), 403);
    fail(await client.post('/sales-orders', order([])), 403);
  });

  it('x-lang: en → thông báo thiếu hàng tiếng Anh, params giữ nguyên', async () => {
    const p = await stocked('1');
    const res = await staff.post(
      '/sales-orders',
      order([{ productId: p.id, quantity: '2' }], { confirm: true }),
      {
        'x-lang': 'en',
      },
    );
    const error = fail(res, 409, 'sales.insufficientStock');
    expect(error.message).toBe(`Insufficient stock for ${p.sku}: requested 2.000, available 1.000`);
  });

  it('đối soát: tồn mọi sản phẩm khớp Σ sổ cái', async () => {
    expect(await ledgerMismatches(t)).toEqual([]);
  });
});

describe('Tra cứu sản phẩm cho bán hàng', () => {
  let t: TestApp;
  let staff: Client;
  beforeAll(async () => {
    t = await createTestApp();
    staff = (await signedInClient(t, { role: 'Staff' })).client;
  });
  afterAll(async () => {
    await t.close();
  });

  it('tìm theo SKU trong 10.000 sản phẩm dưới 1 giây (SC-002), chỉ sản phẩm đang kinh doanh', async () => {
    const category = await createCategory(t);
    const tag = uniqueCode('PERF').replace('-', '');
    await t.db.execute(sql`
      with inserted as (
        insert into products (sku, name, category_id, unit, selling_price, status)
        select ${tag} || '-' || g, 'Sản phẩm ' || g, ${category.id}::uuid, 'cái', 10000,
               (case when g % 10 = 0 then 'INACTIVE' else 'ACTIVE' end)::product_status
        from generate_series(1, 10000) g
        returning id
      )
      insert into inventory_balances (product_id) select id from inserted`);
    await t.db.execute(sql`analyze products`);
    const started = performance.now();
    const res = await staff.get(`/products?search=${tag}-99&status=ACTIVE&pageSize=20`);
    const elapsed = performance.now() - started;
    const items = ok(res);
    // 99, 990..999 (bỏ 990), 9900..9999 (bỏ bội số 10) đều khớp tiền tố
    expect(res.body.meta.total).toBe(1 + 9 + 90);
    expect(items.every((p: { status: string }) => p.status === 'ACTIVE')).toBe(true);
    expect(items[0]).not.toHaveProperty('avgCost');
    expect(elapsed).toBeLessThan(1000);
  });
});
