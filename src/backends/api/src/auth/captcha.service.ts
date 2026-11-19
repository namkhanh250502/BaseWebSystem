import { Injectable } from '@nestjs/common';
import { badRequest, getClientIp, logger, type RequestLike } from '@base/server-kit';
import { SettingsService } from '../settings/settings.service';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Kiểm tra Cloudflare Turnstile. Chỉ bật khi đã cấu hình `turnstile_secret_key` trong settings. */
@Injectable()
export class CaptchaService {
  constructor(private readonly settings: SettingsService) {}

  async verify(req: RequestLike, token: string | undefined): Promise<void> {
    const secret = await this.settings.getString('turnstile_secret_key');
    if (!secret) return;
    if (!token) throw badRequest('auth.captchaRequired');

    const body = new URLSearchParams({ secret, response: token });
    const ip = getClientIp(req);
    if (ip) body.set('remoteip', ip);

    try {
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const result = (await res.json()) as { success?: boolean };
      if (result.success) return;
    } catch (error) {
      logger.warn('Không gọi được Turnstile', error);
    }
    throw badRequest('auth.captchaInvalid');
  }
}
