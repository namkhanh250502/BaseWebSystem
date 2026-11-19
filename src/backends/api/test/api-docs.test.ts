import { Controller, Get, Post, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { configureApp } from '../src/app.setup';
import {
  ApiErrors,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
  zodToOpenApi,
} from '../src/decorators/api-docs';
import { Public, ZodBody, ZodQuery } from '../src/decorators/customize';
import { createTestApp, type TestApp } from './helpers/app';

describe('API docs: bật / tắt Swagger', () => {
  let enabled: TestApp;
  let disabled: TestApp;
  beforeAll(async () => {
    enabled = await createTestApp({ apiDocs: true });
    disabled = await createTestApp({ apiDocs: false });
  });
  afterAll(async () => {
    await enabled.close();
    await disabled.close();
  });

  it('bật: /api/docs-json trả OpenAPI có route hiện có, bearer auth và header x-lang, không cần đăng nhập', async () => {
    const res = await request(enabled.server).get('/api/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/v1/health', '/api/v1/auth/login', '/api/v1/roles']),
    );
    expect(res.body.components.securitySchemes.bearer).toMatchObject({ type: 'http' });
    expect(res.body.security).toEqual([{ bearer: [] }]);
    const loginParams = res.body.paths['/api/v1/auth/login'].post.parameters ?? [];
    expect(loginParams.map((p: { name: string }) => p.name)).toContain('x-lang');
  });

  it('bật: /api/docs trả trang Swagger UI', async () => {
    const res = await request(enabled.server).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('tắt: /api/docs-json và /api/docs trả 404', async () => {
    expect((await request(disabled.server).get('/api/docs-json')).status).toBe(404);
    expect((await request(disabled.server).get('/api/docs/')).status).toBe(404);
  });
});

const itemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  quantity: z.coerce.number().int().min(1).default(1),
});
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
const itemDtoSchema = itemSchema.extend({ id: z.uuid(), quantity: z.number().int() });

@Controller('docs-demo')
class DocsDemoController {
  @Public()
  @ApiZodQuery(listQuerySchema)
  @ApiZodResponse(itemDtoSchema, { paginated: true })
  @Get()
  list(@ZodQuery(listQuerySchema) query: z.infer<typeof listQuerySchema>) {
    return { query };
  }

  @Public()
  @ApiZodBody(itemSchema)
  @ApiZodResponse(itemDtoSchema, { status: 201 })
  @ApiErrors(409, 422)
  @Post()
  create(@ZodBody(itemSchema) input: z.infer<typeof itemSchema>) {
    return input;
  }
}

describe('API docs: decorator ApiZod*', () => {
  let app: INestApplication;
  let doc: {
    paths: Record<string, Record<string, Record<string, unknown>>>;
  };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocsDemoController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app as NestExpressApplication, { apiDocs: true });
    await app.init();
    doc = (await request(app.getHttpServer()).get('/api/docs-json')).body;
  });
  afterAll(async () => {
    await app.close();
  });

  it('zodToOpenApi: request dùng kiểu input (trường có default không bắt buộc), response dùng output', () => {
    expect(zodToOpenApi(itemSchema, 'input').required).toEqual(['name', 'price']);
    expect(zodToOpenApi(itemSchema, 'output').required).toEqual(['name', 'price', 'quantity']);
    expect(zodToOpenApi(itemSchema).properties?.name).toMatchObject({
      type: 'string',
      minLength: 1,
      maxLength: 100,
    });
  });

  it('ApiZodQuery: mỗi trường thành 1 query param, giữ enum và required', () => {
    const params = doc.paths['/api/v1/docs-demo']!.get!.parameters as {
      name: string;
      in: string;
      required: boolean;
      schema: { enum?: string[] };
    }[];
    const query = params.filter((p) => p.in === 'query');
    expect(query.map((p) => p.name).sort()).toEqual(['page', 'search', 'status']);
    expect(query.every((p) => p.required === false)).toBe(true);
    expect(query.find((p) => p.name === 'status')!.schema.enum).toEqual(['ACTIVE', 'INACTIVE']);
  });

  it('ApiZodBody / ApiZodResponse / ApiErrors: body, envelope { data, error, meta } và response lỗi', () => {
    const post = doc.paths['/api/v1/docs-demo']!.post as {
      requestBody: { content: Record<string, { schema: { required: string[] } }> };
      responses: Record<
        string,
        { content: Record<string, { schema: { properties: Record<string, unknown> } }> }
      >;
    };
    expect(post.requestBody.content['application/json']!.schema.required).toEqual([
      'name',
      'price',
    ]);
    const created = post.responses['201']!.content['application/json']!.schema;
    expect(Object.keys(created.properties)).toEqual(['data', 'error']);
    expect(Object.keys(post.responses)).toEqual(expect.arrayContaining(['201', '409', '422']));
    const errorProps = post.responses['422']!.content['application/json']!.schema.properties
      .error as { properties: Record<string, unknown> };
    expect(Object.keys(errorProps.properties)).toEqual(
      expect.arrayContaining(['code', 'key', 'message', 'params', 'details']),
    );

    const list = doc.paths['/api/v1/docs-demo']!.get as typeof post;
    const listSchema = list.responses['200']!.content['application/json']!.schema;
    expect(listSchema.properties.data).toMatchObject({ type: 'array' });
    expect(listSchema.properties).toHaveProperty('meta');
  });

  it('decorator tài liệu không ảnh hưởng validate: body sai vẫn trả 422, đúng thì áp default', async () => {
    const server = app.getHttpServer();
    const bad = await request(server).post('/api/v1/docs-demo').send({ name: '', price: 'abc' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.key).toBe('errors.validation');

    const ok = await request(server).post('/api/v1/docs-demo').send({ name: 'A', price: '10.5' });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toEqual({ name: 'A', price: '10.5', quantity: 1 });
  });
});
