import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { validate } from '@base/server-kit';
import type { z } from 'zod';

/**
 * Validate body / query / params bằng schema zod dùng chung với frontend (@base/shared).
 * Sai dữ liệu → lỗi 422 `errors.validation` kèm `details` theo từng trường.
 */
@Injectable()
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown, metadata: ArgumentMetadata): z.infer<S> {
    // Request không có body (Express để undefined): coi như object rỗng
    const input = metadata.type === 'body' && value === undefined ? {} : value;
    return validate(this.schema, input);
  }
}
