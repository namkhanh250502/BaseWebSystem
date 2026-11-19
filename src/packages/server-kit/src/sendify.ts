import { logger } from './logger';

export interface SendifyConfig {
  apiKey: string;
  from: string;
}

export interface SendifyMessage {
  to: string;
  subject: string;
  /** ID template đã tạo trên Sendify */
  templateId: string;
  /** Biến thay vào template (Sendify yêu cầu mọi giá trị là chuỗi) */
  variables: Record<string, string | number>;
}

const ENDPOINT = 'https://sendify.vn/api/emails';
const MAX_ATTEMPTS = 3;

/**
 * Gửi email theo template qua Sendify (https://sendify.vn).
 * Cấu hình đọc lúc gửi; trả về false nếu chưa cấu hình hoặc gửi thất bại.
 */
export function createSendifyClient(getConfig: () => Promise<SendifyConfig | null>) {
  return {
    async isConfigured(): Promise<boolean> {
      return (await getConfig()) !== null;
    },

    async send(message: SendifyMessage): Promise<boolean> {
      const config = await getConfig();
      if (!config) return false;

      const body = JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        template_id: message.templateId,
        variables: Object.fromEntries(
          Object.entries(message.variables).map(([k, v]) => [k, String(v)]),
        ),
      });

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body,
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) return true;
          // 429: bị giới hạn tần suất → chờ rồi thử lại
          if (res.status === 429 && attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, attempt * 1000));
            continue;
          }
          logger.error('Sendify trả lỗi', {
            status: res.status,
            to: message.to,
            body: (await res.text().catch(() => '')).slice(0, 500),
          });
          return false;
        } catch (error) {
          if (attempt === MAX_ATTEMPTS) {
            logger.error('Không gọi được Sendify', { to: message.to, error });
            return false;
          }
        }
      }
      return false;
    },
  };
}
