import { randomUUID } from 'node:crypto';
import { eq, salesOrders, sql } from '@base/db';
import { businessDate } from '@base/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fail, ok, type Client, type TestApp } from './helpers/app';
import { createCategory, createProduct, getBalance, stockIn, uniqueCode } from './helpers/commerce';
import { signedInClient } from './helpers/flows';

describe('Báo cáo & dashboard bán hàng', () => {
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

  const today = businessDate();
  const sell = async (
    items: { productId: string; quantity: string; unitPrice?: string }[],
    extra = {},
  ) =>
    ok(
      await manager.post('/sales-orders', {
        clientRequestId: randomUUID(),
        paymentMethod: 'CASH',
        confirm: true,
        items,
        ...extra,
      }),
      201,
    );
  /** Đặt thời điểm chốt đơn (kiểm tra ranh giới ngày theo giờ VN) */
  const confirmedAt = (id: string, at: string) =>
    t.db
      .update(salesOrders)
      .set({ confirmedAt: new Date(at) })
      .where(eq(salesOrders.id, id));

  it('lợi nhuận theo giá vốn bình quân lịch sử: 10×100k + 10×120k, bán 5 → giá vốn 550k', async () => {
    const category = await createCategory(t);
    const p = await createProduct(t, { categoryId: category.id, sellingPrice: '150000' });
    await stockIn(t, p.id, '10', '100000');
    await stockIn(t, p.id, '10', '120000');
    await sell([{ productId: p.id, quantity: '5' }]);
    const range = `dateFrom=${today}&dateTo=${today}&categoryId=${category.id}`;
    const profit = ok(await manager.get(`/reports/profit?${range}`));
    expect(profit).toMatchObject({
      grossSales: '750000.00',
      orderDiscounts: '0.00',
      netRevenue: '750000.00',
      costOfGoodsSold: '550000.00',
      grossProfit: '200000.00',
      marginPct: '26.67',
      orderCount: 1,
    });
    expect(profit.byDay).toEqual([
      {
        date: today,
        netRevenue: '750000.00',
        costOfGoodsSold: '550000.00',
        grossProfit: '200000.00',
      },
    ]);
    // Sửa giá nhập sản phẩm sau đó không làm đổi báo cáo kỳ cũ
    ok(await manager.patch(`/products/${p.id}`, { purchasePrice: '999999' }));
    expect(ok(await manager.get(`/reports/profit?${range}`)).costOfGoodsSold).toBe('550000.00');
  });

  it('đơn đã huỷ không tính vào doanh thu / lợi nhuận; chiết khấu đơn tách riêng', async () => {
    const category = await createCategory(t);
    const p = await createProduct(t, { categoryId: category.id, sellingPrice: '10000' });
    await stockIn(t, p.id, '10', '4000');
    await sell([{ productId: p.id, quantity: '2' }], { discountAmount: '1000' });
    const cancelled = await sell([{ productId: p.id, quantity: '3' }]);
    ok(await manager.post(`/sales-orders/${cancelled.id}/cancel`, { version: cancelled.version }));
    const profit = ok(
      await manager.get(
        `/reports/profit?dateFrom=${today}&dateTo=${today}&categoryId=${category.id}`,
      ),
    );
    expect(profit).toMatchObject({
      grossSales: '20000.00',
      orderDiscounts: '1000.00',
      netRevenue: '19000.00',
      costOfGoodsSold: '8000.00',
      grossProfit: '11000.00',
      orderCount: 1,
    });
  });

  it('doanh thu theo ngày dùng giờ Việt Nam (23:30 → ngày đó, 00:30 → ngày sau), điền đủ ngày trống', async () => {
    const category = await createCategory(t);
    const p = await createProduct(t, { categoryId: category.id, sellingPrice: '1000' });
    await stockIn(t, p.id, '10', '500');
    const a = await sell([{ productId: p.id, quantity: '1' }]);
    const b = await sell([{ productId: p.id, quantity: '2' }]);
    await confirmedAt(a.id, '2025-03-01T16:30:00Z'); // 23:30 ngày 01/03 giờ VN
    await confirmedAt(b.id, '2025-03-01T17:30:00Z'); // 00:30 ngày 02/03 giờ VN
    const daily = ok(
      await manager.get(
        `/reports/sales/daily?dateFrom=2025-02-28&dateTo=2025-03-03&categoryId=${category.id}`,
      ),
    );
    expect(
      daily.rows.map((r: { period: string; revenue: string }) => [r.period, r.revenue]),
    ).toEqual([
      ['2025-02-28', '0.00'],
      ['2025-03-01', '1000.00'],
      ['2025-03-02', '2000.00'],
      ['2025-03-03', '0.00'],
    ]);
    expect(daily.totals).toEqual({
      orderCount: 2,
      revenue: '3000.00',
      cost: '1500.00',
      grossProfit: '1500.00',
    });
    const monthly = ok(
      await manager.get(
        `/reports/sales/monthly?dateFrom=2025-02-01&dateTo=2025-04-30&categoryId=${category.id}`,
      ),
    );
    expect(
      monthly.rows.map((r: { period: string; orderCount: number }) => [r.period, r.orderCount]),
    ).toEqual([
      ['2025-02', 0],
      ['2025-03', 2],
      ['2025-04', 0],
    ]);
  });

  it('bán theo sản phẩm / bán chạy: sắp theo số lượng, doanh thu, lợi nhuận; biên lợi nhuận', async () => {
    const category = await createCategory(t);
    const a = await createProduct(t, { categoryId: category.id, sellingPrice: '10000' });
    const b = await createProduct(t, { categoryId: category.id, sellingPrice: '50000' });
    await stockIn(t, a.id, '100', '5000');
    await stockIn(t, b.id, '100', '45000');
    await sell([
      { productId: a.id, quantity: '10' },
      { productId: b.id, quantity: '3' },
    ]);
    const range = `dateFrom=${today}&dateTo=${today}&categoryId=${category.id}`;
    const byQuantity = ok(await manager.get(`/reports/sales/by-product?${range}&sortBy=quantity`));
    expect(byQuantity.map((r: { product: { id: string } }) => r.product.id)).toEqual([a.id, b.id]);
    expect(byQuantity[0]).toMatchObject({
      quantity: '10.000',
      revenue: '100000.00',
      cost: '50000.00',
      grossProfit: '50000.00',
      marginPct: '50.00',
    });
    const byRevenue = ok(await manager.get(`/reports/sales/by-product?${range}&sortBy=revenue`));
    expect(byRevenue.map((r: { product: { id: string } }) => r.product.id)).toEqual([b.id, a.id]);
    const one = await manager.get(`/reports/sales/by-product?${range}&productId=${b.id}`);
    expect(ok(one)).toHaveLength(1);
    expect(one.body.meta.total).toBe(1);
  });

  it('báo cáo nhập hàng: chỉ phiếu đã xác nhận theo ngày nhập, lọc nhà cung cấp', async () => {
    const p = await createProduct(t);
    const supplier = ok(await manager.post('/suppliers', { name: uniqueCode('NCC') }), 201);
    const make = async (date: string) =>
      ok(
        await manager.post('/purchases', {
          supplierId: supplier.id,
          receiptDate: date,
          items: [{ productId: p.id, quantity: '2', unitPrice: '1000' }],
        }),
        201,
      );
    const r1 = await make('2025-05-10');
    await make('2025-05-11'); // nháp — không tính
    ok(await manager.post(`/purchases/${r1.id}/confirm`, { version: 1 }));
    const report = ok(
      await manager.get(
        `/reports/purchases?dateFrom=2025-05-01&dateTo=2025-05-31&supplierId=${supplier.id}`,
      ),
    );
    expect(report.rows).toEqual([
      {
        receipt: { id: r1.id, code: r1.code, receiptDate: '2025-05-10' },
        supplier: { id: supplier.id, name: supplier.name },
        itemCount: 1,
        totalAmount: '2000.00',
      },
    ]);
    expect(report.totals).toEqual({ receiptCount: 1, totalAmount: '2000.00' });
  });

  it('báo cáo tồn kho: đầu kỳ + nhập − xuất = cuối kỳ; cuối kỳ hôm nay = tồn hiện tại', async () => {
    const category = await createCategory(t);
    const p = await createProduct(t, { categoryId: category.id, sellingPrice: '1000' });
    await stockIn(t, p.id, '10', '500');
    await sell([{ productId: p.id, quantity: '4' }]);
    const rows = ok(
      await manager.get(
        `/reports/inventory?dateFrom=${today}&dateTo=${today}&categoryId=${category.id}`,
      ),
    );
    expect(rows).toEqual([
      {
        product: { id: p.id, sku: p.sku, name: p.name, unit: p.unit },
        openingQty: '0.000',
        inQty: '10.000',
        outQty: '4.000',
        closingQty: '6.000',
        closingValue: '3000.00',
      },
    ]);
    expect((await getBalance(t, p.id)).quantity).toBe(rows[0].closingQty);
    const movements = ok(
      await manager.get(
        `/reports/inventory-movements?dateFrom=${today}&dateTo=${today}&productId=${p.id}`,
      ),
    );
    expect(movements.map((m: { type: string }) => m.type)).toEqual(['PURCHASE_IN', 'SALE_OUT']);
  });

  it('dashboard: số liệu hôm nay tăng đúng theo đơn bán / phiếu nhập; danh sách sắp hết, hết hàng', async () => {
    const before = ok(await manager.get('/dashboard/sales-summary'));
    const p = await createProduct(t, { sellingPrice: '20000', minStock: '5' });
    await stockIn(t, p.id, '6', '10000');
    await sell([{ productId: p.id, quantity: '2' }]);
    const after = ok(await manager.get('/dashboard/sales-summary'));
    expect(after.today.date).toBe(today);
    expect(Number(after.today.revenue) - Number(before.today.revenue)).toBe(40000);
    expect(after.today.orderCount - before.today.orderCount).toBe(1);
    expect(after.productCount - before.productCount).toBe(1);
    expect(after.lowStock.map((i: { productId: string }) => i.productId)).toContain(p.id);
    expect(after).toHaveProperty('inventoryValue');
  });

  it('khoảng ngày > 366 ngày hoặc ngược → 422; Staff không xem được báo cáo / dashboard bán hàng', async () => {
    const tooLong = fail(
      await manager.get('/reports/profit?dateFrom=2024-01-01&dateTo=2025-12-31'),
      422,
      'errors.validation',
    );
    expect(JSON.stringify(tooLong)).toContain('366');
    fail(await manager.get('/reports/profit?dateFrom=2025-02-01&dateTo=2025-01-01'), 422);
    fail(await staff.get(`/reports/profit?dateFrom=${today}&dateTo=${today}`), 403);
    fail(await staff.get('/dashboard/sales-summary'), 403);
  });
});

