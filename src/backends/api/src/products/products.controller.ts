import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createProductSchema,
  idParamSchema,
  imageOrderSchema,
  imageUploadRequestSchema,
  imageUploadTicketSchema,
  listProductsQuerySchema,
  productDetailDtoSchema,
  productDtoSchema,
  productImageDtoSchema,
  setPrimaryImageSchema,
  updateProductSchema,
  type IdParam,
} from '@base/shared';
import { z } from 'zod';
import type { Principal } from '../auth/principal';
import { paginated } from '../core/transform.interceptor';
import { ApiErrors, ApiZodBody, ApiZodQuery, ApiZodResponse } from '../decorators/api-docs';
import {
  CurrentPrincipal,
  RequirePermission,
  ZodBody,
  ZodParams,
  ZodQuery,
} from '../decorators/customize';
import { ProductImagesService } from './product-images.service';
import { ProductsService, type ViewerContext } from './products.service';

const imageParamsSchema = z.object({ id: z.uuid(), imageId: z.uuid() });
type ImageParams = z.infer<typeof imageParamsSchema>;

const viewer = (principal: Principal): ViewerContext => ({
  canViewCost: principal.can('products.viewCost'),
});

@ApiTags('products')
@ApiErrors(401, 403)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly imagesService: ProductImagesService,
  ) {}

  @RequirePermission('products.list')
  @ApiZodQuery(listProductsQuerySchema)
  @ApiZodResponse(productDtoSchema, { paginated: true })
  @Get()
  async list(
    @ZodQuery(listProductsQuerySchema) query: z.infer<typeof listProductsQuerySchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return paginated(await this.productsService.list(query, viewer(principal)));
  }

  @RequirePermission('products.list')
  @ApiZodResponse(productDetailDtoSchema)
  @ApiErrors(404)
  @Get(':id')
  get(@ZodParams(idParamSchema) { id }: IdParam, @CurrentPrincipal() principal: Principal) {
    return this.productsService.get(id, viewer(principal));
  }

  @RequirePermission('products.create')
  @ApiZodBody(createProductSchema)
  @ApiZodResponse(productDetailDtoSchema, { status: 201 })
  @ApiErrors(404, 409, 422)
  @Post()
  create(
    @ZodBody(createProductSchema) input: z.infer<typeof createProductSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.productsService.create(input, principal.user.id, viewer(principal));
  }

  @RequirePermission('products.update')
  @ApiZodBody(updateProductSchema)
  @ApiZodResponse(productDetailDtoSchema)
  @ApiErrors(404, 409, 422)
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updateProductSchema) input: z.infer<typeof updateProductSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.productsService.update(id, input, viewer(principal));
  }

  @RequirePermission('products.delete')
  @ApiErrors(404, 409)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@ZodParams(idParamSchema) { id }: IdParam) {
    await this.productsService.remove(id);
  }

  // ----- Ảnh (contracts/storage-upload.md) -----

  @RequirePermission('products.update')
  @ApiZodBody(imageUploadRequestSchema)
  @ApiZodResponse(imageUploadTicketSchema, {
    status: 201,
    description: 'Form POST ký sẵn tới MinIO',
  })
  @ApiErrors(404, 409, 422, 503)
  @Post(':id/images/upload-requests')
  requestUpload(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(imageUploadRequestSchema) input: z.infer<typeof imageUploadRequestSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.imagesService.requestUpload(id, input, principal.user.id);
  }

  @RequirePermission('products.update')
  @ApiZodResponse(productImageDtoSchema)
  @ApiErrors(404, 409, 422, 503)
  @HttpCode(HttpStatus.OK)
  @Post(':id/images/:imageId/complete')
  complete(@ZodParams(imageParamsSchema) { id, imageId }: ImageParams) {
    return this.imagesService.complete(id, imageId);
  }

  @RequirePermission('products.update')
  @ApiZodBody(setPrimaryImageSchema)
  @ApiZodResponse(z.array(productImageDtoSchema))
  @ApiErrors(404)
  @Patch(':id/images/:imageId')
  setPrimary(
    @ZodParams(imageParamsSchema) { id, imageId }: ImageParams,
    @ZodBody(setPrimaryImageSchema) _input: z.infer<typeof setPrimaryImageSchema>,
  ) {
    return this.imagesService.setPrimary(id, imageId);
  }

  @RequirePermission('products.update')
  @ApiZodBody(imageOrderSchema)
  @ApiZodResponse(z.array(productImageDtoSchema))
  @ApiErrors(404, 422)
  @Put(':id/images/order')
  reorder(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(imageOrderSchema) { imageIds }: z.infer<typeof imageOrderSchema>,
  ) {
    return this.imagesService.reorder(id, imageIds);
  }

  @RequirePermission('products.update')
  @ApiErrors(404)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/images/:imageId')
  async removeImage(@ZodParams(imageParamsSchema) { id, imageId }: ImageParams) {
    await this.imagesService.remove(id, imageId);
  }
}
