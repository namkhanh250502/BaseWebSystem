// Providers & i18n
export { AppProviders, type AppProvidersProps } from './providers/AppProviders';
export { baseTheme } from './providers/theme';
export { notifySessionExpired, useApi } from './providers/ApiContext';
export { createI18n, currentLocale, type AppResources } from './i18n/createI18n';

// Auth
export { AuthProvider } from './auth/AuthProvider';
export { useAuth, usePermission, type AuthContextValue, type AuthStatus } from './auth/context';
export { Can, FullPageSpin, GuestOnly, RequireAuth, RequirePermission } from './auth/guards';
export { LoginForm } from './auth/LoginForm';
export { ForgotPasswordForm, ResetPasswordForm } from './auth/PasswordForms';
export { BackupCodesModal } from './auth/BackupCodesModal';
export { TwoFactorSetupPanel } from './auth/TwoFactorSetupPanel';

// Account
export { AccountPage } from './account/AccountPage';
export { ChangePasswordForm } from './account/ChangePasswordForm';
export { EmailVerificationForm } from './account/EmailVerificationForm';
export { EmailVerificationScreen } from './account/EmailVerificationScreen';
export { LoginHistoryTable, type LoginHistoryTableProps } from './account/LoginHistoryTable';
export { ProfileInfoForm } from './account/ProfileInfoForm';
export { TwoFactorSettings } from './account/TwoFactorSettings';

// Components
export { AppShell, type AppShellProps, type NavGroup, type NavItem } from './components/AppShell';
export { AuthLayout } from './components/AuthLayout';
export { ErrorPage } from './components/ErrorPage';
export { LanguageSwitcher } from './components/LanguageSwitcher';
export { PageHeader, SettingsSection } from './components/PageHeader';
export { UserAvatar, UserCell } from './components/UserAvatar';

// Notifications
export { NotificationBell, type NotificationBellProps } from './notifications/NotificationBell';
export { NotificationItem } from './notifications/NotificationItem';
export { NotificationsPage } from './notifications/NotificationsPage';
export {
  useMarkNotifications,
  useNotificationList,
  useUnreadCount,
} from './notifications/useNotifications';

// Hooks & utils
export * from './hooks';
export * from './utils';
