import nodemailer from 'nodemailer';
import { logger } from './logger';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Gửi email qua SMTP. Cấu hình được đọc lúc gửi (từ bảng settings), nên đổi cấu hình
 * không cần khởi động lại server. Chưa cấu hình SMTP thì chỉ ghi log (tiện cho môi trường dev).
 */
export function createMailer(getConfig: () => Promise<SmtpConfig | null>) {
  return {
    async send(message: MailMessage): Promise<boolean> {
      const config = await getConfig();
      if (!config) {
        logger.warn('SMTP chưa được cấu hình, email chỉ được ghi log', {
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
        return false;
      }
      try {
        const transport = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.user ? { user: config.user, pass: config.password } : undefined,
        });
        await transport.sendMail({ from: config.from, ...message });
        return true;
      } catch (error) {
        logger.error('Gửi email thất bại', { to: message.to, error });
        return false;
      }
    },
  };
}
