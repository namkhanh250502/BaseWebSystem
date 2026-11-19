import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createSupplierSchema,
  idParamSchema,
  listSuppliersQuerySchema,
  supplierDetailDtoSchema,
  supplierDtoSchema,
  updateSupplierSchema,
  type IdParam,
} from '@base/shared';
import type { z } from 'zod';
import { paginated } from '../core/transform.interceptor';
import { ApiErrors, ApiZodBody, ApiZodQuery, ApiZodResponse } from '../decorators/api-docs';
import { RequirePermission, ZodBody, ZodParams, ZodQuery } from '../decorators/customize';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiErrors(401, 403)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @RequirePermission('suppliers.list')
  @ApiZodQuery(listSuppliersQuerySchema)
  @ApiZodResponse(supplierDtoSchema, { paginated: true })
  @Get()
  async list(@ZodQuery(listSuppliersQuerySchema) query: z.infer<typeof listSuppliersQuerySchema>) {
    return paginated(await this.suppliersService.list(query));
  }

  @RequirePermission('suppliers.list')
  @ApiZodResponse(supplierDetailDtoSchema)
  @ApiErrors(404)
  @Get(':id')
  get(@ZodParams(idParamSchema) { id }: IdParam) {
    return this.suppliersService.get(id);
  }

  @RequirePermission('suppliers.create')
  @ApiZodBody(createSupplierSchema)
  @ApiZodResponse(supplierDtoSchema, { status: 201 })
  @ApiErrors(422)
  @Post()
  create(@ZodBody(createSupplierSchema) input: z.infer<typeof createSupplierSchema>) {
    return this.suppliersService.create(input);
  }

  @RequirePermission('suppliers.update')
  @ApiZodBody(updateSupplierSchema)
  @ApiZodResponse(supplierDtoSchema)
  @ApiErrors(404, 422)
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updateSupplierSchema) input: z.infer<typeof updateSupplierSchema>,
  ) {
    return this.suppliersService.update(id, input);
  }

  @RequirePermission('suppliers.delete')
  @ApiErrors(404, 409)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@ZodParams(idParamSchema) { id }: IdParam) {
    await this.suppliersService.remove(id);
  }
}
