import path from 'node:path';
import { DEFAULT_TRUSTED_PROXIES, parseTrustedProxies } from '@base/server-kit';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Cổng HTTP của API */
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** Địa chỉ lắng nghe; production nên đặt 127.0.0.1 để chỉ reverse proxy gọi vào */
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  /**
   * Proxy được tin header IP (CF-Connecting-IP, X-Forwarded-For), phân tách bằng dấu phẩy, nhận IP
   * hoặc CIDR. Mặc định chỉ loopback: nginx / cloudflared / proxy Vite chạy cùng máy với API.
   * Request đến từ IP khác thì bỏ qua các header này và dùng IP của kết nối.
   */
  TRUSTED_PROXIES: z
    .string()
    .default(DEFAULT_TRUSTED_PROXIES.join(','))
    .transform((value) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .superRefine((entries, ctx) => {
      try {
        parseTrustedProxies(entries);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: (error as Error).message });
      }
    }),
  /**
   * Redis lưu bộ đếm rate limit, dùng chung giữa nhiều instance API (ví dụ redis://localhost:6379/0).
   * Bỏ trống = lưu trong bộ nhớ (chỉ đúng khi chạy 1 instance).
   */
  REDIS_URL: z.string().optional(),
  /** Tiền tố key Redis, đổi khi nhiều app dùng chung 1 Redis */
  REDIS_KEY_PREFIX: z.string().default('base-web:'),
  /** Ký access token và token tạm 2FA */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài tối thiểu 32 ký tự'),
  /** Mã hóa secret 2FA trong DB. Đổi key này sẽ làm mất hiệu lực 2FA của mọi user. */
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY phải dài tối thiểu 32 ký tự'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  /** Tên hiển thị trong ứng dụng Authenticator và email */
  APP_NAME: z.string().default('Base Web'),
  /** Dùng để tạo link trong email (đặt lại mật khẩu) */
  USER_APP_URL: z.url().default('http://localhost:5173'),
  ADMIN_APP_URL: z.url().default('http://localhost:5174'),
  /** Thư mục lưu file upload (tương đối với thư mục chạy API) */
  UPLOAD_DIR: z.string().default('storage/uploads'),
  /**
   * Passkey (WebAuthn): domain gốc mà passkey gắn vào. Bỏ trống = hostname của USER_APP_URL.
   * App user và admin chạy trên 2 subdomain thì đặt domain chung, ví dụ `example.com`.
   */
  WEBAUTHN_RP_ID: z.string().optional(),
  /** Tên hiển thị trong hộp thoại passkey, mặc định APP_NAME */
  WEBAUTHN_RP_NAME: z.string().optional(),
  /** Origin được phép thêm (ngoài USER_APP_URL / ADMIN_APP_URL), phân tách bằng dấu phẩy */
  WEBAUTHN_ORIGINS: z.string().optional(),
  /** Bật cờ Secure cho cookie (bắt buộc khi chạy HTTPS ở production) */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /**
   * MinIO / S3 lưu ảnh sản phẩm. Đặt đủ cả MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
   * hoặc bỏ trống cả ba (khi đó chức năng ảnh sản phẩm tắt, các chức năng khác vẫn chạy).
   * Endpoint nội bộ: API gọi vào để kiểm tra / xoá object.
   */
  MINIO_ENDPOINT: optionalString(z.url()),
  /** Địa chỉ trình duyệt truy cập MinIO, dùng để ký URL tải lên / xem ảnh. Mặc định = MINIO_ENDPOINT. */
  MINIO_PUBLIC_URL: optionalString(z.url()),
  MINIO_ACCESS_KEY: optionalString(z.string()),
  MINIO_SECRET_KEY: optionalString(z.string()),
  /** Bucket private chứa ảnh sản phẩm */
  MINIO_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'MINIO_BUCKET không phải tên bucket S3 hợp lệ')
    .default('products'),
  /** Region dùng khi ký URL (MinIO mặc định us-east-1); đặt sẵn để không phải hỏi server */
  MINIO_REGION: z.string().min(1).default('us-east-1'),
  /** Dung lượng tối đa mỗi ảnh sản phẩm (byte). Mặc định 5 MB. */
  PRODUCT_IMAGE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  /** Bật tài liệu API (Swagger) tại /api/docs. Mặc định: bật trừ khi NODE_ENV=production. */
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

/** Biến tuỳ chọn: chuỗi rỗng (`KEY=` trong file .env) coi như không đặt */
function optionalString<S extends z.ZodType<string>>(schema: S) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const MINIO_REQUIRED = ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'] as const;

const validatedEnvSchema = envSchema.superRefine((env, ctx) => {
  const missing = MINIO_REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0 && missing.length < MINIO_REQUIRED.length) {
    ctx.addIssue({
      code: 'custom',
      path: [missing[0]!],
      message: `Cấu hình MinIO chưa đủ: thiếu ${missing.join(', ')} (đặt đủ cả ba hoặc bỏ trống cả ba)`,
    });
  }
});

/** Cấu hình kết nối MinIO đã kiểm tra; `null` = chưa cấu hình (tắt chức năng ảnh sản phẩm) */
export interface MinioConfig {
  endpoint: string;
  publicUrl: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export type Env = z.infer<typeof envSchema> & {
  uploadDir: string;
  cookieSecure: boolean;
  apiDocsEnabled: boolean;
  minio: MinioConfig | null;
};

function toMinioConfig(env: z.infer<typeof envSchema>): MinioConfig | null {
  const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY } = env;
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) return null;
  return {
    endpoint: MINIO_ENDPOINT,
    publicUrl: env.MINIO_PUBLIC_URL ?? MINIO_ENDPOINT,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
    bucket: env.MINIO_BUCKET,
    region: env.MINIO_REGION,
  };
}

let cached: Env | undefined;

/** Đọc + kiểm tra biến môi trường (1 lần, lazy). Sai cấu hình thì dừng khởi động với thông báo rõ ràng. */
export function getEnv(): Env {
  if (!cached) {
    const result = validatedEnvSchema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
      throw new Error(`Biến môi trường không hợp lệ:\n${issues.join('\n')}`);
    }
    cached = {
      ...result.data,
      uploadDir: path.resolve(process.cwd(), result.data.UPLOAD_DIR),
      cookieSecure: result.data.COOKIE_SECURE ?? result.data.NODE_ENV === 'production',
      apiDocsEnabled: result.data.API_DOCS_ENABLED ?? result.data.NODE_ENV !== 'production',
      minio: toMinioConfig(result.data),
    };
  }
  return cached;
}

/** Nạp file `.env` trong thư mục chạy (nếu có); biến đã đặt sẵn trong môi trường được giữ nguyên */
export function loadEnvFile(file = '.env'): void {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
