import {
  AccountPage,
  ErrorPage,
  GuestOnly,
  NotificationsPage,
  RequireAuth,
  RequirePermission,
} from '@base/ui';
import type { PermissionKey } from '@base/shared';
import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { CategoriesPage } from '@/features/categories/CategoriesPage';
import { AdjustmentFormPage } from '@/features/inventory/AdjustmentFormPage';
import { AdjustmentDetailPage, AdjustmentsPage } from '@/features/inventory/AdjustmentsPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { MovementsPage } from '@/features/inventory/MovementsPage';
import { PermissionsPage } from '@/features/permissions/PermissionsPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { PurchaseDetailPage } from '@/features/purchases/PurchaseDetailPage';
import { PurchaseFormPage } from '@/features/purchases/PurchaseFormPage';
import { PurchasesPage } from '@/features/purchases/PurchasesPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { RolesPage } from '@/features/roles/RolesPage';
import { SalesOrderDetailPage, SalesOrdersPage } from '@/features/sales-orders/SalesOrdersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { UsersPage } from '@/features/users/UsersPage';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { AdminLayout } from './AdminLayout';

/** Route con bọc RequirePermission (backend vẫn kiểm tra quyền lại) */
function guarded(path: string, permission: PermissionKey | PermissionKey[], element: ReactNode) {
  return {
    path,
    element: <RequirePermission permission={permission}>{element}</RequirePermission>,
  };
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Trang đặt lại mật khẩu mở được cả khi đang đăng nhập
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'profile', element: <AccountPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          // ----- Bán hàng & tồn kho -----
          guarded('categories', 'categories.list', <CategoriesPage />),
          guarded('products', 'products.list', <ProductsPage />),
          guarded('suppliers', 'suppliers.list', <SuppliersPage />),
          guarded('purchases', 'purchases.list', <PurchasesPage />),
          guarded('purchases/new', 'purchases.create', <PurchaseFormPage />),
          guarded('purchases/:id', 'purchases.list', <PurchaseDetailPage />),
          guarded('purchases/:id/edit', 'purchases.update', <PurchaseFormPage />),
          guarded('sales-orders', 'sales.list', <SalesOrdersPage />),
          guarded('sales-orders/:id', 'sales.list', <SalesOrderDetailPage />),
          guarded('inventory', 'inventory.list', <InventoryPage />),
          guarded('inventory/movements', 'inventory.movements', <MovementsPage />),
          guarded('inventory/adjustments', 'inventory.adjustments.list', <AdjustmentsPage />),
          guarded('inventory/adjustments/new', 'inventory.adjust', <AdjustmentFormPage />),
          guarded(
            'inventory/adjustments/:id',
            'inventory.adjustments.list',
            <AdjustmentDetailPage />,
          ),
          guarded(
            'reports',
            ['reports.sales', 'reports.profit', 'reports.purchases', 'reports.inventory'],
            <ReportsPage />,
          ),
          {
            path: 'users',
            element: (
              <RequirePermission permission="users.list">
                <UsersPage />
              </RequirePermission>
            ),
          },
          {
            path: 'roles',
            element: (
              <RequirePermission permission="roles.list">
                <RolesPage />
              </RequirePermission>
            ),
          },
          {
            path: 'permissions',
            element: (
              <RequirePermission permission="permissions.list">
                <PermissionsPage />
              </RequirePermission>
            ),
          },
          {
            path: 'settings',
            element: (
              <RequirePermission permission="settings.list">
                <SettingsPage />
              </RequirePermission>
            ),
          },
          { path: '*', element: <ErrorPage status={404} /> },
        ],
      },
    ],
  },
]);
