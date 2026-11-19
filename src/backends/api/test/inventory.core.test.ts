import { randomUUID } from 'node:crypto';
import { eq, inventoryMovements, products } from '@base/db';
import { AppError, COST_SCALE, decimal, QUANTITY_SCALE } from '@base/server-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentCodeService } from '../src/inventory/document-code.service';
import { InventoryService, type StockChange } from '../src/inventory/inventory.service';
import { createTestApp, type TestApp } from './helpers/app';
import {
  createProduct,
  getBalance,
  ledgerMismatches,
  ledgerSum,
  stockIn,
} from './helpers/commerce';

const q = (v: string) => decimal(v, QUANTITY_SCALE);
const c = (v: string) => decimal(v, COST_SCALE);

describe('Tồn kho (lõi): InventoryService & DocumentCodeService', () => {
  let t: TestApp;
  let inventory: InventoryService;
  beforeAll(async () => {
    t = await createTestApp();
    inventory = t.app.get(InventoryService);
  });
  afterAll(async () => {
    await t.close();
  });

  const out = (changes: StockChange[], shortageKey?: 'sales.insufficientStock') =>
    t.db.transaction((tx) =>
      inventory.apply(
        tx,
        {
          type: 'SALE_OUT',
          refType: 'SALES_ORDER',
          refId: randomUUID(),
          refCode: 'TEST-OUT',
          userId: null,
          shortageKey,
        },
        changes,
      ),
    );

  it('sinh mã chứng từ liên tiếp, không trùng khi gọi đồng thời', async () => {
    const codes = t.app.get(DocumentCodeService);
    const prefix = `Z${Math.floor(Math.random() * 1000)}`;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => t.db.transaction((tx) => codes.next(tx, prefix))),
    );
    expect(new Set(results).size).toBe(20);
    const numbers = results.map((code) => Number(code.split('-').at(-1))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(results[0]).toMatch(new RegExp(`^${prefix}-\\d{8}-\\d{4}$`));
  });

  it('nhập vào tồn 0: giá vốn bình quân = giá nhập; nhập thêm giá khác: bình quân gia quyền', async () => {
    const product = await createProduct(t);
    await stockIn(t, product.id, '10', '100000');
    expect(await getBalance(t, product.id)).toEqual({ quantity: '10.000', avgCost: '100000.0000' });
    await stockIn(t, product.id, '10', '120000');
    expect(await getBalance(t, product.id)).toEqual({ quantity: '20.000', avgCost: '110000.0000' });
  });

  it('xuất kho: giá vốn ghi theo bình quân hiện tại, bình quân không đổi, đánh dấu sản phẩm có giao dịch', async () => {
    const product = await createProduct(t);
    await stockIn(t, product.id, '3', '10000');
    await stockIn(t, product.id, '1', '20000');
    const [moved] = await out([{ productId: product.id, quantity: q('-2') }]);
    expect(moved).toMatchObject({
      quantityBefore: '4.000',
      quantityAfter: '2.000',
      unitCost: '12500.0000',
      avgCostAfter: '12500.0000',
    });
    const [row] = await t.db.select().from(products).where(eq(products.id, product.id));
    expect(row!.hasTransactions).toBe(true);
  });

  it('xuất quá tồn: lỗi kèm details theo sản phẩm, không ghi gì', async () => {
    const a = await createProduct(t);
    const b = await createProduct(t);
    await stockIn(t, a.id, '5', '1000');
    await stockIn(t, b.id, '1', '1000');
    const error = await out(
      [
        { productId: a.id, quantity: q('-2') },
        { productId: b.id, quantity: q('-3') },
      ],
      'sales.insufficientStock',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      status: 409,
      key: 'sales.insufficientStock',
      params: { sku: b.sku, requested: '3.000', available: '1.000' },
    });
    expect((error as AppError).details).toEqual([
      { productId: b.id, sku: b.sku, name: b.name, requested: '3.000', available: '1.000' },
    ]);
    expect((await getBalance(t, a.id)).quantity).toBe('5.000');
    expect((await getBalance(t, b.id)).quantity).toBe('1.000');
  });

  it('kiểm tra thiếu hàng trên tổng các dòng cùng sản phẩm', async () => {
    const product = await createProduct(t);
    await stockIn(t, product.id, '3', '1000');
    await expect(
      out([
        { productId: product.id, quantity: q('-2') },
        { productId: product.id, quantity: q('-2') },
      ]),
    ).rejects.toMatchObject({ key: 'inventory.negativeStock', params: { requested: '4.000' } });
  });

  it('sản phẩm không cho số lẻ: từ chối số lượng lẻ (422); sản phẩm cho số lẻ: nhận 3 chữ số', async () => {
    const whole = await createProduct(t);
    await expect(stockIn(t, whole.id, '1.5', '1000')).rejects.toMatchObject({
      status: 422,
      key: 'inventory.decimalNotAllowed',
    });
    const weighed = await createProduct(t, { allowDecimalQuantity: true });
    await stockIn(t, weighed.id, '1.255', '20000');
    expect((await getBalance(t, weighed.id)).quantity).toBe('1.255');
  });

  it('huỷ bán: cộng lại theo giá vốn đã lưu, bình quân tính lại nhất quán', async () => {
    const product = await createProduct(t);
    await stockIn(t, product.id, '10', '100');
    await out([{ productId: product.id, quantity: q('-4') }]);
    await stockIn(t, product.id, '6', '200'); // tồn 12, bình quân (6×100 + 6×200)/12 = 150
    expect((await getBalance(t, product.id)).avgCost).toBe('150.0000');
    // Huỷ đơn bán 4 cái đã chốt ở giá vốn 100: (12×150 + 4×100)/16 = 137.5
    await t.db.transaction((tx) =>
      inventory.apply(
        tx,
        {
          type: 'SALE_CANCEL_IN',
          refType: 'SALES_ORDER',
          refId: randomUUID(),
          refCode: 'X',
          userId: null,
        },
        [{ productId: product.id, quantity: q('4'), unitCost: c('100') }],
      ),
    );
    expect(await getBalance(t, product.id)).toEqual({ quantity: '16.000', avgCost: '137.5000' });
  });

  it('sổ cái: mỗi dòng ghi trước/sau, Σ biến động = tồn hiện tại', async () => {
    const product = await createProduct(t);
    await stockIn(t, product.id, '7', '10');
    await out([{ productId: product.id, quantity: q('-3') }]);
    await stockIn(t, product.id, '2', '10');
    const rows = await t.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.productId, product.id));
    expect(rows.map((r) => [r.quantityBefore, r.quantityChange, r.quantityAfter])).toEqual([
      ['0.000', '7.000', '7.000'],
      ['7.000', '-3.000', '4.000'],
      ['4.000', '2.000', '6.000'],
    ]);
    expect(await ledgerSum(t, product.id)).toBe('6.000');
    expect(await ledgerMismatches(t)).toEqual([]);
  });

  it('hai giao dịch khoá đảo thứ tự sản phẩm không deadlock', async () => {
    const a = await createProduct(t);
    const b = await createProduct(t);
    await stockIn(t, a.id, '100', '1');
    await stockIn(t, b.id, '100', '1');
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        out(
          i % 2
            ? [
                { productId: a.id, quantity: q('-1') },
                { productId: b.id, quantity: q('-1') },
              ]
            : [
                { productId: b.id, quantity: q('-1') },
                { productId: a.id, quantity: q('-1') },
              ],
        ),
      ),
    );
    expect((await getBalance(t, a.id)).quantity).toBe('90.000');
    expect((await getBalance(t, b.id)).quantity).toBe('90.000');
  });
});
