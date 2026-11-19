import {
  createDashboardApi,
  createNotificationsAdminApi,
  createPermissionsApi,
  createRolesApi,
  createSettingsApi,
} from './endpoints/admin';
import { createAuthApi } from './endpoints/auth';
import { createMeApi } from './endpoints/me';
import { createUsersApi } from './endpoints/users';
import { createHttpClient, type HttpClientOptions } from './http';

export { ApiClientError, CONNECTIVITY_ERROR_CODES, createHttpClient, toPaginated } from './http';
export type { HttpClient, HttpClientOptions, HttpResult, RequestOptions } from './http';

/** Tạo SDK gọi API backend, dùng chung cho mọi frontend */
export function createApi(options: HttpClientOptions) {
  const http = createHttpClient(options);
  return {
    http,
    auth: createAuthApi(http, options.baseUrl, options.app),
    me: createMeApi(http),
    users: createUsersApi(http),
    roles: createRolesApi(http),
    permissions: createPermissionsApi(http),
    settings: createSettingsApi(http),
    notifications: createNotificationsAdminApi(http),
    dashboard: createDashboardApi(http),
  };
}

export type Api = ReturnType<typeof createApi>;
