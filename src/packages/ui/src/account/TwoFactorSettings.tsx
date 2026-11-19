import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  MailOutlined,
  MobileOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type {
  DisableTwoFactorInput,
  PasskeyDto,
  TwoFactorMethod,
  TwoFactorSetupDto,
} from '@base/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';
import { BackupCodesModal } from '../auth/BackupCodesModal';
import { EmailCodeEntry } from '../auth/TwoFactorChallenge';
import { TwoFactorSetupPanel } from '../auth/TwoFactorSetupPanel';
import {
  createPasskey,
  isPasskeyCancelled,
  passkeySupported,
  suggestPasskeyName,
} from '../auth/webauthn';
import { useApi } from '../providers/ApiContext';
import { useNotifyError } from '../hooks';
import { formatDateTime, getErrorMessage } from '../utils';
import { enabledMethodsOf, ReauthCancelledError, useReauth } from './useReauth';

const STATUS_KEY = ['me', '2fa'] as const;

interface MethodRowProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  enabled: boolean;
  actions: ReactNode;
  children?: ReactNode;
}

function MethodRow({ icon, title, description, enabled, actions, children }: MethodRowProps) {
  const { t } = useTranslation();
  return (
    <div className="b-2fa-method">
      <div className="b-2fa-method__head">
        <span
          className={enabled ? 'b-2fa-method__icon b-2fa-method__icon--on' : 'b-2fa-method__icon'}
        >
          {icon}
        </span>
        <div className="b-2fa-method__body">
          <Space size={8} wrap>
            <Typography.Text strong>{title}</Typography.Text>
            {enabled && <Tag color="success">{t('account:twoFactor.methodOn')}</Tag>}
          </Space>
          <Typography.Text type="secondary" className="b-2fa-method__desc">
            {description}
          </Typography.Text>
        </div>
        <div className="b-2fa-method__actions">{actions}</div>
      </div>
      {children}
    </div>
  );
}

