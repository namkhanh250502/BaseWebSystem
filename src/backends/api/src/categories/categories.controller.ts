import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  categoryDtoSchema,
  createCategorySchema,
  idParamSchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
  type IdParam,
} from '@base/shared';
import type { z } from 'zod';
import { paginated } from '../core/transform.interceptor';
import { ApiErrors, ApiZodBody, ApiZodQuery, ApiZodResponse } from '../decorators/api-docs';
import { RequirePermission, ZodBody, ZodParams, ZodQuery } from '../decorators/customize';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiErrors(401, 403)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @RequirePermission('categories.list')
  @ApiZodQuery(listCategoriesQuerySchema)
  @ApiZodResponse(categoryDtoSchema, { paginated: true })
  @Get()
  async list(
    @ZodQuery(listCategoriesQuerySchema) query: z.infer<typeof listCategoriesQuerySchema>,
  ) {
    return paginated(await this.categoriesService.list(query));
  }

  @RequirePermission('categories.list')
  @ApiZodResponse(categoryDtoSchema)
  @ApiErrors(404)
  @Get(':id')
  get(@ZodParams(idParamSchema) { id }: IdParam) {
    return this.categoriesService.get(id);
  }

  @RequirePermission('categories.create')
  @ApiZodBody(createCategorySchema)
  @ApiZodResponse(categoryDtoSchema, { status: 201 })
  @ApiErrors(409, 422)
  @Post()
  create(@ZodBody(createCategorySchema) input: z.infer<typeof createCategorySchema>) {
    return this.categoriesService.create(input);
  }

  @RequirePermission('categories.update')
  @ApiZodBody(updateCategorySchema)
  @ApiZodResponse(categoryDtoSchema)
  @ApiErrors(404, 409, 422)
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updateCategorySchema) input: z.infer<typeof updateCategorySchema>,
  ) {
    return this.categoriesService.update(id, input);
  }

  @RequirePermission('categories.delete')
  @ApiErrors(404, 409)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@ZodParams(idParamSchema) { id }: IdParam) {
    await this.categoriesService.remove(id);
  }
}
