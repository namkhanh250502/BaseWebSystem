import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import {
  assignPermissionsSchema,
  createRoleSchema,
  idParamSchema,
  listRolesQuerySchema,
  updateRoleSchema,
  type IdParam,
} from '@base/shared';
import { forbidden } from '@base/server-kit';
import type { z } from 'zod';
import type { Principal } from '../auth/principal';
import { paginated } from '../core/transform.interceptor';
import {
  CurrentPrincipal,
  RequirePermission,
  ZodBody,
  ZodParams,
  ZodQuery,
} from '../decorators/customize';
import { RolesService } from './roles.service';

/**
 * Cờ adminAccess thực chất là gán quyền `admin.access`, nên ngoài roles.create/roles.update
 * còn cần quyền phân quyền — tránh người chỉ được sửa role tự mở cửa vào trang admin.
 */
function assertCanSetAdminAccess(adminAccess: boolean | undefined, principal: Principal) {
  if (adminAccess !== undefined && !principal.can('roles.assignPermissions')) {
    throw forbidden('roles.adminAccessForbidden');
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Trang user cũng cần danh sách role để chọn khi gán
  @RequirePermission('roles.list', 'users.list')
  @Get()
  async list(@ZodQuery(listRolesQuerySchema) query: z.infer<typeof listRolesQuerySchema>) {
    return paginated(await this.rolesService.list(query));
  }

  @RequirePermission('roles.create')
  @Post()
  create(
    @ZodBody(createRoleSchema) input: z.infer<typeof createRoleSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    assertCanSetAdminAccess(input.adminAccess, principal);
    return this.rolesService.create(input);
  }

  @RequirePermission('roles.view')
  @Get(':id')
  get(@ZodParams(idParamSchema) { id }: IdParam) {
    return this.rolesService.getById(id);
  }

  @RequirePermission('roles.update')
  @Patch(':id')
  update(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(updateRoleSchema) input: z.infer<typeof updateRoleSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    assertCanSetAdminAccess(input.adminAccess, principal);
    return this.rolesService.update(id, input);
  }

  @RequirePermission('roles.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@ZodParams(idParamSchema) { id }: IdParam) {
    await this.rolesService.remove(id);
  }

  @RequirePermission('roles.assignPermissions')
  @Put(':id/permissions')
  setPermissions(
    @ZodParams(idParamSchema) { id }: IdParam,
    @ZodBody(assignPermissionsSchema) { permissions }: z.infer<typeof assignPermissionsSchema>,
  ) {
    return this.rolesService.setPermissions(id, permissions);
  }
}
