import {
  allocate,
  cmp,
  COST_SCALE,
  decimal,
  decimalToString,
  div,
  isNegative,
  isZero,
  MONEY_SCALE,
  mul,
  QUANTITY_SCALE,
  sub,
  sum,
  unprocessable,
  type Decimal,
} from '@base/server-kit';

/*
 * Tính tiền chứng từ (phiếu nhập, đơn bán) — hàm thuần, chính xác thập phân, dùng chung để
 * frontend chỉ "xem trước" còn số liệu cuối cùng luôn do backend tính (constitution IV).
 * data-model.md § Quy tắc tính toán.
 */

export interface LineInput {
  quantity: string;
  unitPrice: string;
  discountAmount: string;
}

export interface PricedLine {
  quantity: Decimal;
  unitPrice: Decimal;
  discountAmount: Decimal;
  /** quantity × unitPrice − discountAmount (làm tròn tới đồng xu) */
  lineAmount: Decimal;
}

export interface PricedDocument {
  lines: PricedLine[];
  subtotal: Decimal;
  discountAmount: Decimal;
  totalAmount: Decimal;
}

export function priceDocument(lines: LineInput[], documentDiscount: string): PricedDocument {
  const priced = lines.map((line, index): PricedLine => {
    const quantity = decimal(line.quantity, QUANTITY_SCALE);
    const unitPrice = decimal(line.unitPrice, MONEY_SCALE);
    const discountAmount = decimal(line.discountAmount, MONEY_SCALE);
    const lineAmount = sub(mul(quantity, unitPrice, MONEY_SCALE), discountAmount);
    if (isNegative(lineAmount)) {
      throw unprocessable('documents.lineDiscountExceedsAmount', { line: index + 1 }, [
        { line: index + 1, field: 'discountAmount' },
      ]);
    }
    return { quantity, unitPrice, discountAmount, lineAmount };
  });
  const subtotal = sum(
    priced.map((l) => l.lineAmount),
    MONEY_SCALE,
  );
  const discountAmount = decimal(documentDiscount, MONEY_SCALE);
  if (cmp(discountAmount, subtotal) > 0) throw unprocessable('documents.discountExceedsAmount');
  return { lines: priced, subtotal, discountAmount, totalAmount: sub(subtotal, discountAmount) };
}

/** Phân bổ chiết khấu chứng từ vào từng dòng theo tỷ lệ thành tiền (tổng luôn khớp) */
export function allocateDocumentDiscount(document: PricedDocument): Decimal[] {
  return allocate(
    document.discountAmount,
    document.lines.map((l) => l.lineAmount),
  );
}

/** Giá vốn đơn vị của dòng nhập = (thành tiền − chiết khấu phiếu phân bổ) ÷ số lượng */
export function purchaseUnitCosts(document: PricedDocument): Decimal[] {
  const allocated = allocateDocumentDiscount(document);
  return document.lines.map((line, i) =>
    isZero(line.quantity)
      ? decimal(0, COST_SCALE)
      : div(sub(line.lineAmount, allocated[i]!), line.quantity, COST_SCALE),
  );
}

export const money = (value: Decimal) => decimalToString(decimal(value, MONEY_SCALE));
export const qty = (value: Decimal) => decimalToString(decimal(value, QUANTITY_SCALE));
export const costString = (value: Decimal) => decimalToString(decimal(value, COST_SCALE));
