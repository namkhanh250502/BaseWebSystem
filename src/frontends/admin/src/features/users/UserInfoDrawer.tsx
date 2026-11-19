import {
  CheckCircleOutlined,
  CrownOutlined,
  ExclamationCircleOutlined,
  GoogleOutlined,
  LockOutlined,
  SafetyOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { LOCALES, type UpdateUserInput, type UserDto } from '@base/shared';
import {
  formatDateTime,
  LoginHistoryTable,
  useApi,
  useAuth,
  UserCell,
  useNotifyError,
} from '@base/ui';
import { Alert, App, Button, Descriptions, Drawer, Popconfirm, Tag, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EditableField } from './EditableField';

const { Text } = Typography;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 100;

export interface UserInfoDrawerProps {
  user: UserDto | null;
  open: boolean;
  onClose: () => void;
  /** Gọi sau mỗi lần lưu thành công để trang danh sách tải lại */
  onUpdated: () => void;
  /** Có quyền sửa user này (users.update và không phải super admin khi mình không phải super admin) */
  canEdit: boolean;
  /** Có quyền đặt lại mật khẩu cho user này */
  canResetPassword: boolean;
  /** Có quyền xem lịch sử đăng nhập (users.loginHistory) */
  canViewLoginHistory: boolean;
}

/** Tiêu đề nhóm thông tin */
function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="admin-info-section">{children}</div>;
}

/**
 * Drawer (trượt từ phải) thông tin người dùng: xem toàn bộ, sửa từng trường tại chỗ (bút chì)
 * và đặt lại mật khẩu ngẫu nhiên. Vai trò / trạng thái sửa ở UserFormDrawer.
 */
