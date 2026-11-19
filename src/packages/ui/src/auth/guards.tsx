import type { PermissionKey } from '@base/shared';
import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { EmailVerificationScreen } from '../account/EmailVerificationScreen';
import { ErrorPage } from '../components/ErrorPage';
import { useAuth } from './context';

export function FullPageSpin() {
  return (
    <div className="b-fullpage-center">
      <Spin size="large" />
    </div>
  );
}

/** Bọc các route cần đăng nhập */
export function RequireAuth({ loginPath = '/login' }: { loginPath?: string }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpin />;
  if (status === 'anonymous') {
    return (
      <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />
    );
  }
  // Hệ thống bắt buộc xác minh email: chỉ hiện màn hình nhập mã cho tới khi xác minh xong
  if (user?.emailVerificationRequired) return <EmailVerificationScreen />;
  return <Outlet />;
}

/** Bọc các trang chỉ dành cho khách (đăng nhập, đăng ký...): đã đăng nhập thì chuyển đi */
export function GuestOnly({ redirectTo = '/' }: { redirectTo?: string }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpin />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? redirectTo} replace />;
  }
  return <Outlet />;
}

/** Hiển thị trang 403 nếu thiếu quyền */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey | PermissionKey[];
  children: ReactNode;
}) {
  const { can } = useAuth();
  const list = Array.isArray(permission) ? permission : [permission];
  return list.some(can) ? <>{children}</> : <ErrorPage status={403} />;
}

/** Chỉ render children khi có quyền */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionKey | PermissionKey[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAuth();
  const list = Array.isArray(permission) ? permission : [permission];
  return <>{list.some(can) ? children : fallback}</>;
}
