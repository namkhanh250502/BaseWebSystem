import { eq, productImages } from '@base/db';
import { PRODUCT_IMAGE_LIMIT } from '@base/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StorageCleanupService } from '../src/storage/storage-cleanup.service';
import { createTestApp, fail, ok, type Client, type TestApp } from './helpers/app';
import { createProduct } from './helpers/commerce';
import { SAMPLE_IMAGES } from './helpers/fake-storage';
import { signedInClient } from './helpers/flows';

type Mime = keyof typeof SAMPLE_IMAGES;

describe('Ảnh sản phẩm (MinIO giả lập)', () => {
  let t: TestApp;
  let manager: Client;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    t.storage.enabled = true;
    t.storage.failRemove.clear();
  });

  /** Xin form tải lên → "trình duyệt" tải lên → complete */
  async function upload(
    productId: string,
    mimeType: Mime = 'image/png',
    options: { data?: Buffer; replaceImageId?: string } = {},
  ) {
    const data = options.data ?? SAMPLE_IMAGES[mimeType];
    const ticket = ok(
      await manager.post(`/products/${productId}/images/upload-requests`, {
        fileName: `a.${mimeType.split('/')[1]}`,
        mimeType,
        sizeBytes: data.length,
        replaceImageId: options.replaceImageId,
      }),
      201,
    );
    t.storage.upload(ticket.upload.fields.key, data, mimeType);
    return {
      ticket,
      res: await manager.post(`/products/${productId}/images/${ticket.imageId}/complete`),
    };
  }

  const images = async (productId: string) =>
    ok(await manager.get(`/products/${productId}`)).images;

  it('form tải lên ký sẵn: key theo sản phẩm, không chứa access key / secret', async () => {
    const product = await createProduct(t);
    const ticket = ok(
      await manager.post(`/products/${product.id}/images/upload-requests`, {
        fileName: 'x.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      }),
      201,
    );
    expect(ticket.upload.fields.key).toMatch(
      new RegExp(`^products/${product.id}/[0-9a-f-]+\\.jpg$`),
    );
    expect(ticket.upload.fields['Content-Type']).toBe('image/jpeg');
    expect(JSON.stringify(ticket)).not.toMatch(/secret|accessKey/i);
  });

  it('ảnh hợp lệ đầu tiên tự là ảnh chính; danh sách sản phẩm có URL xem ảnh có hạn', async () => {
    const product = await createProduct(t);
    const { res } = await upload(product.id, 'image/jpeg');
    const image = ok(res);
    expect(image).toMatchObject({ isPrimary: true, mimeType: 'image/jpeg', sortOrder: 0 });
    expect(image.url).toContain('X-Amz-Signature');
    expect(image.expiresAt).toBeTruthy();
    const list = ok(await manager.get(`/products?search=${product.sku}`));
    expect(list[0].primaryImage).toMatchObject({ id: image.id, url: expect.any(String) });
    const second = ok((await upload(product.id, 'image/webp')).res);
    expect(second.isPrimary).toBe(false);
  });

  it('sai loại / quá dung lượng bị từ chối trước khi tải lên', async () => {
    const product = await createProduct(t);
    fail(
      await manager.post(`/products/${product.id}/images/upload-requests`, {
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      }),
      422,
      'errors.validation',
    );
    fail(
      await manager.post(`/products/${product.id}/images/upload-requests`, {
        fileName: 'big.png',
        mimeType: 'image/png',
        sizeBytes: 6 * 1024 * 1024,
      }),
      422,
      'productImages.tooLarge',
    );
  });

  it('file đuôi ảnh nhưng nội dung không phải ảnh → 422, object bị xoá, không gắn vào sản phẩm', async () => {
    const product = await createProduct(t);
    const { ticket, res } = await upload(product.id, 'image/jpeg', {
      data: Buffer.from('not an image'),
    });
    fail(res, 422, 'productImages.contentMismatch');
    expect(t.storage.objects.has(ticket.upload.fields.key)).toBe(false);
    expect(await images(product.id)).toEqual([]);
  });

  it('complete khi chưa tải lên → 409; hoàn tất lần 2 → 409', async () => {
    const product = await createProduct(t);
    const ticket = ok(
      await manager.post(`/products/${product.id}/images/upload-requests`, {
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 100,
      }),
      201,
    );
    fail(
      await manager.post(`/products/${product.id}/images/${ticket.imageId}/complete`),
      409,
      'productImages.notUploaded',
    );
    t.storage.upload(ticket.upload.fields.key, SAMPLE_IMAGES['image/png']);
    ok(await manager.post(`/products/${product.id}/images/${ticket.imageId}/complete`));
    fail(
      await manager.post(`/products/${product.id}/images/${ticket.imageId}/complete`),
      409,
      'productImages.notPending',
    );
  });

  it(`tối đa ${PRODUCT_IMAGE_LIMIT} ảnh mỗi sản phẩm (tính cả ảnh đang tải)`, async () => {
    const product = await createProduct(t);
    for (let i = 0; i < PRODUCT_IMAGE_LIMIT; i++) ok((await upload(product.id)).res);
    fail(
      await manager.post(`/products/${product.id}/images/upload-requests`, {
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 100,
      }),
      409,
      'productImages.limitReached',
    );
  });

  it('đổi ảnh chính, sắp xếp lại, xoá ảnh chính → ảnh đầu tiên còn lại thành ảnh chính', async () => {
    const product = await createProduct(t);
    const a = ok((await upload(product.id)).res);
    const b = ok((await upload(product.id, 'image/jpeg')).res);
    const c = ok((await upload(product.id, 'image/webp')).res);
    const afterPrimary = ok(
      await manager.patch(`/products/${product.id}/images/${b.id}`, { isPrimary: true }),
    );
    expect(
      afterPrimary
        .filter((i: { isPrimary: boolean }) => i.isPrimary)
        .map((i: { id: string }) => i.id),
    ).toEqual([b.id]);

    const ordered = ok(
      await manager.put(`/products/${product.id}/images/order`, { imageIds: [c.id, b.id, a.id] }),
    );
    expect(ordered.map((i: { id: string }) => i.id)).toEqual([c.id, b.id, a.id]);
    fail(
      await manager.put(`/products/${product.id}/images/order`, { imageIds: [c.id, b.id] }),
      422,
      'productImages.orderMismatch',
    );

    const key = (await t.db.select().from(productImages).where(eq(productImages.id, b.id)))[0]!
      .objectKey;
    expect((await manager.delete(`/products/${product.id}/images/${b.id}`)).status).toBe(204);
    const left = await images(product.id);
    expect(left.map((i: { id: string; isPrimary: boolean }) => [i.id, i.isPrimary])).toEqual([
      [c.id, true],
      [a.id, false],
    ]);
    expect(t.storage.objects.has(key)).toBe(false);
  });

  it('thay ảnh: ảnh mới giữ vị trí + cờ ảnh chính, object ảnh cũ bị xoá', async () => {
    const product = await createProduct(t);
    const first = ok((await upload(product.id)).res);
    ok((await upload(product.id, 'image/jpeg')).res);
    const oldKey = (
      await t.db.select().from(productImages).where(eq(productImages.id, first.id))
    )[0]!.objectKey;
    const replacement = ok(
      (await upload(product.id, 'image/webp', { replaceImageId: first.id })).res,
    );
    expect(replacement).toMatchObject({
      isPrimary: true,
      sortOrder: first.sortOrder,
      mimeType: 'image/webp',
    });
    const ids = (await images(product.id)).map((i: { id: string }) => i.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(first.id);
    expect(t.storage.objects.has(oldKey)).toBe(false);
  });

  it('MinIO không khả dụng: API ảnh trả 503, xem sản phẩm vẫn chạy với url = null', async () => {
    const product = await createProduct(t);
    ok((await upload(product.id)).res);
    t.storage.enabled = false;
    fail(
      await manager.post(`/products/${product.id}/images/upload-requests`, {
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 100,
      }),
      503,
      'storage.unavailable',
    );
    const detail = ok(await manager.get(`/products/${product.id}`));
    expect(detail.images[0].url).toBeNull();
  });

  it('dọn mồ côi: PENDING quá hạn, DELETED xoá lỗi (thử lại), object không còn bản ghi', async () => {
    const cleanup = t.app.get(StorageCleanupService);
    const product = await createProduct(t);
    // PENDING đã tải lên nhưng không complete, cho quá hạn
    const ticket = ok(
      await manager.post(`/products/${product.id}/images/upload-requests`, {
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 100,
      }),
      201,
    );
    t.storage.upload(ticket.upload.fields.key, SAMPLE_IMAGES['image/png']);
    await t.db
      .update(productImages)
      .set({ uploadExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(productImages.id, ticket.imageId));
    // Ảnh xoá nhưng MinIO lỗi tạm thời → bản ghi DELETED còn lại
    const ready = ok((await upload(product.id)).res);
    const readyKey = (
      await t.db.select().from(productImages).where(eq(productImages.id, ready.id))
    )[0]!.objectKey;
    t.storage.failRemove.add(readyKey);
    await manager.delete(`/products/${product.id}/images/${ready.id}`);
    expect(
      (await t.db.select().from(productImages).where(eq(productImages.id, ready.id)))[0]?.status,
    ).toBe('DELETED');
    // Object mồ côi cũ hơn 24 giờ
    t.storage.upload(
      'products/orphan/x.png',
      SAMPLE_IMAGES['image/png'],
      'image/png',
      new Date(Date.now() - 25 * 3600_000),
    );

    t.storage.failRemove.clear();
    const result = await cleanup.runOnce({ sweepOrphans: true });
    expect(result).toMatchObject({ failed: 0, orphans: 1 });
    expect(result!.removed).toBeGreaterThanOrEqual(2);
    expect(t.storage.objects.has(ticket.upload.fields.key)).toBe(false);
    expect(t.storage.objects.has('products/orphan/x.png')).toBe(false);
    const rows = await t.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id));
    expect(rows).toEqual([]);
  });

  it('xoá sản phẩm chưa giao dịch: object ảnh bị xoá theo', async () => {
    const product = await createProduct(t);
    const { ticket } = await upload(product.id);
    expect((await manager.delete(`/products/${product.id}`)).status).toBe(204);
    expect(t.storage.objects.has(ticket.upload.fields.key)).toBe(false);
  });
});
