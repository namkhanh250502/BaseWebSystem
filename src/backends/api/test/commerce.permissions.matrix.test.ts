import { randomUUID } from 'node:crypto';
import { DEFAULT_ROLE_PERMISSIONS, type PermissionKey } from '@base/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers/app';
import { signedInClient } from './helpers/flows';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Mọi API mới của tính năng bán hàng & tồn kho → quyền yêu cầu (contracts/permissions.md) */
const id = randomUUID();
const ENDPOINTS: { method: Method; path: string; route: string; permissions: PermissionKey[] }[] = [
  { method: 'get', path: '/categories', route: '/categories', permissions: ['categories.list'] },
  {
    method: 'get',
    path: `/categories/${id}`,
    route: '/categories/{id}',
    permissions: ['categories.list'],
  },
  { method: 'post', path: '/categories', route: '/categories', permissions: ['categories.create'] },
  {
    method: 'patch',
    path: `/categories/${id}`,
    route: '/categories/{id}',
    permissions: ['categories.update'],
  },
  {
    method: 'delete',
    path: `/categories/${id}`,
    route: '/categories/{id}',
    permissions: ['categories.delete'],
  },
  { method: 'get', path: '/products', route: '/products', permissions: ['products.list'] },
  {
    method: 'get',
    path: `/products/${id}`,
    route: '/products/{id}',
    permissions: ['products.list'],
  },
  { method: 'post', path: '/products', route: '/products', permissions: ['products.create'] },
  {
    method: 'patch',
    path: `/products/${id}`,
    route: '/products/{id}',
    permissions: ['products.update'],
  },
  {
    method: 'delete',
    path: `/products/${id}`,
    route: '/products/{id}',
    permissions: ['products.delete'],
  },
  {
    method: 'post',
    path: `/products/${id}/images/upload-requests`,
    route: '/products/{id}/images/upload-requests',
    permissions: ['products.update'],
  },
  {
    method: 'post',
    path: `/products/${id}/images/${id}/complete`,
    route: '/products/{id}/images/{imageId}/complete',
    permissions: ['products.update'],
  },
  {
    method: 'patch',
    path: `/products/${id}/images/${id}`,
    route: '/products/{id}/images/{imageId}',
    permissions: ['products.update'],
  },
  {
    method: 'put',
    path: `/products/${id}/images/order`,
    route: '/products/{id}/images/order',
    permissions: ['products.update'],
  },
  {
    method: 'delete',
    path: `/products/${id}/images/${id}`,
    route: '/products/{id}/images/{imageId}',
    permissions: ['products.update'],
  },
  { method: 'get', path: '/suppliers', route: '/suppliers', permissions: ['suppliers.list'] },
  {
    method: 'get',
    path: `/suppliers/${id}`,
    route: '/suppliers/{id}',
    permissions: ['suppliers.list'],
  },
  { method: 'post', path: '/suppliers', route: '/suppliers', permissions: ['suppliers.create'] },
  {
    method: 'patch',
    path: `/suppliers/${id}`,
    route: '/suppliers/{id}',
    permissions: ['suppliers.update'],
  },
  {
    method: 'delete',
    path: `/suppliers/${id}`,
    route: '/suppliers/{id}',
    permissions: ['suppliers.delete'],
  },
  { method: 'get', path: '/purchases', route: '/purchases', permissions: ['purchases.list'] },
  {
    method: 'get',
    path: `/purchases/${id}`,
    route: '/purchases/{id}',
    permissions: ['purchases.list'],
  },
  { method: 'post', path: '/purchases', route: '/purchases', permissions: ['purchases.create'] },
  {
    method: 'patch',
    path: `/purchases/${id}`,
    route: '/purchases/{id}',
    permissions: ['purchases.update'],
  },
  {
    method: 'post',
    path: `/purchases/${id}/confirm`,
    route: '/purchases/{id}/confirm',
    permissions: ['purchases.confirm'],
  },
  {
    method: 'post',
    path: `/purchases/${id}/cancel`,
    route: '/purchases/{id}/cancel',
    permissions: ['purchases.cancel'],
  },
  { method: 'get', path: '/sales-orders', route: '/sales-orders', permissions: ['sales.list'] },
  {
    method: 'get',
    path: `/sales-orders/${id}`,
    route: '/sales-orders/{id}',
    permissions: ['sales.list'],
  },
  { method: 'post', path: '/sales-orders', route: '/sales-orders', permissions: ['sales.create'] },
  {
    method: 'patch',
    path: `/sales-orders/${id}`,
    route: '/sales-orders/{id}',
    permissions: ['sales.update'],
  },
  {
    method: 'post',
    path: `/sales-orders/${id}/confirm`,
    route: '/sales-orders/{id}/confirm',
    permissions: ['sales.confirm'],
  },
  {
    method: 'post',
    path: `/sales-orders/${id}/pay`,
    route: '/sales-orders/{id}/pay',
    permissions: ['sales.pay'],
  },
  {
    method: 'post',
    path: `/sales-orders/${id}/cancel`,
    route: '/sales-orders/{id}/cancel',
    permissions: ['sales.cancel', 'sales.update'],
  },
  { method: 'get', path: '/inventory', route: '/inventory', permissions: ['inventory.list'] },
  {
    method: 'get',
    path: '/inventory/summary',
    route: '/inventory/summary',
    permissions: ['inventory.list'],
  },
  {
    method: 'get',
    path: '/inventory/movements',
    route: '/inventory/movements',
    permissions: ['inventory.movements'],
  },
  {
    method: 'get',
    path: '/inventory/adjustments',
    route: '/inventory/adjustments',
    permissions: ['inventory.adjustments.list'],
  },
  {
    method: 'get',
    path: `/inventory/adjustments/${id}`,
    route: '/inventory/adjustments/{id}',
    permissions: ['inventory.adjustments.list'],
  },
  {
    method: 'post',
    path: '/inventory/adjustments',
    route: '/inventory/adjustments',
    permissions: ['inventory.adjust'],
  },
  {
    method: 'get',
    path: '/dashboard/sales-summary',
    route: '/dashboard/sales-summary',
    permissions: ['dashboard.salesSummary'],
  },
  {
    method: 'get',
    path: '/reports/sales/daily',
    route: '/reports/sales/daily',
    permissions: ['reports.sales'],
  },
  {
    method: 'get',
    path: '/reports/sales/monthly',
    route: '/reports/sales/monthly',
    permissions: ['reports.sales'],
  },
  {
    method: 'get',
    path: '/reports/sales/by-product',
    route: '/reports/sales/by-product',
    permissions: ['reports.sales'],
  },
  {
    method: 'get',
    path: '/reports/profit',
    route: '/reports/profit',
    permissions: ['reports.profit'],
  },
  {
    method: 'get',
    path: '/reports/purchases',
    route: '/reports/purchases',
    permissions: ['reports.purchases'],
  },
  {
    method: 'get',
    path: '/reports/inventory',
    route: '/reports/inventory',
    permissions: ['reports.inventory'],
  },
  {
    method: 'get',
    path: '/reports/inventory-movements',
    route: '/reports/inventory-movements',
    permissions: ['reports.inventory'],
  },
];

