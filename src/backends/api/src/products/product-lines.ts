import { inArray, products, type Product } from '@base/db';
import { decimal, isInteger, notFound, QUANTITY_SCALE, unprocessable } from '@base/server-kit';
import type { DbOrTx } from '../core/database';

/**
 * Nạp và kiểm tra sản phẩm cho dòng chứng từ (nhập hàng, bán hàng, điều chỉnh tồn): tồn tại,
 * (tuỳ chọn) đang kinh doanh, số lượng nguyên với sản phẩm không cho số lẻ.
 * Lỗi kèm `details` theo sản phẩm để giao diện đánh dấu đúng dòng.
 */
export async function loadProductsForDocument(
  db: DbOrTx,
  lines: { productId: string; quantity: string }[],
  options: { requireActive: boolean },
): Promise<Map<string, Product>> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const rows = await db.select().from(products).where(inArray(products.id, ids));
  const byId = new Map(rows.map((p) => [p.id, p]));
  if (ids.some((id) => !byId.has(id))) throw notFound('products.notFound');

  const inactive = options.requireActive ? rows.filter((p) => p.status !== 'ACTIVE') : [];
  if (inactive.length) {
    throw unprocessable(
      'products.inactive',
      { sku: inactive[0]!.sku },
      inactive.map((p) => ({ productId: p.id, sku: p.sku })),
    );
  }
  const fractional = lines.filter(
    (l) =>
      !byId.get(l.productId)!.allowDecimalQuantity &&
      !isInteger(decimal(l.quantity, QUANTITY_SCALE)),
  );
  if (fractional.length) {
    const first = byId.get(fractional[0]!.productId)!;
    throw unprocessable(
      'inventory.decimalNotAllowed',
      { sku: first.sku },
      fractional.map((l) => ({ productId: l.productId, sku: byId.get(l.productId)!.sku })),
    );
  }
  return byId;
}
