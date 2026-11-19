import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, ok, type TestApp } from './helpers/app';
import { createProduct, getBalance, ledgerMismatches, stockIn } from './helpers/commerce';
import { signedInClient } from './helpers/flows';

/** SC-003: tồn kho không âm và không sai lệch khi nhiều đơn chốt cùng lúc (constitution VII) */
describe('Tồn kho: đồng thời', () => {
  let t: TestApp;
  let manager: Client;
  const staffClients: Client[] = [];
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
    for (let i = 0; i < 5; i++)
      staffClients.push((await signedInClient(t, { role: 'Staff' })).client);
  });
  afterAll(async () => {
    await t.close();
  });

  const sell = (client: Client, items: { productId: string; quantity: string }[]) =>
    client.post('/sales-orders', {
      clientRequestId: randomUUID(),
      paymentMethod: 'CASH',
      confirm: true,
      items,
    });

  it('50 đơn chốt đồng thời trên tồn 10 → đúng 10 thành công, tồn 0, không âm', async () => {
    const product = await createProduct(t);
    await stockIn(t, product.id, '10', '1000');
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        sell(staffClients[i % staffClients.length]!, [{ productId: product.id, quantity: '1' }]),
      ),
    );
    const succeeded = results.filter((r) => r.status === 201);
    expect(succeeded).toHaveLength(10);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(409);
      expect(r.body.error.key).toBe('sales.insufficientStock');
    }
    expect((await getBalance(t, product.id)).quantity).toBe('0.000');
    expect(await ledgerMismatches(t)).toEqual([]);
  });

  it('nhập hàng xen kẽ bán hàng đồng thời: tồn cuối = nhập − bán thành công, sổ cái khớp', async () => {
    const product = await createProduct(t);
    await stockIn(t, product.id, '5', '1000');
    const supplier = ok(
      await manager.post('/suppliers', { name: `NCC ${randomUUID().slice(0, 6)}` }),
      201,
    );
    const receipts = await Promise.all(
      Array.from({ length: 5 }, async () =>
        ok(
          await manager.post('/purchases', {
            supplierId: supplier.id,
            receiptDate: '2026-11-19',
            items: [{ productId: product.id, quantity: '2', unitPrice: '1500' }],
          }),
          201,
        ),
      ),
    );
    const results = await Promise.all([
      ...receipts.map((r) => manager.post(`/purchases/${r.id}/confirm`, { version: 1 })),
      ...Array.from({ length: 20 }, (_, i) =>
        sell(staffClients[i % staffClients.length]!, [{ productId: product.id, quantity: '1' }]),
      ),
    ]);
    const confirmed = results.slice(0, 5).filter((r) => r.status === 200).length;
    const sold = results.slice(5).filter((r) => r.status === 201).length;
    expect(confirmed).toBe(5);
    const balance = await getBalance(t, product.id);
    expect(Number(balance.quantity)).toBe(5 + confirmed * 2 - sold);
    expect(Number(balance.quantity)).toBeGreaterThanOrEqual(0);
    expect(await ledgerMismatches(t)).toEqual([]);
  });

  it('nhiều đơn nhiều sản phẩm đảo thứ tự dòng: không deadlock, tồn chính xác', async () => {
    const a = await createProduct(t);
    const b = await createProduct(t);
    const c = await createProduct(t);
    for (const p of [a, b, c]) await stockIn(t, p.id, '100', '1000');
    const orders = [
      [a, b, c],
      [c, b, a],
      [b, a, c],
      [c, a, b],
    ];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sell(
          staffClients[i % staffClients.length]!,
          orders[i % orders.length]!.map((p) => ({ productId: p.id, quantity: '1' })),
        ),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    for (const p of [a, b, c]) expect((await getBalance(t, p.id)).quantity).toBe('80.000');
  });
});
