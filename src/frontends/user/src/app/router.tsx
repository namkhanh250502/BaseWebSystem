import {
  AccountPage,
  ErrorPage,
  GuestOnly,
  NotificationsPage,
  RequireAuth,
  RequirePermission,
} from '@base/ui';
import { createBrowserRouter } from 'react-router';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '@/pages/AuthPages';
import { PosPage } from '@/features/pos/PosPage';
import { SalesDetailPage } from '@/features/sales/SalesDetailPage';
import { SalesHistoryPage } from '@/features/sales/SalesHistoryPage';
import { HomePage } from '@/pages/HomePage';
import { UserLayout } from './UserLayout';

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <UserLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'profile', element: <AccountPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          // Bán hàng: chỉ tài khoản có quyền (người tự đăng ký không thấy, backend cũng chặn)
          {
            path: 'pos',
            element: (
              <RequirePermission permission="sales.create">
                <PosPage />
              </RequirePermission>
            ),
          },
          {
            path: 'sales',
            element: (
              <RequirePermission permission="sales.list">
                <SalesHistoryPage />
              </RequirePermission>
            ),
          },
          {
            path: 'sales/:id',
            element: (
              <RequirePermission permission="sales.list">
                <SalesDetailPage />
              </RequirePermission>
            ),
          },
          { path: '*', element: <ErrorPage status={404} /> },
        ],
      },
    ],
  },
]);
