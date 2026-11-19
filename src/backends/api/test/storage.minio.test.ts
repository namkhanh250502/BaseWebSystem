import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageService } from '../src/storage/storage.service';
import { SAMPLE_IMAGES } from './helpers/fake-storage';

/**
 * Tích hợp MinIO thật (tuỳ chọn): đặt TEST_MINIO_URL=http://<access>:<secret>@localhost:9000.
 * Dùng bucket riêng `products-test-<ngẫu nhiên>`, xoá object sau khi chạy.
 */
const url = process.env.TEST_MINIO_URL;

describe.skipIf(!url)('Storage: MinIO thật', () => {
  let storage: StorageService;
  const keys: string[] = [];
  beforeAll(async () => {
    const parsed = new URL(url!);
    const endpoint = `${parsed.protocol}//${parsed.host}`;
    storage = new StorageService({
      endpoint,
      publicUrl: endpoint,
      accessKey: decodeURIComponent(parsed.username),
      secretKey: decodeURIComponent(parsed.password),
      bucket: `products-test-${randomUUID().slice(0, 8)}`,
      region: 'us-east-1',
    });
    await storage.ensureBucket();
  });
  afterAll(async () => {
    if (storage) await storage.removeMany(keys);
  });

  async function post(key: string, data: Buffer, mimeType: string, maxBytes = 1024) {
    const { url: postUrl, fields } = await storage.createPresignedPost(key, {
      mimeType,
      maxBytes,
      expiresSeconds: 60,
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }));
    return fetch(postUrl, { method: 'POST', body: form });
  }

  it('tải lên qua form ký sẵn, đọc thông tin + chữ ký file, xem qua URL ký sẵn, xoá', async () => {
    const key = `products/it/${randomUUID()}.png`;
    keys.push(key);
    const res = await post(key, SAMPLE_IMAGES['image/png'], 'image/png');
    expect(res.status).toBeLessThan(300);
    expect(await storage.stat(key)).toEqual({
      size: SAMPLE_IMAGES['image/png'].length,
      contentType: 'image/png',
    });
    expect((await storage.readHead(key, 4)).toString('hex')).toBe('89504e47');
    const signed = (await storage.signDownloads([key])).get(key)!;
    const download = await fetch(signed.url);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer()).equals(SAMPLE_IMAGES['image/png'])).toBe(true);
    expect((await storage.list('products/it/')).map((o) => o.key)).toContain(key);
    await storage.remove(key);
    expect(await storage.stat(key)).toBeNull();
  });

  it('MinIO từ chối file vượt dung lượng hoặc sai Content-Type theo policy', async () => {
    const big = `products/it/${randomUUID()}.png`;
    keys.push(big);
    expect(
      (await post(big, Buffer.alloc(2048, 1), 'image/png', 1024)).status,
    ).toBeGreaterThanOrEqual(400);
    expect(await storage.stat(big)).toBeNull();

    const wrongType = `products/it/${randomUUID()}.png`;
    keys.push(wrongType);
    const { url: postUrl, fields } = await storage.createPresignedPost(wrongType, {
      mimeType: 'image/png',
      maxBytes: 1024,
      expiresSeconds: 60,
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, k === 'Content-Type' ? 'text/html' : v);
    }
    form.append('file', new Blob(['<html>'], { type: 'text/html' }));
    expect((await fetch(postUrl, { method: 'POST', body: form })).status).toBeGreaterThanOrEqual(
      400,
    );
  });
});
