import type {
  CreateRoleInput,
  ImportSettingsInput,
  ImportSettingsResult,
  ListRolesQuery,
  PermissionDto,
  PermissionKey,
  PermissionSyncPreview,
  PermissionSyncResult,
  PublicSettings,
  RoleDto,
  SendNotificationInput,
  SettingGroupDto,
  SettingsExportFile,
  UpdatePermissionInput,
  UpdateRoleInput,
  UserGrowthDto,
} from '@base/shared';
import { toPaginated, type HttpClient } from '../http';

export function createRolesApi(http: HttpClient) {
  return {
    list: async (query: ListRolesQuery = {}) =>
      toPaginated(await http.get<RoleDto[]>('/roles', { query })),
    get: async (id: string) => (await http.get<RoleDto>(`/roles/${id}`)).data,
    create: async (input: CreateRoleInput) => (await http.post<RoleDto>('/roles', input)).data,
    update: async (id: string, input: UpdateRoleInput) =>
      (await http.patch<RoleDto>(`/roles/${id}`, input)).data,
    remove: async (id: string) => {
      await http.delete(`/roles/${id}`);
    },
    setPermissions: async (id: string, permissions: PermissionKey[]) =>
      (await http.put<RoleDto>(`/roles/${id}/permissions`, { permissions })).data,
  };
}

export function createPermissionsApi(http: HttpClient) {
  return {
    list: async () => (await http.get<PermissionDto[]>('/permissions')).data,
    update: async (id: string, input: UpdatePermissionInput) =>
      (await http.patch<PermissionDto>(`/permissions/${id}`, input)).data,
    previewSync: async () => (await http.get<PermissionSyncPreview>('/permissions/sync')).data,
    sync: async (removeStale: boolean) =>
      (await http.post<PermissionSyncResult>('/permissions/sync', { removeStale })).data,
  };
}

export function createSettingsApi(http: HttpClient) {
  return {
    public: async () => (await http.get<PublicSettings>('/settings/public')).data,
    /** Key hệ thống theo nhóm: nhãn, mô tả, kiểu, lựa chọn + giá trị (key bí mật không có giá trị) */
    list: async () => (await http.get<SettingGroupDto[]>('/settings')).data,
    /** Lưu các key được gửi lên; key bí mật không gửi thì giữ nguyên */
    update: async (values: Record<string, string | null>) =>
      (await http.put<SettingGroupDto[]>('/settings', { values })).data,
    export: async (includeSecrets: boolean) =>
      (await http.get<SettingsExportFile>('/settings/export', { query: { includeSecrets } })).data,
    import: async (input: ImportSettingsInput) =>
      (await http.post<ImportSettingsResult>('/settings/import', input)).data,
  };
}

export function createNotificationsAdminApi(http: HttpClient) {
  return {
    send: async (input: SendNotificationInput) =>
      (await http.post<{ id: string }>('/notifications', input)).data,
  };
}

export function createDashboardApi(http: HttpClient) {
  return {
    userGrowth: async (year?: number) =>
      (await http.get<UserGrowthDto>('/dashboard/user-growth', { query: { year } })).data,
  };
}