export function UserInfoDrawer({
  user,
  open,
  onClose,
  onUpdated,
  canEdit,
  canResetPassword,
  canViewLoginHistory,
}: UserInfoDrawerProps) {
  const { t } = useTranslation(['users', 'common', 'auth']);
  const api = useApi();
  const { user: me } = useAuth();
  const { message, modal } = App.useApp();
  const notifyError = useNotifyError();
  // Đổi email là thao tác nhạy cảm (ảnh hưởng đăng nhập) → chỉ super admin
  const canEditEmail = canEdit && Boolean(me?.isSuperAdmin);

  // Bản sao cục bộ, cập nhật theo response sau mỗi lần lưu
  const [current, setCurrent] = useState<UserDto | null>(user);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Mỗi lần mở (hoặc đổi user) → nạp lại bản sao và xoá mật khẩu vừa tạo
  const [openedFor, setOpenedFor] = useState<UserDto | null>(open ? user : null);
  const target = open ? user : null;
  if (target !== openedFor) {
    setOpenedFor(target);
    if (target) {
      setCurrent(target);
      setNewPassword(null);
      setPasswordCopied(false);
    }
  }

  const saveField = async (payload: UpdateUserInput) => {
    if (!current) return;
    try {
      const updated = await api.users.update(current.id, payload);
      setCurrent(updated);
      void message.success(t('messages.updated'));
      onUpdated();
    } catch (err) {
      notifyError(err);
      throw err;
    }
  };

  const validateEmail = (value: string) => {
    if (!value) return t('info.emailRequired');
    return EMAIL_REGEX.test(value) && value.length <= 255 ? null : t('info.invalidEmail');
  };

  const validateName = (requiredMessage: string) => (value: string) => {
    if (!value) return requiredMessage;
    return value.length > NAME_MAX ? t('info.tooLong', { max: NAME_MAX }) : null;
  };

  const handleResetPassword = async () => {
    if (!current) return;
    setResetting(true);
    try {
      const { password } = await api.users.resetPassword(current.id);
      setNewPassword(password);
      setPasswordCopied(false);
    } catch (err) {
      notifyError(err);
    } finally {
      setResetting(false);
    }
  };

  // Mật khẩu chỉ hiện 1 lần → hỏi lại nếu đóng khi chưa sao chép
  const handleClose = () => {
    if (newPassword && !passwordCopied) {
      modal.confirm({
        title: t('info.notCopiedTitle'),
        content: t('info.notCopiedContent'),
        okText: t('info.closeAnyway'),
        okButtonProps: { danger: true },
        cancelText: t('info.stay'),
        onOk: onClose,
      });
      return;
    }
    onClose();
  };

  const descriptionsProps = {
    bordered: true,
    size: 'small' as const,
    // Phải khai báo đủ breakpoint, thiếu thì antd tự lấy mặc định 3 cặp/hàng
    column: { xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 },
    styles: { label: { width: 160, whiteSpace: 'nowrap' as const } },
  };

  return (
    <Drawer
      title={t('info.title')}
      open={open}
      placement="right"
      onClose={handleClose}
      mask={{ closable: false }}
      // Không vượt quá bề rộng màn hình nhỏ
      size="min(900px, 100vw)"
      destroyOnHidden
      extra={<Button onClick={handleClose}>{t('common:close')}</Button>}
    >
      {current && (
        <>
          <div className="admin-info-header">
            <div className="admin-info-header__user">
              <UserCell user={current} size={48} />
              <div className="admin-info-header__tags">
                {current.isSuperAdmin && (
                  <Tag icon={<CrownOutlined />} color="volcano">
                    {t('superAdmin')}
                  </Tag>
                )}
                <Tag
                  color={current.isActive ? 'success' : 'error'}
                  icon={current.isActive ? <CheckCircleOutlined /> : <StopOutlined />}
                >
                  {current.isActive ? t('status.active') : t('status.locked')}
                </Tag>
                <Tag
                  color={current.emailVerified ? 'success' : 'warning'}
                  icon={
                    current.emailVerified ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />
                  }
                >
                  {current.emailVerified ? t('emailVerified') : t('emailUnverified')}
                </Tag>
                {current.googleLinked && <Tag icon={<GoogleOutlined />}>{t('google')}</Tag>}
                {current.twoFactorEnabled && (
                  <Tag icon={<SafetyOutlined />} color="blue">
                    2FA
                  </Tag>
                )}
              </div>
            </div>
            {canResetPassword && (
              <Popconfirm
                title={t('actions.resetPassword')}
                description={<div style={{ maxWidth: 300 }}>{t('info.resetPasswordConfirm')}</div>}
                okText={t('actions.resetPassword')}
                okButtonProps={{ danger: true }}
                cancelText={t('common:cancel')}
                onConfirm={handleResetPassword}
                placement="bottomRight"
              >
                <Button danger icon={<LockOutlined />} loading={resetting}>
                  {t('actions.resetPassword')}
                </Button>
              </Popconfirm>
            )}
          </div>

          {newPassword && (
            <Alert
              className="b-mt-16"
              type="warning"
              showIcon
              title={
                <span>
                  {t('newPasswordTitle')}:{' '}
                  <Text
                    code
                    strong
                    style={{ fontSize: 16 }}
                    copyable={{ text: newPassword, onCopy: () => setPasswordCopied(true) }}
                  >
                    {newPassword}
                  </Text>
                </span>
              }
              description={t('newPasswordHint')}
            />
          )}

          <SectionTitle>{t('info.profile')}</SectionTitle>
          <Descriptions {...descriptionsProps}>
            <Descriptions.Item label={t('fields.email')} span={2}>
              <EditableField
                value={current.email}
                display={<Text copyable>{current.email}</Text>}
                editable={canEditEmail}
                maxLength={255}
                warning={t('info.emailChangeWarning')}
                validate={validateEmail}
                onSave={(email) => saveField({ email })}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t('fields.lastName')}>
              <EditableField
                value={current.lastName}
                editable={canEdit}
                maxLength={NAME_MAX}
                validate={validateName(t('auth:validation.lastNameRequired'))}
                onSave={(lastName) => saveField({ lastName })}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t('fields.firstName')}>
              <EditableField
                value={current.firstName}
                editable={canEdit}
                maxLength={NAME_MAX}
                validate={validateName(t('auth:validation.firstNameRequired'))}
                onSave={(firstName) => saveField({ firstName })}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t('info.lang')}>
              <EditableField
                value={current.lang}
                display={t(`common:languages.${current.lang}`)}
                editable={canEdit}
                options={LOCALES.map((l) => ({ value: l, label: t(`common:languages.${l}`) }))}
                onSave={(lang) => saveField({ lang: lang as UserDto['lang'] })}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.role')}>
              {current.role ? (
                <Tag color="geekblue" style={{ margin: 0 }}>
                  {current.role.name}
                </Tag>
              ) : (
                <Text type="secondary">{t('noRole')}</Text>
              )}
            </Descriptions.Item>
          </Descriptions>

          <SectionTitle>{t('info.account')}</SectionTitle>
          <Descriptions {...descriptionsProps}>
            <Descriptions.Item label="ID" span={2}>
              <Text copyable className="admin-mono" style={{ fontSize: 13 }}>
                {current.id}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('info.password')}>
              {current.hasPassword ? (
                t('info.passwordSet')
              ) : (
                <Text type="secondary">{t('info.passwordNotSet')}</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.twoFactor')}>
              {current.twoFactorEnabled ? (
                t('info.twoFactorOn')
              ) : (
                <Text type="secondary">{t('info.twoFactorOff')}</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.lastLogin')}>
              {formatDateTime(current.lastLoginAt)}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.createdAt')}>
              {formatDateTime(current.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label={t('info.updatedAt')}>
              {formatDateTime(current.updatedAt)}
            </Descriptions.Item>
          </Descriptions>

          {canViewLoginHistory && (
            <>
              <SectionTitle>{t('info.loginHistory')}</SectionTitle>
              <LoginHistoryTable
                queryKey={['users', current.id, 'login-history']}
                fetcher={(query) => api.users.loginHistory(current.id, query)}
                pageSize={5}
                size="small"
              />
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
