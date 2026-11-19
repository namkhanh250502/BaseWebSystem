/* ---------------------------------------------------------
 * Decorator tài liệu OpenAPI (Swagger) sinh từ CHÍNH schema zod dùng để validate,
 * nên tài liệu không lệch với code (research R7). Không ảnh hưởng validate:
 * vẫn dùng @ZodBody / @ZodQuery / @ZodParams như cũ, decorator ở đây chỉ gắn metadata tài liệu.
 *
 * @ApiZodBody(schema)                      : body request
 * @ApiZodQuery(schema)                     : mỗi trường của schema object → 1 query param
 * @ApiZodResponse(schema, { status, paginated }) : response thành công bọc chuẩn { data, error, meta? }
 * @ApiErrors(404, 409, ...)                : các response lỗi { data: null, error: {...} }
 * ---------------------------------------------------------*/
import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

type Io = 'input' | 'output';

/**
 * zod → JSON Schema theo chuẩn OpenAPI 3.0. Request dùng kiểu `input` (trước default/transform),
 * response dùng `output`. Phần không biểu diễn được (transform, custom) thành schema rỗng thay vì ném lỗi.
 */
export function zodToOpenApi(schema: z.ZodType, io: Io = 'input'): SchemaObject {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' });
  // Kiểu JSON Schema của zod và SchemaObject của @nestjs/swagger mô tả cùng một cấu trúc OpenAPI 3.0
  return json as SchemaObject;
}

/** Body request lấy từ schema zod */
export function ApiZodBody(schema: z.ZodType, description?: string) {
  return ApiBody({ schema: zodToOpenApi(schema, 'input'), description });
}

/** Mỗi trường của schema object (đã qua `.extend` / `.partial`…) thành một query param */
export function ApiZodQuery(schema: z.ZodType) {
  const json = zodToOpenApi(schema, 'input');
  const required = new Set(json.required ?? []);
  const properties = Object.entries(json.properties ?? {});
  return applyDecorators(
    ...properties.map(([name, property]) =>
      ApiQuery({ name, required: required.has(name), schema: property }),
    ),
  );
}

const errorSchema: SchemaObject = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: { type: 'string', example: 'NOT_FOUND' },
    key: { type: 'string', description: 'Key i18n ổn định để frontend xử lý riêng' },
    message: { type: 'string', description: 'Thông báo đã dịch theo x-lang / Accept-Language' },
    params: { type: 'object', additionalProperties: true, description: 'Tham số của thông báo' },
    details: { description: 'Chi tiết theo trường / theo dòng' },
  },
};

const metaSchema: SchemaObject = {
  type: 'object',
  properties: {
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    total: { type: 'integer' },
  },
};

/** Bọc schema dữ liệu theo dạng response chuẩn `{ data, error: null, meta? }` */
export function successEnvelope(data: SchemaObject, paginated = false): SchemaObject {
  return {
    type: 'object',
    required: ['data', 'error'],
    properties: {
      data: paginated ? { type: 'array', items: data } : data,
      error: { type: 'object', nullable: true, example: null },
      ...(paginated ? { meta: metaSchema } : {}),
    },
  };
}

/** Response thành công. `paginated`: schema là 1 phần tử, `data` là mảng kèm `meta`. */
export function ApiZodResponse(
  schema: z.ZodType,
  options: { status?: number; description?: string; paginated?: boolean } = {},
) {
  return ApiResponse({
    status: options.status ?? 200,
    description: options.description ?? 'Thành công',
    schema: successEnvelope(zodToOpenApi(schema, 'output'), options.paginated),
  });
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Yêu cầu không hợp lệ',
  401: 'Chưa đăng nhập',
  403: 'Không có quyền',
  404: 'Không tìm thấy',
  409: 'Xung đột trạng thái / dữ liệu trùng',
  422: 'Dữ liệu không hợp lệ (errors.validation, kèm details theo trường)',
  429: 'Vượt giới hạn số lần thử',
  503: 'Dịch vụ phụ thuộc không khả dụng',
};

/** Các response lỗi chuẩn `{ data: null, error: {...} }` */
export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Lỗi',
        schema: {
          type: 'object',
          required: ['data', 'error'],
          properties: { data: { nullable: true, example: null }, error: errorSchema },
        },
      }),
    ),
  );
}
