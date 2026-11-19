import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, users, type User } from '@base/db';
import type { Locale } from '@base/shared';
import request from 'supertest';
import { expect } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp, type ConfigureAppOptions } from '../../src/app.setup';
import { TotpMethod } from '../../src/auth/two-factor/totp.method';
import { DB, type Database } from '../../src/core/database';
import { MailService } from '../../src/mail/mail.service';
import { SettingsService } from '../../src/settings/settings.service';

export interface SentMail {
  kind: 'resetPassword' | 'verificationCode' | 'twoFactorCode';
  to: string;
  code?: string;
  link?: string;
  locale: Locale;
  ipAddress?: string | null;
}

/** Thay MailService: ghi lại email thay vì gửi, để test đọc mã / link */
export class FakeMailService {
  sent: SentMail[] = [];

  async sendResetPassword(o: { to: string; link: string; locale: Locale }) {
    this.sent.push({ kind: 'resetPassword', to: o.to, link: o.link, locale: o.locale });
    return true;
  }

  async sendVerificationCode(o: { to: string; code: string; locale: Locale }) {
    this.sent.push({ kind: 'verificationCode', to: o.to, code: o.code, locale: o.locale });
    return true;
  }

  async sendTwoFactorCode(o: {
    to: string;
    code: string;
    locale: Locale;
    ipAddress: string | null;
  }) {
    this.sent.push({
      kind: 'twoFactorCode',
      to: o.to,
      code: o.code,
      locale: o.locale,
      ipAddress: o.ipAddress,
    });
    return true;
  }

  last(kind: SentMail['kind'], to: string): SentMail | undefined {
    return [...this.sent].reverse().find((m) => m.kind === kind && m.to === to);
  }

  count(kind: SentMail['kind'], to: string): number {
    return this.sent.filter((m) => m.kind === kind && m.to === to).length;
  }
}

/**
 * TotpMethod cho test: test chạy nhanh hơn 1 bước TOTP (30 giây) nên cùng 1 mã được dùng nhiều lần
 * (bật TOTP rồi xác minh lại / đăng nhập ngay). Mặc định giả lập "đã sang bước mới" bằng cách xoá
 * bước đã dùng trước khi kiểm tra; test chống dùng lại mã thì bật `replayProtection`.
 */
export class TestTotpMethod extends TotpMethod {
  replayProtection = false;

  constructor(private readonly testDb: Database) {
    super(testDb);
  }

  override async verify(user: User, code: string): Promise<boolean> {
    if (!this.replayProtection) {
      await this.testDb
        .update(users)
        .set({ twoFactorTotpLastStep: null })
        .where(eq(users.id, user.id));
    }
    return super.verify(user, code);
  }
}

export interface TestApp {
  app: INestApplication;
  server: ReturnType<INestApplication['getHttpServer']>;
  mail: FakeMailService;
  totp: TestTotpMethod;
  db: Database;
  settings: SettingsService;
  /** Đổi setting (qua service để xoá cache) */
  setSetting: (name: string, value: string) => Promise<void>;
  close: () => Promise<void>;
}

/** Khởi động app NestJS đầy đủ (giống main.ts) với MailService giả */
export async function createTestApp(options: ConfigureAppOptions = {}): Promise<TestApp> {
  const mail = new FakeMailService();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .overrideProvider(TotpMethod)
    .useFactory({ factory: (db: Database) => new TestTotpMethod(db), inject: [DB] })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, options);
  await app.init();
  const settings = app.get(SettingsService);
  return {
    app,
    server: app.getHttpServer(),
    mail,
    totp: app.get(TotpMethod) as TestTotpMethod,
    db: app.get<Database>(DB),
    settings,
    setSetting: async (name, value) => {
      await settings.update({ [name]: value });
    },
    close: () => app.close(),
  };
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255 || 1}`;
}

/**
 * Giả lập 1 trình duyệt: giữ cookie (refresh token), access token, header x-app và token xác minh lại.
 */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  accessToken: string | null = null;
  reauthToken: string | null = null;
  userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
  /**
   * Mỗi client 1 IP riêng (qua X-Forwarded-For) để rate limit theo IP không ảnh hưởng chéo giữa các test.
   * Dùng dải nội bộ 10.x để lịch sử đăng nhập không tra vị trí qua dịch vụ ngoài.
   */
  ip = nextIp();

  constructor(
    server: TestApp['server'],
    public appName: 'user' | 'admin' = 'user',
  ) {
    this.agent = request.agent(server);
  }

  send(method: Method, path: string, body?: unknown, headers: Record<string, string> = {}) {
    let req = this.agent[method](`/api/v1${path}`)
      .set('x-app', this.appName)
      .set('x-lang', 'vi')
      .set('user-agent', this.userAgent)
      .set('x-forwarded-for', this.ip);
    if (this.accessToken) req = req.set('Authorization', `Bearer ${this.accessToken}`);
    if (this.reauthToken) req = req.set('x-reauth-token', this.reauthToken);
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
    return body === undefined ? req : req.send(body as object);
  }

  get = (path: string, headers?: Record<string, string>) =>
    this.send('get', path, undefined, headers);
  post = (path: string, body?: unknown, headers?: Record<string, string>) =>
    this.send('post', path, body ?? {}, headers);
  put = (path: string, body?: unknown) => this.send('put', path, body ?? {});
  patch = (path: string, body?: unknown) => this.send('patch', path, body ?? {});
  delete = (path: string) => this.send('delete', path);

  /** Đăng nhập bằng mật khẩu; thành công thì lưu access token */
  async login(email: string, password: string) {
    const res = await this.post('/auth/login', { email, password });
    if (res.body?.data?.status === 'success') this.accessToken = res.body.data.accessToken;
    return res;
  }

  /** Lưu access token từ response phiên đăng nhập */
  remember(res: request.Response) {
    const token = res.body?.data?.accessToken;
    if (token) this.accessToken = token;
    return res;
  }
}

/** Kiểm tra response thành công và trả `data` (JSON động: để `any` cho test gọn) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ok<T = any>(res: request.Response, status = 200): T {
  if (res.status !== status || res.body?.error) {
    throw new Error(`Mong đợi HTTP ${status}, nhận ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body?.data as T;
}

/** Kiểm tra response lỗi với status và key i18n */
export function fail(res: request.Response, status: number, key?: string) {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(res.body?.data ?? null).toBeNull();
  if (key) expect(res.body?.error?.key).toBe(key);
  return res.body.error as { code: string; key: string; message: string };
}
