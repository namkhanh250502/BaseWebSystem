/**
 * Các key cài đặt hệ thống. Trang admin chỉ hiển thị và cho cấu hình các key này
 * (không có key tự do). Nhãn + mô tả + nhãn lựa chọn được dịch ở backend
 * (`settings.keys.<name>` trong `backends/api/src/i18n`), API `GET /settings` trả sẵn
 * để frontend tự sinh form — thêm key mới không phải sửa frontend.
 */
export type SettingValueType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'email'
  | 'url'
  /** Chọn 1 giá trị trong `options` / `optionsSource` */
  | 'select'
  /** Chọn nhiều giá trị, lưu DB dạng chuỗi phân tách bằng dấu phẩy */
  | 'multiselect';

/** Nguồn lựa chọn động: backend nạp từ DB khi trả danh sách cài đặt */
export type SettingOptionsSource = 'roles';

export const SETTING_GROUPS = [
  'general',
  'security',
  // Sendify đứng trước SMTP vì là kênh được ưu tiên khi gửi email
  'sendify',
  'mail',
  'google',
  'captcha',
] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export interface SettingDefinition {
  name: string;
  group: SettingGroup;
  type: SettingValueType;
  defaultValue: string;
  /** Không trả giá trị về client, không export trừ khi chọn "kèm bí mật" */
  isSecret?: boolean;
  /** Frontend đọc được qua GET /settings/public mà không cần đăng nhập */
  isPublic?: boolean;
  /** Placeholder của ô nhập */
  example?: string;
  /** select / multiselect: giá trị cố định; nhãn dịch theo `settings.keys.<name>.options.<value>` */
  options?: readonly string[];
  /** select / multiselect: lấy lựa chọn từ DB thay vì `options` */
  optionsSource?: SettingOptionsSource;
}

export const SETTING_DEFINITIONS = [
  { name: 'site_name', group: 'general', type: 'string', defaultValue: 'Base Web', isPublic: true },
  {
    name: 'allow_registration',
    group: 'general',
    type: 'boolean',
    defaultValue: 'true',
    isPublic: true,
  },
  {
    name: 'default_role',
    group: 'general',
    type: 'select',
    optionsSource: 'roles',
    defaultValue: 'User',
  },

  {
    name: 'require_email_verification',
    group: 'security',
    type: 'boolean',
    defaultValue: 'false',
    isPublic: true,
  },
  { name: 'require_2fa_admin', group: 'security', type: 'boolean', defaultValue: 'false' },
  /** Phương thức 2FA được phép bật (lưu dạng `totp,email,passkey`) */
  {
    name: 'two_factor_methods',
    group: 'security',
    type: 'multiselect',
    options: ['totp', 'email', 'passkey'],
    defaultValue: 'totp,email,passkey',
  },
  /** Cho phép email là phương thức 2FA duy nhất của tài khoản quản trị (mặc định: phải có TOTP hoặc passkey) */
  { name: 'admin_2fa_allow_email', group: 'security', type: 'boolean', defaultValue: 'false' },
  { name: 'login_geoip_enabled', group: 'security', type: 'boolean', defaultValue: 'true' },

  { name: 'sendify_api_key', group: 'sendify', type: 'string', defaultValue: '', isSecret: true },
  {
    name: 'sendify_from',
    group: 'sendify',
    type: 'string',
    defaultValue: '',
    example: '"Base Web" <no-reply@example.com>',
  },
  {
    name: 'sendify_template_verify_email',
    group: 'sendify',
    type: 'string',
    defaultValue: '',
    example: 'VERIFY_EMAIL',
  },
  {
    name: 'sendify_template_two_factor_code',
    group: 'sendify',
    type: 'string',
    defaultValue: '',
    example: 'TWO_FACTOR_CODE',
  },
  {
    name: 'sendify_template_reset_password',
    group: 'sendify',
    type: 'string',
    defaultValue: '',
    example: 'RESET_PASSWORD',
  },

  { name: 'smtp_host', group: 'mail', type: 'string', defaultValue: '', example: 'smtp.gmail.com' },
  { name: 'smtp_port', group: 'mail', type: 'number', defaultValue: '587' },
  { name: 'smtp_secure', group: 'mail', type: 'boolean', defaultValue: 'false' },
  { name: 'smtp_user', group: 'mail', type: 'string', defaultValue: '' },
  { name: 'smtp_password', group: 'mail', type: 'string', defaultValue: '', isSecret: true },
  {
    name: 'mail_from',
    group: 'mail',
    type: 'string',
    defaultValue: '',
    example: '"Base Web" <no-reply@example.com>',
  },

  {
    name: 'google_client_id',
    group: 'google',
    type: 'string',
    defaultValue: '',
    example: '1234567890-abc.apps.googleusercontent.com',
  },
  {
    name: 'google_client_secret',
    group: 'google',
    type: 'string',
    defaultValue: '',
    isSecret: true,
  },

  {
    name: 'turnstile_site_key',
    group: 'captcha',
    type: 'string',
    defaultValue: '',
    isPublic: true,
  },
  {
    name: 'turnstile_secret_key',
    group: 'captcha',
    type: 'string',
    defaultValue: '',
    isSecret: true,
  },
] as const satisfies readonly SettingDefinition[];

export type SettingName = (typeof SETTING_DEFINITIONS)[number]['name'];

export function getSettingDefinition(name: string): SettingDefinition | undefined {
  return (SETTING_DEFINITIONS as readonly SettingDefinition[]).find((d) => d.name === name);
}

/** Giá trị cài đặt công khai, đã ép kiểu */
export interface PublicSettings {
  site_name: string;
  allow_registration: boolean;
  require_email_verification: boolean;
  turnstile_site_key: string;
  /** true khi đã cấu hình Google Client ID + Secret */
  google_login_enabled: boolean;
}