const COMMERCE_PREFIXES = [
  '/categories',
  '/products',
  '/suppliers',
  '/purchases',
  '/sales-orders',
  '/inventory',
  '/reports',
  '/dashboard/sales-summary',
];

describe('Phân quyền bán hàng: ma trận mọi endpoint (SC-008, SC-010)', () => {
  let t: TestApp;
  const clients: Record<'Manager' | 'Staff' | 'User', Client> = {} as never;
  beforeAll(async () => {
    t = await createTestApp({ apiDocs: true });
    clients.Manager = (await signedInClient(t, { role: 'Manager' }, 'admin')).client;
    clients.Staff = (await signedInClient(t, { role: 'Staff' })).client;
    clients.User = (await signedInClient(t)).client;
  });
  afterAll(async () => {
    await t.close();
  });

  it('ma trận phủ đủ mọi route mới (đọc từ OpenAPI, không bỏ sót controller nào)', async () => {
    const doc = (await request(t.server).get('/api/docs-json')).body as {
      paths: Record<string, Record<string, unknown>>;
    };
    const documented = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops)
        .filter((m) => ['get', 'post', 'patch', 'put', 'delete'].includes(m))
        .map((m) => `${m} ${path.replace('/api/v1', '')}`),
    );
    const commerce = documented.filter((r) =>
      COMMERCE_PREFIXES.some((p) => r.split(' ')[1]!.startsWith(p)),
    );
    const covered = ENDPOINTS.map((e) => `${e.method} ${e.route}`);
    expect(commerce.filter((r) => !covered.includes(r))).toEqual([]);
    expect(covered.filter((r) => !commerce.includes(r))).toEqual([]);
  });

  it.each(ENDPOINTS)('$method $route: chưa đăng nhập → 401', async ({ method, path }) => {
    const res = await new Client(t.server)[method](path);
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it.each(ENDPOINTS)(
    '$method $route: quyền theo vai trò Manager / Staff / User mặc định',
    async (endpoint) => {
      for (const role of ['Manager', 'Staff', 'User'] as const) {
        const granted =
          role === 'User'
            ? false
            : endpoint.permissions.some((p) => DEFAULT_ROLE_PERMISSIONS[role].includes(p));
        const res = await clients[role][endpoint.method](endpoint.path);
        if (granted) {
          expect(
            [401, 403],
            `${role} ${endpoint.method} ${endpoint.path}: ${JSON.stringify(res.body)}`,
          ).not.toContain(res.status);
        } else {
          expect(res.status, `${role} ${endpoint.method} ${endpoint.path}`).toBe(403);
        }
      }
    },
  );
});
