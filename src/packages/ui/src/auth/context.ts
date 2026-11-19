import type { AuthSession, MeDto, PermissionKey } from '@base/shared';
import { createContext, useContext } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: MeDto | null;
  can: (permission: PermissionKey) => boolean;
  /** Gọi sau khi API đăng nhập/đăng ký trả về phiên mới */
  completeLogin: (session: AuthSession) => void;
  /** Cập nhật user trong bộ nhớ sau khi sửa profile */
  setUser: (user: MeDto) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>');
  return ctx;
}

/** Kiểm tra quyền: usePermission('users.update') */
export function usePermission(permission: PermissionKey): boolean {
  return useAuth().can(permission);
}
