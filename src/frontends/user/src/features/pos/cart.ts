import type { PaymentMethod, ProductDto, SalesOrderDetailDto } from '@base/shared';
import { newRequestId } from '@base/ui';

/** Một dòng giỏ hàng (giá trị dạng chuỗi thập phân như API) */
export interface CartLine {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  allowDecimalQuantity: boolean;
  listPrice: string;
  unitPrice: string;
  quantity: string;
  discountAmount: string;
  /** Tồn lúc thêm vào giỏ — chỉ để cảnh báo, server kiểm tra lại khi chốt */
  stock: string;
  imageUrl: string | null;
}

export interface Cart {
  /** Idempotency: giữ nguyên tới khi chốt / lưu thành công, nên bấm lại sau lỗi mạng không tạo đơn trùng */
  requestId: string;
  lines: CartLine[];
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  discountAmount: string;
  markPaid: boolean;
  /** Đang tiếp tục một đơn nháp đã lưu */
  draft?: { id: string; code: string; version: number };
}

const STORAGE_KEY = 'base.user.pos.cart';

export function emptyCart(): Cart {
  return {
    requestId: newRequestId(),
    lines: [],
    customerName: '',
    customerPhone: '',
    paymentMethod: 'CASH',
    discountAmount: '0',
    markPaid: true,
  };
}

/** Giỏ hàng lưu trong sessionStorage để F5 không mất (không dùng cho dữ liệu cần bền vững) */
export function loadCart(): Cart {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyCart(), ...(JSON.parse(raw) as Partial<Cart>) } : emptyCart();
  } catch {
    return emptyCart();
  }
}

export function saveCart(cart: Cart) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Trình duyệt chặn storage: giỏ hàng chỉ còn trong bộ nhớ
  }
}

export function lineFromProduct(product: ProductDto): CartLine {
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    allowDecimalQuantity: product.allowDecimalQuantity,
    listPrice: product.sellingPrice,
    unitPrice: product.sellingPrice,
    quantity: '1',
    discountAmount: '0',
    stock: product.stock.quantity,
    imageUrl: product.primaryImage?.url ?? null,
  };
}

/** Nạp đơn nháp đã lưu vào giỏ (nút "Tiếp tục bán" ở trang chi tiết) */
export function cartFromDraft(order: SalesOrderDetailDto): Cart {
  return {
    ...emptyCart(),
    lines: order.items.map((i) => ({
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      unit: i.unit,
      allowDecimalQuantity: true,
      listPrice: i.listPrice,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      discountAmount: i.discountAmount,
      stock: '',
      imageUrl: null,
    })),
    customerName: order.customerName ?? '',
    customerPhone: order.customerPhone ?? '',
    paymentMethod: order.paymentMethod,
    discountAmount: order.discountAmount,
    markPaid: true,
    draft: { id: order.id, code: order.code, version: order.version },
  };
}

/** Tổng xem trước (chỉ hiển thị; số liệu cuối do server tính) */
export function previewTotal(cart: Cart): number {
  const lines = cart.lines.reduce(
    (sum, l) =>
      sum + Number(l.quantity || 0) * Number(l.unitPrice || 0) - Number(l.discountAmount || 0),
    0,
  );
  return lines - Number(cart.discountAmount || 0);
}
