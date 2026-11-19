import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { configureTrustedProxies } from '@base/server-kit';
import { getEnv } from './config/env';
import { AllExceptionsFilter, bodyParserErrorHandler } from './core/http-exception.filter';
import { TransformInterceptor } from './core/transform.interceptor';

/** Cấu hình chung của app (dùng cho main.ts và test e2e). App phải tạo với `bodyParser: false`. */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.disable('x-powered-by');
  // Chỉ tin header IP (CF-Connecting-IP, X-Forwarded-For) khi request đi qua proxy tin cậy
  configureTrustedProxies(getEnv().TRUSTED_PROXIES);
  app.use(express.json({ limit: '2mb' }), bodyParserErrorHandler);

  // Mọi API nằm dưới /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  return app;
}