/** Quản lý xác thực 2 lớp: passkey, ứng dụng xác thực, email, mã dự phòng */
export function TwoFactorSettings() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const { message } = App.useApp();
  const notifyError = useNotifyError();

  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => api.me.twoFactor.status() });
  const { withReauth, modal: reauthModal } = useReauth(status.data);

  const [busy, setBusy] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [totpSetup, setTotpSetup] = useState<TwoFactorSetupDto | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<PasskeyDto | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [passkeyForm] = Form.useForm<{ name: string }>();
  const [renameForm] = Form.useForm<{ name: string }>();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    setUser(await api.auth.me());
  };

  /** Chạy thao tác (kèm xác minh lại nếu cần), báo lỗi bằng message; huỷ xác minh thì bỏ qua */
  async function act<T>(
    key: string,
    fn: () => Promise<T>,
    success?: string,
  ): Promise<T | undefined> {
    setBusy(key);
    try {
      const result = await withReauth(fn);
      if (success) void message.success(success);
      await refresh();
      return result;
    } catch (err) {
      if (!(err instanceof ReauthCancelledError)) notifyError(err);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  /** Hỏi xác minh lại trước khi mở hộp thoại thêm phương thức (khi 2FA đang bật) */
  async function ensureReauth(): Promise<boolean> {
    try {
      await withReauth(async () => undefined);
      return true;
    } catch {
      return false;
    }
  }

  const showCodes = (backupCodes?: string[]) => {
    if (backupCodes?.length) setCodes(backupCodes);
  };

  // ----- TOTP -----
  async function startTotp() {
    const setup = await act('totp', () => api.me.twoFactor.totpSetup());
    if (setup) {
      setTotpError(null);
      setTotpSetup(setup);
    }
  }

  async function enableTotp(code: string) {
    if (busy) return;
    setBusy('totp-enable');
    setTotpError(null);
    try {
      const result = await withReauth(() => api.me.twoFactor.totpEnable(code));
      setTotpSetup(null);
      void message.success(t('account:twoFactor.methodAdded'));
      showCodes(result.backupCodes);
      await refresh();
    } catch (err) {
      if (!(err instanceof ReauthCancelledError)) setTotpError(getErrorMessage(err, t));
    } finally {
      setBusy(null);
    }
  }

  // ----- Email -----
  async function openEmail() {
    if (!(await ensureReauth())) return;
    setEmailError(null);
    setEmailOpen(true);
  }

  async function enableEmail(code: string) {
    if (busy) return;
    setBusy('email-enable');
    setEmailError(null);
    try {
      const result = await withReauth(() => api.me.twoFactor.emailEnable(code));
      setEmailOpen(false);
      void message.success(t('account:twoFactor.methodAdded'));
      showCodes(result.backupCodes);
      await refresh();
    } catch (err) {
      if (!(err instanceof ReauthCancelledError)) setEmailError(getErrorMessage(err, t));
    } finally {
      setBusy(null);
    }
  }

  // ----- Passkey -----
  async function openPasskey() {
    if (!(await ensureReauth())) return;
    setPasskeyError(null);
    passkeyForm.setFieldsValue({ name: suggestPasskeyName(t('auth:twoFactor.on')) });
    setPasskeyOpen(true);
  }

  async function addPasskey({ name }: { name: string }) {
    setBusy('passkey-add');
    setPasskeyError(null);
    try {
      const result = await withReauth(async () => {
        const options = await api.me.twoFactor.passkeyOptions();
        const response = await createPasskey(options);
        return api.me.twoFactor.passkeyAdd({ name, response });
      });
      setPasskeyOpen(false);
      void message.success(t('account:twoFactor.passkeyAdded'));
      showCodes(result.backupCodes);
      await refresh();
    } catch (err) {
      if (err instanceof ReauthCancelledError) return;
      setPasskeyError(
        isPasskeyCancelled(err) ? t('auth:twoFactor.passkeyCancelled') : getErrorMessage(err, t),
      );
    } finally {
      setBusy(null);
    }
  }

  async function renamePasskey({ name }: { name: string }) {
    if (!renaming) return;
    const done = await act('rename', () => api.me.twoFactor.passkeyRename(renaming.id, name));
    if (done) setRenaming(null);
  }

  async function disableAll(values: DisableTwoFactorInput) {
    const done = await act(
      'disable',
      async () => {
        await api.me.twoFactor.disable(values);
        return true;
      },
      t('account:twoFactor.disabledSuccess'),
    );
    if (done) setDisableOpen(false);
  }

  if (status.isPending) return <Spin />;
  if (!status.data) return <Alert type="error" showIcon title={getErrorMessage(status.error, t)} />;

  const data = status.data;
  const enabledMethods = enabledMethodsOf(data);
  const available = new Set(data.availableMethods);
  const show = (m: TwoFactorMethod) => available.has(m) || enabledMethods.includes(m);
  const supported = passkeySupported();
  const methodName = (m: TwoFactorMethod) => t(`auth:twoFactor.methods.${m}`);

  const removeButton = (key: string, onConfirm: () => void) => (
    <Popconfirm
      title={t('account:twoFactor.removeConfirm')}
      okButtonProps={{ danger: true }}
      okText={t('account:twoFactor.remove')}
      cancelText={t('common:cancel')}
      onConfirm={onConfirm}
    >
      <Button danger loading={busy === key}>
        {t('account:twoFactor.remove')}
      </Button>
    </Popconfirm>
  );

  return (
    <>
      <div className="b-2fa-status">
        <SafetyCertificateOutlined
          className={data.enabled ? 'b-2fa-status__icon--on' : 'b-2fa-status__icon'}
        />
        <div className="b-2fa-status__body">
          <Tag color={data.enabled ? 'success' : 'default'}>
            {data.enabled ? t('account:twoFactor.enabled') : t('account:twoFactor.disabled')}
          </Tag>
          {data.enabled && (
            <Typography.Text type="secondary">
              {t('account:twoFactor.backupCodesRemaining', { count: data.backupCodesRemaining })}
            </Typography.Text>
          )}
        </div>
        {enabledMethods.length > 1 && (
          <div className="b-2fa-default">
            <Typography.Text type="secondary">
              {t('account:twoFactor.defaultMethod')}
            </Typography.Text>
            <Select<TwoFactorMethod>
              value={data.defaultMethod ?? undefined}
              options={enabledMethods.map((m) => ({ value: m, label: methodName(m) }))}
              onChange={(m) => void act('default', () => api.me.twoFactor.setDefaultMethod(m))}
              loading={busy === 'default'}
              style={{ minWidth: 200 }}
            />
          </div>
        )}
      </div>

      {data.requiredMethods && (
        <Alert
          type="info"
          showIcon
          className="b-mt-16"
          title={t('account:twoFactor.requiredNotice', {
            methods: data.requiredMethods.map(methodName).join(', '),
          })}
        />
      )}
      {!data.enabled && (
        <Alert
          type="warning"
          showIcon
          className="b-mt-16"
          title={t('account:twoFactor.notEnabledHint')}
        />
      )}

      <div className="b-2fa-methods">
        {show('passkey') && (
          <MethodRow
            icon={<KeyOutlined />}
            title={methodName('passkey')}
            enabled={data.passkeys.length > 0}
            description={
              supported
                ? t('account:twoFactor.passkeyDesc')
                : t('auth:twoFactor.passkeyUnsupported')
            }
            actions={
              available.has('passkey') && (
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => void openPasskey()}
                  disabled={!supported}
                >
                  {t('account:twoFactor.addPasskey')}
                </Button>
              )
            }
          >
            {data.passkeys.length > 0 && (
              <ul className="b-2fa-passkeys">
                {data.passkeys.map((p) => (
                  <li key={p.id}>
                    <div className="b-2fa-passkeys__info">
                      <Typography.Text>{p.name}</Typography.Text>
                      <Typography.Text type="secondary" className="b-2fa-passkeys__meta">
                        {[
                          p.backedUp
                            ? t('account:twoFactor.passkeySynced')
                            : t('account:twoFactor.passkeyDevice'),
                          t('account:twoFactor.passkeyCreated', {
                            date: formatDateTime(p.createdAt, false),
                          }),
                          p.lastUsedAt
                            ? t('account:twoFactor.passkeyLastUsed', {
                                date: formatDateTime(p.lastUsedAt),
                              })
                            : t('account:twoFactor.passkeyNeverUsed'),
                        ].join(' · ')}
                      </Typography.Text>
                    </div>
                    <Space size={4}>
                      <Tooltip title={t('account:twoFactor.rename')}>
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          aria-label={t('account:twoFactor.rename')}
                          onClick={() => {
                            renameForm.setFieldsValue({ name: p.name });
                            setRenaming(p);
                          }}
                        />
                      </Tooltip>
                      <Popconfirm
                        title={t('account:twoFactor.removePasskeyConfirm', { name: p.name })}
                        okButtonProps={{ danger: true }}
                        okText={t('account:twoFactor.remove')}
                        cancelText={t('common:cancel')}
                        onConfirm={() =>
                          void act(
                            `passkey-${p.id}`,
                            () => api.me.twoFactor.passkeyRemove(p.id),
                            t('account:twoFactor.methodRemoved'),
                          )
                        }
                      >
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          loading={busy === `passkey-${p.id}`}
                          aria-label={t('account:twoFactor.remove')}
                        />
                      </Popconfirm>
                    </Space>
                  </li>
                ))}
              </ul>
            )}
          </MethodRow>
        )}

        {show('totp') && (
          <MethodRow
            icon={<MobileOutlined />}
            title={methodName('totp')}
            enabled={data.totp.enabled}
            description={t('account:twoFactor.totpDesc')}
            actions={
              data.totp.enabled
                ? removeButton(
                    'totp-off',
                    () =>
                      void act(
                        'totp-off',
                        () => api.me.twoFactor.totpDisable(),
                        t('account:twoFactor.methodRemoved'),
                      ),
                  )
                : available.has('totp') && (
                    <Button onClick={() => void startTotp()} loading={busy === 'totp'}>
                      {t('account:twoFactor.setup')}
                    </Button>
                  )
            }
          />
        )}

        {show('email') && (
          <MethodRow
            icon={<MailOutlined />}
            title={methodName('email')}
            enabled={data.email.enabled}
            description={
              data.email.canEnable || data.email.enabled
                ? t('account:twoFactor.emailDesc', { email: data.email.emailHint })
                : t('account:twoFactor.emailNeedVerify')
            }
            actions={
              data.email.enabled
                ? removeButton(
                    'email-off',
                    () =>
                      void act(
                        'email-off',
                        () => api.me.twoFactor.emailDisable(),
                        t('account:twoFactor.methodRemoved'),
                      ),
                  )
                : available.has('email') && (
                    <Button onClick={() => void openEmail()} disabled={!data.email.canEnable}>
                      {t('account:twoFactor.turnOn')}
                    </Button>
                  )
            }
          />
        )}
      </div>

      {data.enabled && (
        <>
          {data.email.enabled && enabledMethods.length === 1 && (
            <Alert
              type="warning"
              showIcon
              className="b-mt-16"
              title={t('account:twoFactor.emailOnlyWarning')}
            />
          )}
          <Space wrap className="b-mt-16">
            <Popconfirm
              title={t('account:twoFactor.regenerateDescription')}
              okText={t('account:twoFactor.regenerate')}
              cancelText={t('common:cancel')}
              onConfirm={() =>
                void act('codes', () => api.me.twoFactor.regenerateBackupCodes()).then((r) =>
                  showCodes(r?.backupCodes),
                )
              }
            >
              <Button loading={busy === 'codes'}>{t('account:twoFactor.regenerate')}</Button>
            </Popconfirm>
            {!data.requiredMethods && (
              <Button danger onClick={() => setDisableOpen(true)}>
                {t('account:twoFactor.disable')}
              </Button>
            )}
          </Space>
        </>
      )}

      {/* Thiết lập ứng dụng xác thực */}
      <Modal
        open={Boolean(totpSetup)}
        title={t('account:twoFactor.setupTotpTitle')}
        onCancel={() => setTotpSetup(null)}
        footer={null}
        destroyOnHidden
      >
        {totpSetup && (
          <TwoFactorSetupPanel
            setup={totpSetup}
            onSubmit={(code) => void enableTotp(code)}
            loading={busy === 'totp-enable'}
            error={totpError}
            submitText={t('account:twoFactor.turnOn')}
          />
        )}
      </Modal>

      {/* Bật email */}
      <Modal
        open={emailOpen}
        title={t('account:twoFactor.setupEmailTitle')}
        onCancel={() => setEmailOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <EmailCodeEntry
          autoSend
          emailHint={data.email.emailHint}
          onSend={() => withReauth(() => api.me.twoFactor.emailSend())}
          onSubmit={(code) => void enableEmail(code)}
          loading={busy === 'email-enable'}
          error={emailError}
          submitText={t('account:twoFactor.turnOn')}
        />
      </Modal>

      {/* Thêm passkey */}
      <Modal
        open={passkeyOpen}
        title={t('account:twoFactor.addPasskey')}
        onCancel={() => setPasskeyOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          {t('account:twoFactor.addPasskeyDescription')}
        </Typography.Paragraph>
        {passkeyError && <Alert type="error" showIcon title={passkeyError} className="b-mb-16" />}
        <Form form={passkeyForm} layout="vertical" requiredMark={false} onFinish={addPasskey}>
          <Form.Item
            name="name"
            label={t('account:twoFactor.passkeyName')}
            rules={[
              {
                required: true,
                whitespace: true,
                max: 100,
                message: t('account:twoFactor.passkeyNameRequired'),
              },
            ]}
          >
            <Input maxLength={100} autoFocus />
          </Form.Item>
          <div className="b-form-actions">
            <Button onClick={() => setPasskeyOpen(false)}>{t('common:cancel')}</Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<KeyOutlined />}
              loading={busy === 'passkey-add'}
            >
              {t('auth:twoFactor.createPasskey')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Đổi tên passkey */}
      <Modal
        open={Boolean(renaming)}
        title={t('account:twoFactor.rename')}
        onCancel={() => setRenaming(null)}
        footer={null}
        destroyOnHidden
      >
        <Form form={renameForm} layout="vertical" requiredMark={false} onFinish={renamePasskey}>
          <Form.Item
            name="name"
            label={t('account:twoFactor.passkeyName')}
            rules={[
              {
                required: true,
                whitespace: true,
                max: 100,
                message: t('account:twoFactor.passkeyNameRequired'),
              },
            ]}
          >
            <Input maxLength={100} autoFocus />
          </Form.Item>
          <div className="b-form-actions">
            <Button onClick={() => setRenaming(null)}>{t('common:cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={busy === 'rename'}>
              {t('common:save')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Tắt toàn bộ 2FA */}
      <Modal
        open={disableOpen}
        title={t('account:twoFactor.disable')}
        onCancel={() => setDisableOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          title={t('account:twoFactor.disableDescription')}
          className="b-mb-16"
        />
        <Form<DisableTwoFactorInput> layout="vertical" requiredMark={false} onFinish={disableAll}>
          {user?.hasPassword !== false && (
            <Form.Item
              name="password"
              label={t('auth:password')}
              rules={[{ required: true, message: t('auth:validation.passwordRequired') }]}
            >
              <Input.Password autoComplete="current-password" autoFocus />
            </Form.Item>
          )}
          <div className="b-form-actions">
            <Button onClick={() => setDisableOpen(false)}>{t('common:cancel')}</Button>
            <Button danger type="primary" htmlType="submit" loading={busy === 'disable'}>
              {t('account:twoFactor.disable')}
            </Button>
          </div>
        </Form>
      </Modal>

      <BackupCodesModal codes={codes} onDone={() => setCodes(null)} />
      {reauthModal}
    </>
  );
}