describe('Báo cáo: hiệu năng 1 năm dữ liệu (SC-007)', () => {
  let t: TestApp;
  let manager: Client;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
  });
  afterAll(async () => {
    await t.close();
  });

  it('~100.000 dòng đơn trong 1 năm: báo cáo lợi nhuận, theo ngày, theo sản phẩm, dashboard < 3 giây', async () => {
    const category = await createCategory(t);
    const products = await Promise.all(
      Array.from({ length: 50 }, () => createProduct(t, { categoryId: category.id })),
    );
    const ids = sql.raw(`array[${products.map((p) => `'${p.id}'::uuid`).join(',')}]`);
    // 20.000 đơn × 5 dòng, chốt rải đều năm 2024
    await t.db.execute(sql`
      with orders as (
        insert into sales_orders (code, order_date, status, subtotal, total_amount, total_cost, confirmed_at)
        select 'PERF-' || g, date '2024-01-01' + (g % 366), 'CONFIRMED', 50000, 50000, 30000,
               timestamptz '2024-01-01 03:00:00+00' + ((g % 366) || ' days')::interval
        from generate_series(1, 20000) g
        returning id
      )
      insert into sales_order_items (order_id, product_id, line_no, sku_snapshot, name_snapshot, unit_snapshot,
        quantity, list_price, unit_price, discount_amount, line_amount, allocated_order_discount, net_amount, unit_cost, cost_amount)
      select o.id, (${ids})[1 + ((row_number() over ()) % 50)], n, 'S', 'N', 'cái',
             1, 10000, 10000, 0, 10000, 0, 10000, 6000, 6000
      from orders o cross join generate_series(1, 5) n`);
    await t.db.execute(sql`analyze sales_orders; analyze sales_order_items`);

    const timed = async (path: string) => {
      const started = performance.now();
      const res = await manager.get(path);
      ok(res);
      return { ms: performance.now() - started, body: res.body.data };
    };
    const profit = await timed('/reports/profit?dateFrom=2024-01-01&dateTo=2024-12-31');
    expect(profit.body).toMatchObject({
      netRevenue: '1000000000.00',
      costOfGoodsSold: '600000000.00',
      orderCount: 20000,
    });
    const results = [
      profit,
      await timed('/reports/sales/daily?dateFrom=2024-01-01&dateTo=2024-12-31'),
      await timed('/reports/sales/monthly?dateFrom=2024-01-01&dateTo=2024-12-31'),
      await timed(
        '/reports/sales/by-product?dateFrom=2024-01-01&dateTo=2024-12-31&sortBy=quantity',
      ),
      await timed('/dashboard/sales-summary'),
    ];
    for (const r of results) expect(r.ms).toBeLessThan(3000);
  });
});
