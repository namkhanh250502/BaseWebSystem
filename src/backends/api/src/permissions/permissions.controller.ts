import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  idParamSchema,
  syncPermissionsSchema,
  updatePermissionSchema,
  type IdParam,
} from '@base/shared';
import type { z } from 'zod';
import { RequirePermission, ZodBody, ZodParams } from '../decorators/customize';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @RequirePermission('permissions.list')
  @Get()
  list() {
    return this.permissionsService.list();
  }

  /** Xem trước thay đổi khi đồng bộ quyền trong DB với danh sách định nghĩa trong code */
  @RequirePermission('permissions.syncPreview')
  @Get('sync')
  previewSync() {
    return this.permissionsService.previewSync();
  }

  @RequirePermission('permissions.sync')
  @HttpCode(HttpStatus.OK)
  @Post('sync')
  sync(@ZodBody(syncPermissionsSchema) { removeStale }: z.infer<typeof syncPermissionsSchema>) {
    return this.permissionsService.sync(removeStale);
  }

  @RequirePermission('permissions.update')
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updatePermissionSchema) input: z.infer<typeof updatePermissionSchema>,
  ) {
    return this.permissionsService.update(id, input);
  }
}
