import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  or,
  productImages,
  products,
  sql,
  type ProductImage,
} from '@base/db';
import {
  PRODUCT_IMAGE_LIMIT,
  type ImageMimeType,
  type imageUploadRequestSchema,
  type ImageUploadTicket,
  type ProductImageDto,
} from '@base/shared';
import { conflict, notFound, serviceUnavailable, unprocessable } from '@base/server-kit';
import type { z } from 'zod';
import { getEnv } from '../config/env';
import { InjectDb, type Database, type Tx } from '../core/database';
import { StorageService } from '../storage/storage.service';
import { toProductImageDto } from './product.mapper';

type UploadRequest = z.infer<typeof imageUploadRequestSchema>;

/** Hạn của form tải lên đã ký (giây) */
const UPLOAD_POLICY_SECONDS = 5 * 60;
/** Hạn hoàn tất tải lên: quá hạn thì bản ghi PENDING + object bị dọn */
const PENDING_TTL_MS = 10 * 60 * 1000;

const EXTENSIONS: Record<ImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Nhận dạng ảnh theo chữ ký đầu file (không tin Content-Type / đuôi file do client gửi) */
export function detectImageMime(head: Buffer): ImageMimeType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    head.subarray(0, 4).toString('ascii') === 'RIFF' &&
    head.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Ảnh sản phẩm trên MinIO (contracts/storage-upload.md): xin form tải lên ký sẵn → trình duyệt
 * tải thẳng lên MinIO → `complete` kiểm tra object thật (dung lượng + chữ ký file) rồi mới gắn vào
 * sản phẩm. Mọi thay đổi ảnh khoá dòng sản phẩm để giới hạn số ảnh / ảnh chính luôn đúng.
 */
