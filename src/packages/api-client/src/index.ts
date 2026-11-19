import {
  createDashboardApi,
  createNotificationsAdminApi,
  createPermissionsApi,
  createRolesApi,
  createSettingsApi,
} from './endpoints/admin';
import { createAuthApi } from './endpoints/auth';
import {
  createCategoriesApi,
  createInventoryApi,
  createProductsApi,
  createPurchasesApi,
  createReportsApi,
  createSalesOrdersApi,
  createSuppliersApi,
} from './endpoints/commerce';
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
    categories: createCategoriesApi(http),
    products: createProductsApi(http),
    suppliers: createSuppliersApi(http),
    purchases: createPurchasesApi(http),
    salesOrders: createSalesOrdersApi(http),
    inventory: createInventoryApi(http),
    reports: createReportsApi(http),
  };
}

export type Api = ReturnType<typeof createApi>;
