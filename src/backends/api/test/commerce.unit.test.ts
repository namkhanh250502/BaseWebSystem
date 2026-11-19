import { AppError, decimalToString } from '@base/server-kit';
import { describe, expect, it } from 'vitest';
import { detectImageMime } from '../src/products/product-images.service';
import { allocateDocumentDiscount, priceDocument, purchaseUnitCosts } from '../src/sales/pricing';
import { stockState } from '../src/inventory/stock-state';
import { SAMPLE_IMAGES } from './helpers/fake-storage';

const s = decimalToString;

describe('Tính tiền chứng từ (pricing)', () => {
  it('thành tiền dòng = SL × đơn giá − chiết khấu dòng; tổng = tạm tính − chiết khấu chứng từ', () => {
    const doc = priceDocument(
      [
        { quantity: '2', unitPrice: '15000', discountAmount: '1000' },
        { quantity: '1.5', unitPrice: '20000.50', discountAmount: '0' },
      ],
      '4000',
    );
    expect(doc.lines.map((l) => s(l.lineAmount))).toEqual(['29000.00', '30000.75']);
    expect(s(doc.subtotal)).toBe('59000.75');
    expect(s(doc.totalAmount)).toBe('55000.75');
  });

  it('chiết khấu bằng thành tiền hợp lệ (= 0); vượt → lỗi theo dòng / theo chứng từ', () => {
    const zero = priceDocument([{ quantity: '1', unitPrice: '1000', discountAmount: '1000' }], '0');
    expect(s(zero.totalAmount)).toBe('0.00');
    expect(() =>
      priceDocument(
        [
          { quantity: '1', unitPrice: '1000', discountAmount: '0' },
          { quantity: '1', unitPrice: '1000', discountAmount: '1000.01' },
        ],
        '0',
      ),
    ).toThrow(
      expect.objectContaining({ key: 'documents.lineDiscountExceedsAmount', params: { line: 2 } }),
    );
    const error = (() => {
      try {
        priceDocument([{ quantity: '1', unitPrice: '1000', discountAmount: '0' }], '1000.01');
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 422, key: 'documents.discountExceedsAmount' });
  });

  it('phân bổ chiết khấu chứng từ: tổng khớp, dư vào dòng cuối có thành tiền > 0', () => {
    const doc = priceDocument(
      [
        { quantity: '1', unitPrice: '100', discountAmount: '0' },
        { quantity: '1', unitPrice: '100', discountAmount: '0' },
        { quantity: '1', unitPrice: '100', discountAmount: '0' },
        { quantity: '1', unitPrice: '0', discountAmount: '0' },
      ],
      '100',
    );
    expect(allocateDocumentDiscount(doc).map(s)).toEqual(['33.33', '33.33', '33.34', '0.00']);
  });

  it('giá vốn đơn vị phiếu nhập sau phân bổ chiết khấu phiếu', () => {
    const doc = priceDocument(
      [
        { quantity: '10', unitPrice: '100000', discountAmount: '0' },
        { quantity: '3', unitPrice: '10000', discountAmount: '0' },
      ],
      '10300',
    );
    // phân bổ 10.000 cho dòng 1 (1.000.000) và 300 cho dòng 2 (30.000)
    expect(purchaseUnitCosts(doc).map(s)).toEqual(['99000.0000', '9900.0000']);
  });
});

describe('Trạng thái tồn & nhận dạng ảnh', () => {
  it('OUT khi = 0, LOW khi ≤ tồn tối thiểu, IN_STOCK khi lớn hơn', () => {
    expect(stockState('0.000', '5.000')).toBe('OUT');
    expect(stockState('5.000', '5.000')).toBe('LOW');
    expect(stockState('0.5', '0')).toBe('IN_STOCK');
    expect(stockState('5.001', '5')).toBe('IN_STOCK');
  });

  it('nhận dạng JPEG / PNG / WebP theo chữ ký file, từ chối nội dung khác', () => {
    expect(detectImageMime(SAMPLE_IMAGES['image/jpeg'])).toBe('image/jpeg');
    expect(detectImageMime(SAMPLE_IMAGES['image/png'])).toBe('image/png');
    expect(detectImageMime(SAMPLE_IMAGES['image/webp'])).toBe('image/webp');
    expect(detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
  });
});
