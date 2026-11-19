import type { Messages } from '@base/server-kit';
import type { vi } from './vi';

/** Cấu trúc giống hệt bản tiếng Việt (TypeScript báo lỗi nếu thiếu key) */
type Catalog<T> = { [K in keyof T]: T[K] extends string ? string : Catalog<T[K]> };

export const en: Catalog<typeof vi> & Messages = {
  errors: {
    badRequest: 'Invalid request',
    validation: 'Invalid data',
    invalidJson: 'Body must be valid JSON',
    unauthorized: 'You are not signed in or your session has expired',
    forbidden: 'You do not have permission to perform this action',
    notFound: 'Not found',
    conflict: 'Already exists',
    payloadTooLarge: 'Payload too large',
    tooManyRequests: 'Too many attempts, please try again in {{seconds}} seconds',
    internal: 'Something went wrong, please try again later',
    serviceUnavailable: 'Service temporarily unavailable',
  },
  validation: {
    password: { needDigit: 'Password must contain at least one digit' },
    notification: { targetRequired: 'Choose a recipient or send to everyone' },
    permission: { apiPathFormat: 'URL must start with /' },
    users: {
      analyticsInvalidRange: 'Start date must be before end date',
      analyticsRangeTooLong: 'The date range is too long for the selected granularity',
    },
    commerce: {
      invalidMoney: 'Invalid amount (at most 2 decimal places)',
      invalidQuantity: 'Invalid quantity (at most 3 decimal places)',
      quantityPositive: 'Quantity must be greater than 0',
      quantityNonZero: 'Quantity change must not be 0',
    },
    products: {
      skuFormat: 'SKU may only contain letters, digits and . _ -',
    },
    productImages: {
      invalidType: 'Only JPEG, PNG and WebP images are supported',
    },
    inventory: {
      noteRequired: 'Reason "Other" requires a note',
      countedRequired: 'Stocktake requires the counted quantity',
      changeRequired: 'Quantity change is required',
      duplicateProduct: 'Each product may appear only once',
    },
    reports: {
      invalidRange: 'Start date must be on or before end date',
      rangeTooLarge: 'The date range can be at most 366 days',
    },
  },
  auth: {
    invalidCredentials: 'Incorrect email or password',
    accountLocked: 'Your account has been locked, please contact an administrator',
    adminAccessDenied: 'This account cannot access the admin panel',
    sessionExpired: 'Your session has expired, please sign in again',
    emailExists: 'Email is already in use',
    registrationDisabled: 'Registration is currently disabled',
    captchaRequired: 'Please complete the captcha',
    captchaInvalid: 'Captcha verification failed, please try again',
    resetTokenInvalid: 'The reset link is invalid or has expired',
    forgotPasswordSent: 'If the email exists, you will receive a password reset link',
    passwordResetSuccess: 'Your password has been reset',
    googleDisabled: 'Google sign-in is not configured',
    googleCancelled: 'Google sign-in was cancelled',
    googleFailed: 'Google sign-in failed, please try again',
    googleStateInvalid: 'The Google sign-in session expired, please try again',
    googleEmailUnverified: 'The email of this Google account is not verified',
  },
  twoFactor: {
    tokenInvalid: 'Two-factor session expired, please sign in again',
    codeInvalid: 'Invalid verification code',
    alreadyEnabled: 'Two-factor authentication is already enabled',
    notEnabled: 'Two-factor authentication is not enabled',
    notSetup: 'Generate a QR code before enabling two-factor authentication',
    methodNotEnabled: 'This verification method is not enabled',
    methodNotAllowed: 'This verification method is not allowed',
    lastStrongMethod: 'Admin accounts must keep at least one authenticator app or passkey',
    emailNotVerified: 'Verify your email before using it for two-factor authentication',
    emailCooldown: 'Please wait {{seconds}} seconds before requesting a new code',
    emailSendFailed: 'Could not send the verification email, please try again later',
    passkeyInvalid: 'Passkey verification failed',
    passkeyChallengeExpired: 'Passkey registration expired, please try again',
    passkeyExists: 'This passkey is already registered',
    passkeyLimit: 'You can register up to {{max}} passkeys',
    passkeyNotFound: 'Passkey not found',
    reauthRequired: 'Please verify your identity to continue',
    requiredForAdmin: 'Admin accounts must keep two-factor authentication enabled',
  },
  twoFactorMethods: {
    totp: 'Authenticator app',
    email: 'Email',
    passkey: 'Passkey',
  },
  account: {
    currentPasswordIncorrect: 'Current password is incorrect',
    passwordIncorrect: 'Incorrect password',
    samePassword: 'New password must be different from the current one',
    avatarRequired: 'Please choose an image',
    avatarInvalidType: 'Only PNG, JPEG, WEBP or GIF images are allowed',
    avatarTooLarge: 'Image must not exceed {{size}}',
  },
  users: {
    notFound: 'User not found',
    cannotModifySuperAdmin: 'Only super admins can modify super admin accounts',
    cannotModifySelf: 'You cannot lock, delete or demote your own account',
    roleNotFound: 'Role does not exist',
  },
  roles: {
    notFound: 'Role not found',
    nameExists: 'Role name already exists',
    inUse: 'Role is assigned to {{count}} user(s) and cannot be deleted',
    systemRole: 'System roles cannot be deleted, renamed or deactivated',
    adminPermissionMissing:
      'The admin.access permission is not in the database yet, sync permissions first',
    adminAccessForbidden: 'You need the assign-permissions right to change admin access of a role',
  },
  settings: {
    invalidValue: 'Invalid value for "{{name}}"',
    unknownKey: '"{{name}}" is not a system setting key',
    groups: {
      general: { title: 'General', description: 'System name, sign-up and default role.' },
      security: {
        title: 'Security',
        description: 'Email verification, two-factor authentication and sign-in location.',
      },
      sendify: {
        title: 'Email (Sendify)',
        description:
          'Preferred email channel: sends with templates created on sendify.vn (email verification, two-factor codes, password reset).',
        hint: 'Each email type goes through Sendify once the API key and that type’s template are set; a type whose template is empty is sent via SMTP below. If Sendify returns an error, the email is not retried via SMTP.',
      },
      mail: {
        title: 'Email (SMTP)',
        description:
          'Fallback channel for email types not configured on Sendify. With neither configured, emails are only logged.',
      },
      google: {
        title: 'Google sign-in',
        description: 'OAuth client from Google Cloud Console. Leave empty to disable.',
        hint: 'Authorized redirect URIs to register with Google:',
      },
      captcha: {
        title: 'Captcha',
        description: 'Cloudflare Turnstile on the sign-up page. Leave empty to disable.',
      },
    },
    keys: {
      site_name: { label: 'System name', description: 'Shown in the UI and in emails.' },
      allow_registration: {
        label: 'Allow sign-up',
        description: 'Users can create their own account on the user site.',
      },
      default_role: {
        label: 'Default role',
        description: 'Assigned to newly registered accounts.',
      },
      require_email_verification: {
        label: 'Require email verification on sign-up',
        description:
          'A code is sent right after sign-up; unverified accounts cannot use the system.',
      },
      require_2fa_admin: {
        label: 'Require 2FA for admins',
        description: 'Accounts using the admin panel must enable two-factor authentication.',
      },
      two_factor_methods: {
        label: 'Allowed 2FA methods',
        description:
          'Removing a method stops new sign-ups for it; existing users can still sign in. Empty = authenticator app only.',
        options: { totp: 'Authenticator app', email: 'Email', passkey: 'Passkey' },
      },
      admin_2fa_allow_email: {
        label: 'Allow admins to use email as their only 2FA',
        description:
          'By default admins must have an authenticator app or passkey, since email is also used for password resets.',
      },
      login_geoip_enabled: {
        label: 'Fall back to an external IP lookup',
        description:
          'When Cloudflare headers have no city (the "Add visitor location headers" Managed Transform is off), look the IP up via ipwho.is — the IP is sent to that service. With the Managed Transform on, no external lookup is made.',
      },
      smtp_host: {
        label: 'SMTP host',
        description:
          'Leave empty to only log email types not configured on Sendify (handy in development).',
      },
      smtp_port: { label: 'SMTP port', description: 'Usually 587 (STARTTLS) or 465 (SSL).' },
      smtp_secure: { label: 'Use SSL/TLS', description: 'Turn on for port 465.' },
      smtp_user: { label: 'SMTP username', description: '' },
      smtp_password: { label: 'SMTP password', description: '' },
      mail_from: { label: 'Sender', description: 'Address shown in the "From" field.' },
      sendify_api_key: { label: 'API key', description: 'Find it in your Sendify dashboard.' },
      sendify_from: { label: 'Sender', description: 'Leave empty to use the SMTP sender below.' },
      sendify_template_verify_email: {
        label: 'Email verification template',
        description: 'Variables: fullName, verificationCode, expiresInMinutes, appName.',
      },
      sendify_template_two_factor_code: {
        label: 'Two-factor code template',
        description: 'Variables: fullName, code, expiresInMinutes, appName, ipAddress, device.',
      },
      sendify_template_reset_password: {
        label: 'Password reset template',
        description: 'Variables: fullName, resetLink, expiresInMinutes, appName.',
      },
      google_client_id: { label: 'Client ID', description: '' },
      google_client_secret: { label: 'Client secret', description: '' },
      turnstile_site_key: { label: 'Site key', description: '' },
      turnstile_secret_key: { label: 'Secret key', description: '' },
    },
  },
  permissions: {
    notFound: 'Permission not found',
  },
  emailVerification: {
    required: 'Please verify your email before continuing',
    alreadyVerified: 'Your email is already verified',
    cooldown: 'Please wait {{seconds}} seconds before requesting a new code',
    codeInvalid: 'The verification code is invalid or has expired',
    sendFailed: 'Could not send the verification email, please try again later',
  },
  notifications: {
    welcome: {
      title: 'Welcome to {{appName}}',
      message: 'Your account has been created successfully.',
    },
    passwordChanged: {
      title: 'Your password was changed',
      message: 'If this was not you, reset your password immediately.',
    },
    twoFactorEnabled: {
      title: 'Two-factor authentication enabled',
      message: 'Your account is now protected by two-factor authentication.',
    },
    twoFactorDisabled: {
      title: 'Two-factor authentication disabled',
      message: 'If this was not you, change your password immediately.',
    },
    twoFactorMethodAdded: {
      title: 'Two-factor method added',
      message:
        '"{{method}}" was added to your account. If this was not you, change your password immediately.',
    },
    twoFactorMethodRemoved: {
      title: 'Two-factor method removed',
      message:
        '"{{method}}" was removed from your account. If this was not you, change your password immediately.',
    },
  },
  mail: {
    greeting: 'Hello {{name}},',
    verifyEmail: {
      subject: '[{{appName}}] Your email verification code',
      intro: 'Your email verification code is:',
      expiry: 'This code is valid for {{minutes}} minutes.',
      ignore: 'If you did not request this, you can ignore this email.',
    },
    twoFactorCode: {
      subject: '[{{appName}}] Your sign-in verification code',
      intro: 'Your two-factor verification code is:',
      expiry: 'The code is valid for {{minutes}} minutes and can only be used once.',
      context: 'Requested from IP {{ip}} - device {{device}}.',
      warning:
        'If you are not signing in, your password may be compromised: change it now and never share this code.',
    },
    footer: 'This email was sent automatically by {{appName}}, please do not reply.',
    resetPassword: {
      subject: '[{{appName}}] Reset your password',
      intro: 'We received a request to reset the password for your account.',
      action: 'Reset password',
      expiry: 'This link is valid for {{minutes}} minutes.',
      ignore: 'If you did not request this, you can ignore this email.',
    },
  },
  categories: {
    notFound: 'Category not found',
    nameExists: 'Category "{{name}}" already exists',
    inUse: 'This category still has products; move them to another category or deactivate it',
    inactive: 'This category is inactive',
  },
  products: {
    notFound: 'Product not found',
    skuExists: 'SKU "{{sku}}" already exists',
    hasTransactions: 'This product has transactions and can only be deactivated',
    inactive: 'Product {{sku}} is inactive',
    decimalQuantityLocked:
      'Current stock has a fractional quantity; decimal quantities cannot be disabled',
  },
  productImages: {
    notFound: 'Image not found',
    tooLarge: 'Image exceeds {{maxMb}} MB',
    limitReached: 'Each product can have at most {{limit}} images',
    notUploaded: 'The image has not been uploaded or the upload is incomplete',
    contentMismatch: 'The file is not a valid JPEG, PNG or WebP image',
    expired: 'The upload session has expired, please choose the image again',
    notPending: 'This image has already been processed',
    orderMismatch: 'The image order does not match the current images',
  },
  suppliers: {
    notFound: 'Supplier not found',
    inUse: 'This supplier has purchase receipts and can only be deactivated',
    inactive: 'This supplier is inactive',
  },
  purchases: {
    notFound: 'Purchase receipt not found',
    notDraft: 'Only draft receipts can be edited or cancelled',
    alreadyProcessed: 'This purchase receipt has already been processed',
    stale: 'This receipt was changed by someone else, please reload',
  },
  sales: {
    notFound: 'Sales order not found',
    notDraft: 'Only draft orders can be edited',
    alreadyProcessed: 'This order has already been processed',
    stale: 'This order was changed by someone else, please reload',
    insufficientStock:
      'Insufficient stock for {{sku}}: requested {{requested}}, available {{available}}',
    priceOverrideForbidden: 'You are not allowed to sell at a price different from the list price',
    notConfirmed: 'The order has not been confirmed',
    alreadyPaid: 'The order has already been paid',
    alreadyCancelled: 'The order has already been cancelled',
    cancelForbidden: 'You are not allowed to cancel confirmed orders',
  },
  inventory: {
    negativeStock:
      'Insufficient stock for {{sku}}: decrease {{requested}}, available {{available}}',
    decimalNotAllowed: 'Product {{sku}} only accepts whole quantities',
    noChange: 'Counted quantity equals current stock, nothing to adjust',
    adjustmentNotFound: 'Stock adjustment not found',
  },
  documents: {
    discountExceedsAmount: 'Discount exceeds the total amount',
    lineDiscountExceedsAmount: 'Discount on line {{line}} exceeds the line amount',
  },
  reports: {
    rangeTooLarge: 'The date range can be at most {{days}} days',
  },
  storage: {
    unavailable: 'Image storage is not configured or currently unavailable',
  },
};
