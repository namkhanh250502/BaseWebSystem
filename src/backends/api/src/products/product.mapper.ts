import type { Product, ProductImage } from '@base/db';
import type { ProductDetailDto, ProductDto, ProductImageDto } from '@base/shared';
import { stockState } from '../inventory/stock-state';

/** Ký URL xem ảnh có hạn; null khi kho lưu trữ chưa cấu hình / lỗi */
export type ImageUrlSigner = (objectKey: string) => { url: string; expiresAt: string } | null;

export interface ProductRow {
  product: Product;
  category: { id: string; name: string };
  quantity: string;
  avgCost: string;
}

export interface MapOptions {
  /** Có quyền products.viewCost: trả giá nhập + giá vốn bình quân */
  canViewCost: boolean;
  signUrl: ImageUrlSigner;
}

export function toProductImageDto(image: ProductImage, signUrl: ImageUrlSigner): ProductImageDto {
  const signed = signUrl(image.objectKey);
  return {
    id: image.id,
    url: signed?.url ?? null,
    expiresAt: signed?.expiresAt ?? null,
    mimeType: image.mimeType as ProductImageDto['mimeType'],
    sizeBytes: image.sizeBytes,
    originalName: image.originalName,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
  };
}

export function toProductDto(
  row: ProductRow,
  primaryImage: ProductImage | undefined,
  options: MapOptions,
): ProductDto {
  const { product: p } = row;
  const image = primaryImage ? toProductImageDto(primaryImage, options.signUrl) : null;
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: row.category,
    unit: p.unit,
    allowDecimalQuantity: p.allowDecimalQuantity,
    sellingPrice: p.sellingPrice,
    ...(options.canViewCost ? { purchasePrice: p.purchasePrice, avgCost: row.avgCost } : {}),
    minStock: p.minStock,
    status: p.status,
    hasTransactions: p.hasTransactions,
    stock: { quantity: row.quantity, state: stockState(row.quantity, p.minStock) },
    primaryImage: image ? { id: image.id, url: image.url, expiresAt: image.expiresAt } : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toProductDetailDto(
  row: ProductRow,
  images: ProductImage[],
  options: MapOptions,
): ProductDetailDto {
  const primary = images.find((i) => i.isPrimary);
  return {
    ...toProductDto(row, primary, options),
    description: row.product.description,
    images: images.map((i) => toProductImageDto(i, options.signUrl)),
  };
}