@Injectable()
export class ProductImagesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  private assertEnabled() {
    if (!this.storage.isEnabled()) throw serviceUnavailable('storage.unavailable');
  }

  private async lockProduct(tx: Tx, productId: string) {
    const [row] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .for('update');
    if (!row) throw notFound('products.notFound');
  }

  private async findImage(productId: string, imageId: string): Promise<ProductImage> {
    const [image] = await this.db
      .select()
      .from(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));
    if (!image || image.status === 'DELETED') throw notFound('productImages.notFound');
    return image;
  }

  /** Ảnh đang dùng của sản phẩm (đã ký URL xem), theo thứ tự hiển thị */
  async list(productId: string): Promise<ProductImageDto[]> {
    const images = await this.db
      .select()
      .from(productImages)
      .where(and(eq(productImages.productId, productId), eq(productImages.status, 'READY')))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
    const signed = await this.storage.signDownloads(images.map((i) => i.objectKey));
    return images.map((i) => toProductImageDto(i, (key) => signed.get(key) ?? null));
  }

  async requestUpload(
    productId: string,
    input: UploadRequest,
    userId: string,
  ): Promise<ImageUploadTicket> {
    this.assertEnabled();
    const maxBytes = getEnv().PRODUCT_IMAGE_MAX_BYTES;
    if (input.sizeBytes > maxBytes) {
      throw unprocessable('productImages.tooLarge', { maxMb: Math.round(maxBytes / 1048576) });
    }
    const key = `products/${productId}/${randomUUID()}.${EXTENSIONS[input.mimeType]}`;
    const imageId = await this.db.transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      if (input.replaceImageId) {
        const [target] = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(
            and(
              eq(productImages.id, input.replaceImageId),
              eq(productImages.productId, productId),
              eq(productImages.status, 'READY'),
            ),
          );
        if (!target) throw notFound('productImages.notFound');
      }
      // Đếm ảnh đang dùng + đang tải (chưa hết hạn); thay ảnh không làm tăng số ảnh
      const [counts] = await tx
        .select({
          used: sql<number>`count(*)::int`,
          maxOrder: sql<number>`coalesce(max(${productImages.sortOrder}), -1)::int`,
        })
        .from(productImages)
        .where(
          and(
            eq(productImages.productId, productId),
            or(
              eq(productImages.status, 'READY'),
              and(
                eq(productImages.status, 'PENDING'),
                gt(productImages.uploadExpiresAt, new Date()),
              ),
            ),
          ),
        );
      const used = counts?.used ?? 0;
      const maxOrder = counts?.maxOrder ?? -1;
      if (used - (input.replaceImageId ? 1 : 0) >= PRODUCT_IMAGE_LIMIT) {
        throw conflict('productImages.limitReached', { limit: PRODUCT_IMAGE_LIMIT });
      }
      const [row] = await tx
        .insert(productImages)
        .values({
          productId,
          objectKey: key,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          originalName: input.fileName,
          sortOrder: maxOrder + 1,
          status: 'PENDING',
          uploadExpiresAt: new Date(Date.now() + PENDING_TTL_MS),
          replacesImageId: input.replaceImageId ?? null,
          createdBy: userId,
        })
        .returning({ id: productImages.id });
      return row!.id;
    });
    const upload = await this.storage.createPresignedPost(key, {
      mimeType: input.mimeType,
      maxBytes,
      expiresSeconds: UPLOAD_POLICY_SECONDS,
    });
    return {
      imageId,
      upload,
      expiresAt: new Date(Date.now() + UPLOAD_POLICY_SECONDS * 1000).toISOString(),
    };
  }

  /** Huỷ ảnh PENDING không hợp lệ: xoá object (nếu có) và bản ghi */
  private async discard(image: ProductImage) {
    await this.storage.remove(image.objectKey).catch(() => undefined);
    await this.db.delete(productImages).where(eq(productImages.id, image.id));
  }

  async complete(productId: string, imageId: string): Promise<ProductImageDto> {
    this.assertEnabled();
    const image = await this.findImage(productId, imageId);
    if (image.status !== 'PENDING') throw conflict('productImages.notPending');
    if (image.uploadExpiresAt && image.uploadExpiresAt.getTime() < Date.now()) {
      await this.discard(image);
      throw conflict('productImages.expired');
    }
    const stored = await this.storage.stat(image.objectKey);
    if (!stored) throw conflict('productImages.notUploaded');
    const maxBytes = getEnv().PRODUCT_IMAGE_MAX_BYTES;
    if (stored.size > maxBytes) {
      await this.discard(image);
      throw unprocessable('productImages.tooLarge', { maxMb: Math.round(maxBytes / 1048576) });
    }
    const detected = detectImageMime(await this.storage.readHead(image.objectKey, 16));
    if (!detected || detected !== image.mimeType) {
      await this.discard(image);
      throw unprocessable('productImages.contentMismatch');
    }

    const replaced = await this.db.transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      let sortOrder = image.sortOrder;
      let isPrimary: boolean;
      let old: ProductImage | undefined;
      if (image.replacesImageId) {
        [old] = await tx
          .select()
          .from(productImages)
          .where(
            and(eq(productImages.id, image.replacesImageId), eq(productImages.status, 'READY')),
          );
      }
      if (old) {
        sortOrder = old.sortOrder;
        isPrimary = old.isPrimary;
        // Bỏ cờ chính của ảnh cũ trước (unique index: tối đa 1 ảnh chính READY)
        await tx
          .update(productImages)
          .set({ status: 'DELETED', isPrimary: false })
          .where(eq(productImages.id, old.id));
      } else {
        const [primary] = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(
            and(
              eq(productImages.productId, productId),
              eq(productImages.status, 'READY'),
              eq(productImages.isPrimary, true),
            ),
          );
        isPrimary = !primary;
      }
      await tx
        .update(productImages)
        .set({
          status: 'READY',
          sizeBytes: stored.size,
          sortOrder,
          isPrimary,
          uploadExpiresAt: null,
          replacesImageId: null,
        })
        .where(eq(productImages.id, image.id));
      return old;
    });
    if (replaced) await this.purge([replaced]);
    const images = await this.list(productId);
    return images.find((i) => i.id === imageId)!;
  }

  /** Xoá object rồi xoá bản ghi DELETED; object xoá lỗi để cleanup thử lại */
  private async purge(images: Pick<ProductImage, 'id' | 'objectKey'>[]) {
    const failed = new Set(await this.storage.removeMany(images.map((i) => i.objectKey)));
    const done = images.filter((i) => !failed.has(i.objectKey)).map((i) => i.id);
    if (done.length) await this.db.delete(productImages).where(inArray(productImages.id, done));
  }

  async setPrimary(productId: string, imageId: string): Promise<ProductImageDto[]> {
    const image = await this.findImage(productId, imageId);
    if (image.status !== 'READY') throw notFound('productImages.notFound');
    await this.db.transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      await tx
        .update(productImages)
        .set({ isPrimary: false })
        .where(and(eq(productImages.productId, productId), eq(productImages.isPrimary, true)));
      await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, imageId));
    });
    return this.list(productId);
  }

  async reorder(productId: string, imageIds: string[]): Promise<ProductImageDto[]> {
    await this.db.transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      const ready = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(and(eq(productImages.productId, productId), eq(productImages.status, 'READY')));
      const current = new Set(ready.map((r) => r.id));
      if (current.size !== imageIds.length || imageIds.some((id) => !current.has(id))) {
        throw unprocessable('productImages.orderMismatch');
      }
      for (const [index, id] of imageIds.entries()) {
        await tx.update(productImages).set({ sortOrder: index }).where(eq(productImages.id, id));
      }
    });
    return this.list(productId);
  }

  /** Xoá ảnh; nếu là ảnh chính thì ảnh đầu tiên còn lại thành ảnh chính */
  async remove(productId: string, imageId: string): Promise<void> {
    const image = await this.findImage(productId, imageId);
    await this.db.transaction(async (tx) => {
      await this.lockProduct(tx, productId);
      await tx
        .update(productImages)
        .set({ status: 'DELETED', isPrimary: false })
        .where(eq(productImages.id, imageId));
      if (image.isPrimary) {
        const [next] = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(and(eq(productImages.productId, productId), eq(productImages.status, 'READY')))
          .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt))
          .limit(1);
        if (next) {
          await tx
            .update(productImages)
            .set({ isPrimary: true })
            .where(eq(productImages.id, next.id));
        }
      }
    });
    await this.purge([image]);
  }
}
