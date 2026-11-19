import { serviceUnavailable } from '@base/server-kit';
import type {
  ListedObject,
  PresignedPost,
  SignedUrl,
  StorageService,
  StoredObject,
} from '../../src/storage/storage.service';

/** Ảnh nhỏ hợp lệ theo chữ ký file (đủ cho kiểm tra magic bytes) */
export const SAMPLE_IMAGES = {
  'image/png': Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
  ]),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
  'image/webp': Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from('WEBPVP8 '),
  ]),
} as const;

type Public<T> = { [K in keyof T]: T[K] };

/**
 * Thay StorageService trong test e2e: lưu object trong bộ nhớ, giả lập trình duyệt tải lên bằng
 * `upload(key, bytes)`. `enabled = false` giả lập MinIO chưa cấu hình / không khả dụng.
 */
export class FakeStorageService implements Public<StorageService> {
  enabled = true;
  readonly objects = new Map<string, { data: Buffer; contentType: string; lastModified: Date }>();
  readonly removed: string[] = [];
  /** Key bị lỗi khi xoá (giả lập MinIO lỗi tạm thời) */
  readonly failRemove = new Set<string>();

  onApplicationBootstrap() {}

  isEnabled() {
    return this.enabled;
  }

  private assertEnabled() {
    if (!this.enabled) throw serviceUnavailable('storage.unavailable');
  }

  async ensureBucket() {}

  async createPresignedPost(
    key: string,
    options: { mimeType: string; maxBytes: number },
  ): Promise<PresignedPost> {
    this.assertEnabled();
    return {
      url: 'http://fake-storage.local/products',
      fields: {
        key,
        'Content-Type': options.mimeType,
        policy: 'fake-policy',
        'x-amz-signature': 'fake',
      },
    };
  }

  /** Giả lập trình duyệt POST file lên MinIO */
  upload(
    key: string,
    data: Buffer,
    contentType = 'application/octet-stream',
    lastModified = new Date(),
  ) {
    this.objects.set(key, { data, contentType, lastModified });
  }

  async signDownloads(keys: string[]): Promise<Map<string, SignedUrl>> {
    const result = new Map<string, SignedUrl>();
    if (!this.enabled) return result;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    for (const key of keys) {
      result.set(key, {
        url: `http://fake-storage.local/products/${key}?X-Amz-Signature=fake`,
        expiresAt,
      });
    }
    return result;
  }

  async stat(key: string): Promise<StoredObject | null> {
    this.assertEnabled();
    const object = this.objects.get(key);
    return object ? { size: object.data.length, contentType: object.contentType } : null;
  }

  async readHead(key: string, length: number): Promise<Buffer> {
    this.assertEnabled();
    return (this.objects.get(key)?.data ?? Buffer.alloc(0)).subarray(0, length);
  }

  async remove(key: string): Promise<void> {
    this.assertEnabled();
    if (this.failRemove.has(key)) throw serviceUnavailable('storage.unavailable');
    this.objects.delete(key);
    this.removed.push(key);
  }

  async removeMany(keys: string[]): Promise<string[]> {
    const failed: string[] = [];
    for (const key of keys) {
      try {
        await this.remove(key);
      } catch {
        failed.push(key);
      }
    }
    return failed;
  }

  async list(prefix: string): Promise<ListedObject[]> {
    this.assertEnabled();
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, o]) => ({ key, lastModified: o.lastModified }));
  }
}
