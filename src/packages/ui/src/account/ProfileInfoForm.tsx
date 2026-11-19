import {
  CheckCircleFilled,
  DeleteOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type UpdateProfileInput } from '@base/shared';
import { App, Button, Form, Input, Modal, Space, Tooltip, Typography, Upload } from 'antd';
import ImgCrop from 'antd-img-crop';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';
import { UserAvatar } from '../components/UserAvatar';
import { useApi } from '../providers/ApiContext';
import { useNotifyError } from '../hooks';
import { displayName, formatDateTime } from '../utils';
import { EmailVerificationForm } from './EmailVerificationForm';

/** Thông tin cá nhân: Email (chỉ đọc), Họ, Tên, Avatar */
export function ProfileInfoForm() {
  const { t } = useTranslation();
  const api = useApi();
  const { user, setUser } = useAuth();
  const { message } = App.useApp();
  const notifyError = useNotifyError();
  const [form] = Form.useForm<UpdateProfileInput>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  useEffect(() => {
    if (user) form.setFieldsValue({ firstName: user.firstName, lastName: user.lastName });
  }, [user, form]);

  if (!user) return null;

  async function save(values: UpdateProfileInput) {
    setSaving(true);
    try {
      setUser(await api.me.updateProfile(values));
      void message.success(t('account:profileUpdated'));
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: Blob, name: string) {
    setUploading(true);
    try {
      setUser(await api.me.uploadAvatar(file, name));
      void message.success(t('account:avatar.updated'));
    } catch (err) {
      notifyError(err);
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      setUser(await api.me.removeAvatar());
      void message.success(t('account:avatar.removed'));
    } catch (err) {
      notifyError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="b-profile-avatar">
        <UserAvatar user={user} size={80} />
        <div className="b-profile-avatar__body">
          <Typography.Text strong className="b-profile-avatar__name">
            {displayName(user)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {t('account:joinedAt', { date: formatDateTime(user.createdAt, false) })}
          </Typography.Text>
          <Space wrap className="b-mt-8">
            <ImgCrop
              cropShape="round"
              rotationSlider
              modalTitle={t('account:avatar.cropTitle')}
              modalOk={t('common:save')}
              modalCancel={t('common:cancel')}
              beforeCrop={(file) => {
                if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
                  void message.error(t('account:avatar.invalidType'));
                  return false;
                }
                return true;
              }}
            >
              <Upload
                accept={AVATAR_MIME_TYPES.join(',')}
                showUploadList={false}
                beforeUpload={(file) => {
                  if (file.size > AVATAR_MAX_BYTES) {
                    void message.error(t('account:avatar.tooLarge'));
                    return Upload.LIST_IGNORE;
                  }
                  void upload(file, file.name);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={uploading}>
                  {t('account:avatar.upload')}
                </Button>
              </Upload>
            </ImgCrop>
            {user.avatarUrl && (
              <Button icon={<DeleteOutlined />} onClick={removeAvatar} disabled={uploading}>
                {t('account:avatar.remove')}
              </Button>
            )}
          </Space>
          <Typography.Text type="secondary" className="b-hint">
            {t('account:avatar.hint')}
          </Typography.Text>
        </div>
      </div>

      <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
        <Form.Item label={t('auth:email')}>
          <Space.Compact block>
            <Input
              value={user.email}
              disabled
              suffix={
                user.emailVerified && (
                  <Tooltip title={t('account:emailVerification.verified')}>
                    <CheckCircleFilled
                      className="b-verified-icon"
                      aria-label={t('account:emailVerification.verified')}
                    />
                  </Tooltip>
                )
              }
            />
            {!user.emailVerified && (
              <Button icon={<SafetyCertificateOutlined />} onClick={() => setVerifyOpen(true)}>
                {t('account:emailVerification.verify')}
              </Button>
            )}
          </Space.Compact>
        </Form.Item>
        <div className="b-form-grid">
          <Form.Item
            name="lastName"
            label={t('auth:lastName')}
            rules={[
              { required: true, whitespace: true, message: t('auth:validation.lastNameRequired') },
            ]}
          >
            <Input maxLength={100} autoComplete="family-name" />
          </Form.Item>
          <Form.Item
            name="firstName"
            label={t('auth:firstName')}
            rules={[
              { required: true, whitespace: true, message: t('auth:validation.firstNameRequired') },
            ]}
          >
            <Input maxLength={100} autoComplete="given-name" />
          </Form.Item>
        </div>
        <div className="b-form-actions">
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common:saveChanges')}
          </Button>
        </div>
      </Form>

      <Modal
        open={verifyOpen}
        title={t('account:emailVerification.modalTitle')}
        footer={null}
        onCancel={() => setVerifyOpen(false)}
        destroyOnHidden
      >
        <EmailVerificationForm autoSend onVerified={() => setVerifyOpen(false)} />
      </Modal>
    </>
  );
}
