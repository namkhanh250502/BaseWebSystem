import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { logger } from '@base/server-kit';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { getEnv, loadEnvFile } from './config/env';

async function bootstrap() {
  // Biến môi trường: file .env trong thư mục chạy API (production có thể đặt sẵn qua systemd)
  loadEnvFile();
  const env = getEnv();
  if (env.NODE_ENV === 'production' && !['127.0.0.1', '::1', 'localhost'].includes(env.HOST)) {
    logger.warn(
      `API đang nghe ${env.HOST}: nên đặt HOST=127.0.0.1 để chỉ reverse proxy gọi vào. ` +
        'Request gọi thẳng vào API sẽ bị lấy IP kết nối (header IP bị bỏ qua) nhưng vẫn vượt qua nginx/Cloudflare.',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Tự đăng ký body-parser để lỗi JSON sai / body quá lớn trả về đúng định dạng { data, error }
    bodyParser: false,
  });
  configureApp(app);
  // Đóng pool DB khi nhận SIGTERM / SIGINT
  app.enableShutdownHooks();

  // Không cần CORS: frontend gọi /api qua proxy cùng origin (Vite dev proxy / nginx)
  await app.listen(env.PORT, env.HOST);
}

void bootstrap();
