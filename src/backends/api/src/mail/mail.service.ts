import { Injectable } from '@nestjs/common';
import type { Locale } from '@base/shared';
import { createMailer, createSendifyClient, type SmtpConfig } from '@base/server-kit';
import { t } from '../i18n';
import { SettingsService } from '../settings/settings.service';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Khung HTML đơn giản, inline style để hiển thị ổn trên các trình đọc mail (dùng khi gửi qua SMTP) */
function layout(locale: Locale, appName: string, name: string, body: string) {
  const safeApp = escapeHtml(appName);
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#1d2433">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;padding-bottom:16px">${safeApp}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">
<p>${escapeHtml(t(locale, 'mail.greeting', { name }))}</p>${body}
</td></tr>
<tr><td style="font-size:12px;color:#8a94a6;padding-top:24px">${escapeHtml(t(locale, 'mail.footer', { appName }))}</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Gửi email hệ thống: ưu tiên Sendify (theo template) nếu đã cấu hình, nếu không thì SMTP;
 * chưa cấu hình gì thì chỉ ghi log. Cấu hình đọc từ bảng settings lúc gửi.
 */
@Injectable()
export class MailService {
  private readonly mailer = createMailer(() => this.getSmtpConfig());

  private readonly sendify = createSendifyClient(async () => {
    const apiKey = await this.settings.getString('sendify_api_key');
    if (!apiKey) return null;
    const from =
      (await this.settings.getString('sendify_from')) ||
      (await this.settings.getString('mail_from')) ||
      `"${await this.settings.getString('site_name')}" <no-reply@localhost>`;
    return { apiKey, from };
  });

  constructor(private readonly settings: SettingsService) {}

  /** Cấu hình SMTP đọc từ bảng settings (sửa được ở trang admin) */
  private async getSmtpConfig(): Promise<SmtpConfig | null> {
    const host = await this.settings.getString('smtp_host');
    if (!host) return null;
    const user = await this.settings.getString('smtp_user');
    const from =
      (await this.settings.getString('mail_from')) ||
      `"${await this.settings.getString('site_name')}" <${user || 'no-reply@localhost'}>`;
    return {
      host,
      port: await this.settings.getNumber('smtp_port'),
      secure: await this.settings.getBoolean('smtp_secure'),
      user: user || undefined,
      password: (await this.settings.getString('smtp_password')) || undefined,
      from,
    };
  }

  async sendResetPassword(options: {
    to: string;
    name: string;
    link: string;
    locale: Locale;
    expiresInMinutes: number;
  }) {
    const { locale, link, name, expiresInMinutes } = options;
    const appName = await this.settings.getString('site_name');
    const subject = t(locale, 'mail.resetPassword.subject', { appName });

    const templateId = await this.settings.getString('sendify_template_reset_password');
    if (templateId && (await this.sendify.isConfigured())) {
      return this.sendify.send({
        to: options.to,
        subject,
        templateId,
        variables: { fullName: name, resetLink: link, expiresInMinutes, appName },
      });
    }

    const lines = {
      intro: t(locale, 'mail.resetPassword.intro'),
      action: t(locale, 'mail.resetPassword.action'),
      expiry: t(locale, 'mail.resetPassword.expiry', { minutes: expiresInMinutes }),
      ignore: t(locale, 'mail.resetPassword.ignore'),
    };
    const safeLink = escapeHtml(link);
    const html = layout(
      locale,
      appName,
      name,
      `<p>${escapeHtml(lines.intro)}</p>
<p style="padding:8px 0"><a href="${safeLink}" style="background:#4459c1;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;display:inline-block">${escapeHtml(lines.action)}</a></p>
<p style="font-size:13px;color:#5f6b7a;word-break:break-all">${safeLink}</p>
<p>${escapeHtml(lines.expiry)}<br>${escapeHtml(lines.ignore)}</p>`,
    );
    const text = [
      t(locale, 'mail.greeting', { name }),
      lines.intro,
      link,
      lines.expiry,
      lines.ignore,
    ].join('\n\n');
    return this.mailer.send({ to: options.to, subject, html, text });
  }

  /**
   * Gửi mã xác minh email. Ưu tiên Sendify (template `sendify_template_verify_email`,
   * biến: fullName, verificationCode, expiresInMinutes, appName); chưa cấu hình thì dùng SMTP.
   */
  async sendVerificationCode(options: {
    to: string;
    name: string;
    code: string;
    locale: Locale;
    expiresInMinutes: number;
  }) {
    const { locale, code, name, expiresInMinutes } = options;
    const appName = await this.settings.getString('site_name');
    const subject = t(locale, 'mail.verifyEmail.subject', { appName });

    const templateId = await this.settings.getString('sendify_template_verify_email');
    if (templateId && (await this.sendify.isConfigured())) {
      return this.sendify.send({
        to: options.to,
        subject,
        templateId,
        variables: { fullName: name, verificationCode: code, expiresInMinutes, appName },
      });
    }

    const intro = t(locale, 'mail.verifyEmail.intro');
    const expiry = t(locale, 'mail.verifyEmail.expiry', { minutes: expiresInMinutes });
    const ignore = t(locale, 'mail.verifyEmail.ignore');
    const html = layout(
      locale,
      appName,
      name,
      `<p>${escapeHtml(intro)}</p>
<p style="font-size:30px;font-weight:bold;letter-spacing:8px;padding:8px 0">${escapeHtml(code)}</p>
<p>${escapeHtml(expiry)}<br>${escapeHtml(ignore)}</p>`,
    );
    const text = [t(locale, 'mail.greeting', { name }), intro, code, expiry, ignore].join('\n\n');
    return this.mailer.send({ to: options.to, subject, html, text });
  }

  /**
   * Gửi mã xác thực 2 lớp (đăng nhập / bật email 2FA / xác minh lại). Ưu tiên Sendify
   * (template `sendify_template_two_factor_code`, biến: fullName, code, expiresInMinutes, appName,
   * ipAddress, device); chưa cấu hình thì dùng SMTP.
   */
  async sendTwoFactorCode(options: {
    to: string;
    name: string;
    code: string;
    locale: Locale;
    expiresInMinutes: number;
    ipAddress: string | null;
    device: string | null;
  }) {
    const { locale, code, name, expiresInMinutes } = options;
    const appName = await this.settings.getString('site_name');
    const subject = t(locale, 'mail.twoFactorCode.subject', { appName });

    const templateId = await this.settings.getString('sendify_template_two_factor_code');
    if (templateId && (await this.sendify.isConfigured())) {
      return this.sendify.send({
        to: options.to,
        subject,
        templateId,
        variables: {
          fullName: name,
          code,
          expiresInMinutes,
          appName,
          ipAddress: options.ipAddress ?? '',
          device: options.device ?? '',
        },
      });
    }

    const intro = t(locale, 'mail.twoFactorCode.intro');
    const expiry = t(locale, 'mail.twoFactorCode.expiry', { minutes: expiresInMinutes });
    const context = t(locale, 'mail.twoFactorCode.context', {
      ip: options.ipAddress ?? '-',
      device: options.device ?? '-',
    });
    const warning = t(locale, 'mail.twoFactorCode.warning');
    const html = layout(
      locale,
      appName,
      name,
      `<p>${escapeHtml(intro)}</p>
<p style="font-size:30px;font-weight:bold;letter-spacing:8px;padding:8px 0">${escapeHtml(code)}</p>
<p>${escapeHtml(expiry)}</p>
<p style="font-size:13px;color:#5f6b7a">${escapeHtml(context)}</p>
<p style="color:#c0392b">${escapeHtml(warning)}</p>`,
    );
    const text = [t(locale, 'mail.greeting', { name }), intro, code, expiry, context, warning].join(
      '\n\n',
    );
    return this.mailer.send({ to: options.to, subject, html, text });
  }
}
