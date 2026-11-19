import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { configureTrustedProxies } from '@base/server-kit';
import { getEnv } from './config/env';
import { AllExceptionsFilter, bodyParserErrorHandler } from './core/http-exception.filter';
import { TransformInterceptor } from './core/transform.interceptor';

export interface ConfigureAppOptions {
  /** Bật Swagger tại /api/docs (+ /api/docs-json). Mặc định theo `API_DOCS_ENABLED`. */
  apiDocs?: boolean;
}

/**
 * Tài liệu OpenAPI: route Express riêng (không đi qua AuthGuard / TransformInterceptor),
 * tài liệu sinh lần đầu khi có người mở, không làm chậm khởi động.
 */
function setupApiDocs(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle(`${getEnv().APP_NAME} API`)
    .setDescription(
      'REST API /api/v1. Response: { data, error, meta? }; lỗi có `key` i18n ổn định và `params`.',
    )
    .setVersion('1')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .addGlobalParameters(
      {
        in: 'header',
        name: 'x-lang',
        required: false,
        description: 'Ngôn ngữ của thông báo lỗi',
        schema: { type: 'string', enum: ['vi', 'en'] },
      },
      {
        in: 'header',
        name: 'x-app',
        required: false,
        description: 'App gọi API (cookie phiên riêng cho từng app)',
        schema: { type: 'string', enum: ['user', 'admin'] },
      },
    )
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'api/docs-json',
    raw: ['json'],
  });
}

/** Cấu hình chung của app (dùng cho main.ts và test e2e). App phải tạo với `bodyParser: false`. */
export function configureApp(
  app: NestExpressApplication,
  options: ConfigureAppOptions = {},
): NestExpressApplication {
  app.disable('x-powered-by');
  // Chỉ tin header IP (CF-Connecting-IP, X-Forwarded-For) khi request đi qua proxy tin cậy
  configureTrustedProxies(getEnv().TRUSTED_PROXIES);
  app.use(express.json({ limit: '2mb' }), bodyParserErrorHandler);

  // Mọi API nằm dưới /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  if (options.apiDocs ?? getEnv().apiDocsEnabled) setupApiDocs(app);
  return app;
}
