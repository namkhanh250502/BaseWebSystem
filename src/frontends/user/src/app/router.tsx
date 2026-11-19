import { AccountPage, ErrorPage, GuestOnly, NotificationsPage, RequireAuth } from '@base/ui';
import { createBrowserRouter } from 'react-router';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from '@/pages/AuthPages';
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
          { path: '*', element: <ErrorPage status={404} /> },
        ],
      },
    ],
  },
]);
