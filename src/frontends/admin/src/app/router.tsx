import {
  AccountPage,
  ErrorPage,
  GuestOnly,
  NotificationsPage,
  RequireAuth,
  RequirePermission,
} from '@base/ui';
import { createBrowserRouter } from 'react-router';
import { PermissionsPage } from '@/features/permissions/PermissionsPage';
import { RolesPage } from '@/features/roles/RolesPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { UsersPage } from '@/features/users/UsersPage';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { AdminLayout } from './AdminLayout';

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
