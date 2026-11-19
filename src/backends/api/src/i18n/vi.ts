import type { Messages } from '@base/server-kit';

export const vi = {
  errors: {
    badRequest: 'Yêu cầu không hợp lệ',
    validation: 'Dữ liệu không hợp lệ',
    invalidJson: 'Body phải là JSON hợp lệ',
    unauthorized: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn',
    forbidden: 'Bạn không có quyền thực hiện thao tác này',
    notFound: 'Không tìm thấy dữ liệu',
    conflict: 'Dữ liệu đã tồn tại',
    payloadTooLarge: 'Dữ liệu gửi lên quá lớn',
    tooManyRequests: 'Bạn thao tác quá nhanh, vui lòng thử lại sau {{seconds}} giây',
    internal: 'Lỗi hệ thống, vui lòng thử lại sau',
    serviceUnavailable: 'Dịch vụ tạm thời không khả dụng',
  },
  validation: {
    password: { needDigit: 'Mật khẩu phải chứa ít nhất 1 chữ số' },
    notification: { targetRequired: 'Chọn người nhận hoặc gửi toàn hệ thống' },
    permission: { apiPathFormat: 'URL phải bắt đầu bằng /' },
    users: {
      analyticsInvalidRange: 'Ngày bắt đầu phải trước ngày kết thúc',
      analyticsRangeTooLong: 'Khoảng thời gian quá dài so với độ mịn đã chọn',
    },
    commerce: {
      invalidMoney: 'Số tiền không hợp lệ (tối đa 2 chữ số thập phân)',
      invalidQuantity: 'Số lượng không hợp lệ (tối đa 3 chữ số thập phân)',
      quantityPositive: 'Số lượng phải lớn hơn 0',
      quantityNonZero: 'Số lượng thay đổi phải khác 0',
    },
    products: {
      skuFormat: 'SKU chỉ gồm chữ, số và các ký tự . _ -',
    },
    productImages: {
      invalidType: 'Chỉ hỗ trợ ảnh JPEG, PNG, WebP',
    },
    inventory: {
      noteRequired: 'Lý do "Khác" cần ghi chú',
      countedRequired: 'Kiểm kê cần nhập số đếm thực tế',
      changeRequired: 'Cần nhập số lượng thay đổi',
      duplicateProduct: 'Mỗi sản phẩm chỉ xuất hiện một lần trong phiếu',
    },
    reports: {
      invalidRange: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
      rangeTooLarge: 'Khoảng ngày tối đa 366 ngày',
    },
  },
  auth: {
    invalidCredentials: 'Email hoặc mật khẩu không đúng',
    accountLocked: 'Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên',
    adminAccessDenied: 'Tài khoản không có quyền truy cập trang quản trị',
    sessionExpired: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    emailExists: 'Email đã được sử dụng',
    registrationDisabled: 'Hệ thống đang tạm dừng đăng ký tài khoản mới',
    captchaRequired: 'Vui lòng xác minh captcha',
    captchaInvalid: 'Xác minh captcha thất bại, vui lòng thử lại',
    resetTokenInvalid: 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
    forgotPasswordSent: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được link đặt lại mật khẩu',
    passwordResetSuccess: 'Đặt lại mật khẩu thành công',
    googleDisabled: 'Đăng nhập Google chưa được cấu hình',
    googleCancelled: 'Bạn đã huỷ đăng nhập Google',
    googleFailed: 'Đăng nhập Google thất bại, vui lòng thử lại',
    googleStateInvalid: 'Phiên đăng nhập Google đã hết hạn, vui lòng thử lại',
    googleEmailUnverified: 'Email của tài khoản Google chưa được xác minh',
  },
  twoFactor: {
    tokenInvalid: 'Phiên xác thực 2 lớp đã hết hạn, vui lòng đăng nhập lại',
    codeInvalid: 'Mã xác thực không đúng',
    alreadyEnabled: 'Xác thực 2 lớp đã được bật',
    notEnabled: 'Xác thực 2 lớp chưa được bật',
    notSetup: 'Bạn cần tạo mã QR trước khi bật xác thực 2 lớp',
    requiredForAdmin: 'Tài khoản quản trị bắt buộc phải bật xác thực 2 lớp',
    methodNotEnabled: 'Phương thức xác thực này chưa được bật',
    methodNotAllowed: 'Hệ thống không cho phép dùng phương thức xác thực này',
    lastStrongMethod:
      'Tài khoản quản trị phải giữ ít nhất 1 phương thức: ứng dụng xác thực hoặc passkey',
    emailNotVerified: 'Bạn cần xác minh email trước khi dùng email làm xác thực 2 lớp',
    emailCooldown: 'Vui lòng chờ {{seconds}} giây trước khi gửi lại mã',
    emailSendFailed: 'Không gửi được email chứa mã xác thực, vui lòng thử lại sau',
    passkeyInvalid: 'Xác thực passkey không thành công',
    passkeyChallengeExpired: 'Phiên đăng ký passkey đã hết hạn, vui lòng thử lại',
    passkeyExists: 'Passkey này đã được đăng ký',
    passkeyLimit: 'Mỗi tài khoản chỉ được đăng ký tối đa {{max}} passkey',
    passkeyNotFound: 'Không tìm thấy passkey',
    reauthRequired: 'Vui lòng xác minh lại danh tính để tiếp tục',
  },
  twoFactorMethods: {
    totp: 'Ứng dụng xác thực',
    email: 'Email',
    passkey: 'Passkey',
  },
  account: {
    currentPasswordIncorrect: 'Mật khẩu hiện tại không đúng',
    passwordIncorrect: 'Mật khẩu không đúng',
    samePassword: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    avatarRequired: 'Vui lòng chọn ảnh',
    avatarInvalidType: 'Chỉ chấp nhận ảnh PNG, JPEG, WEBP hoặc GIF',
    avatarTooLarge: 'Ảnh không được vượt quá {{size}}',
  },
  users: {
    notFound: 'Không tìm thấy người dùng',
    cannotModifySuperAdmin: 'Chỉ super admin mới được thay đổi tài khoản super admin',
    cannotModifySelf: 'Không thể tự khóa, xóa hoặc hạ quyền tài khoản của chính mình',
    roleNotFound: 'Role không tồn tại',
  },
  roles: {
    notFound: 'Không tìm thấy role',
    nameExists: 'Tên role đã tồn tại',
    inUse: 'Role đang được gán cho {{count}} người dùng, không thể xóa',
    systemRole: 'Không thể xóa, đổi tên hoặc vô hiệu hóa role hệ thống',
    adminPermissionMissing:
      'Quyền admin.access chưa có trong cơ sở dữ liệu, hãy đồng bộ quyền trước',
    adminAccessForbidden: 'Bạn cần quyền phân quyền để đổi quyền vào trang quản trị của role',
  },
  settings: {
    invalidValue: 'Giá trị của "{{name}}" không hợp lệ',
    unknownKey: '"{{name}}" không phải key cài đặt của hệ thống',
    /** Tiêu đề, mô tả, gợi ý (tuỳ chọn) của từng nhóm — trang admin hiển thị theo */
    groups: {
      general: {
        title: 'Chung',
        description: 'Tên hệ thống, đăng ký tài khoản, vai trò mặc định.',
      },
      security: {
        title: 'Bảo mật',
        description: 'Xác minh email, xác thực 2 lớp và vị trí đăng nhập.',
      },
      sendify: {
        title: 'Email (Sendify)',
        description:
          'Kênh gửi email ưu tiên: gửi theo template đã tạo trên sendify.vn (xác minh email, mã xác thực 2 lớp, đặt lại mật khẩu).',
        hint: 'Mỗi loại email đi qua Sendify khi đã có API key và template của loại đó; template nào để trống thì loại email đó gửi qua SMTP ở mục bên dưới. Sendify báo lỗi thì email không được gửi lại qua SMTP.',
      },
      mail: {
        title: 'Email (SMTP)',
        description:
          'Kênh dự phòng: dùng cho loại email chưa cấu hình được qua Sendify. Để trống cả hai thì email chỉ được ghi ra log.',
      },
      google: {
        title: 'Đăng nhập Google',
        description: 'OAuth client tạo tại Google Cloud Console. Để trống để tắt.',
        hint: 'Authorized redirect URI cần khai báo trên Google:',
      },
      captcha: {
        title: 'Captcha',
        description: 'Cloudflare Turnstile cho trang đăng ký. Để trống để tắt.',
      },
    },
    /** Nhãn + mô tả từng key; `options.<value>` là nhãn lựa chọn của select / multiselect */
    keys: {
      site_name: { label: 'Tên hệ thống', description: 'Hiển thị trên giao diện và trong email.' },
      allow_registration: {
        label: 'Cho phép đăng ký',
        description: 'Người dùng tự tạo tài khoản ở trang user.',
      },
      default_role: { label: 'Vai trò mặc định', description: 'Gán cho tài khoản mới đăng ký.' },
      require_email_verification: {
        label: 'Bắt buộc xác minh email khi đăng ký',
        description:
          'Gửi mã xác minh ngay khi đăng ký; tài khoản chưa xác minh không dùng được hệ thống.',
      },
      require_2fa_admin: {
        label: 'Bắt buộc 2FA cho quản trị viên',
        description: 'Tài khoản vào trang admin phải bật xác thực 2 lớp.',
      },
      two_factor_methods: {
        label: 'Phương thức 2FA được phép',
        description:
          'Bỏ 1 phương thức thì người dùng không bật mới được, người đang dùng vẫn đăng nhập bình thường. Để trống = chỉ ứng dụng xác thực.',
        options: { totp: 'Ứng dụng xác thực', email: 'Email', passkey: 'Passkey' },
      },
      admin_2fa_allow_email: {
        label: 'Cho phép quản trị viên chỉ dùng email làm 2FA',
        description:
          'Mặc định tài khoản quản trị phải có ứng dụng xác thực hoặc passkey, vì email cũng là kênh đặt lại mật khẩu.',
      },
      login_geoip_enabled: {
        label: 'Tra vị trí đăng nhập qua dịch vụ ngoài khi thiếu',
        description:
          'Khi header Cloudflare không có thành phố (chưa bật Managed Transform "Add visitor location headers") thì tra IP qua ipwho.is — IP được gửi tới dịch vụ này. Đã bật Managed Transform thì không tra ngoài.',
      },
      smtp_host: {
        label: 'SMTP host',
        description:
          'Để trống thì loại email chưa cấu hình qua Sendify chỉ được ghi ra log (tiện cho môi trường dev).',
      },
      smtp_port: { label: 'SMTP port', description: 'Thường là 587 (STARTTLS) hoặc 465 (SSL).' },
      smtp_secure: { label: 'Dùng SSL/TLS', description: 'Bật khi dùng cổng 465.' },
      smtp_user: { label: 'Tài khoản SMTP', description: '' },
      smtp_password: { label: 'Mật khẩu SMTP', description: '' },
      mail_from: { label: 'Người gửi', description: 'Địa chỉ hiển thị ở mục "From".' },
      sendify_api_key: { label: 'API key', description: 'Lấy tại trang quản lý Sendify.' },
      sendify_from: {
        label: 'Người gửi',
        description: 'Để trống thì dùng "Người gửi" ở mục SMTP bên dưới.',
      },
      sendify_template_verify_email: {
        label: 'Template xác minh email',
        description: 'Biến: fullName, verificationCode, expiresInMinutes, appName.',
      },
      sendify_template_two_factor_code: {
        label: 'Template mã xác thực 2 lớp',
        description: 'Biến: fullName, code, expiresInMinutes, appName, ipAddress, device.',
      },
      sendify_template_reset_password: {
        label: 'Template đặt lại mật khẩu',
        description: 'Biến: fullName, resetLink, expiresInMinutes, appName.',
      },
      google_client_id: { label: 'Client ID', description: '' },
      google_client_secret: { label: 'Client secret', description: '' },
      turnstile_site_key: { label: 'Site key', description: '' },
      turnstile_secret_key: { label: 'Secret key', description: '' },
    },
  },
  permissions: {
    notFound: 'Không tìm thấy quyền',
  },
  emailVerification: {
    required: 'Bạn cần xác minh email trước khi tiếp tục',
    alreadyVerified: 'Email đã được xác minh',
    cooldown: 'Vui lòng chờ {{seconds}} giây trước khi gửi lại mã',
    codeInvalid: 'Mã xác minh không đúng hoặc đã hết hạn',
    sendFailed: 'Không gửi được email xác minh, vui lòng thử lại sau',
  },
  notifications: {
    welcome: {
      title: 'Chào mừng bạn đến với {{appName}}',
      message: 'Tài khoản của bạn đã được tạo thành công.',
    },
    passwordChanged: {
      title: 'Mật khẩu đã được thay đổi',
      message: 'Nếu không phải bạn thực hiện, hãy đặt lại mật khẩu ngay.',
    },
    twoFactorEnabled: {
      title: 'Đã bật xác thực 2 lớp',
      message: 'Tài khoản của bạn đã được bảo vệ bằng xác thực 2 lớp.',
    },
    twoFactorDisabled: {
      title: 'Đã tắt xác thực 2 lớp',
      message: 'Nếu không phải bạn thực hiện, hãy đổi mật khẩu ngay.',
    },
    twoFactorMethodAdded: {
      title: 'Đã thêm phương thức xác thực 2 lớp',
      message: 'Đã thêm "{{method}}" vào tài khoản. Nếu không phải bạn, hãy đổi mật khẩu ngay.',
    },
    twoFactorMethodRemoved: {
      title: 'Đã gỡ phương thức xác thực 2 lớp',
      message: 'Đã gỡ "{{method}}" khỏi tài khoản. Nếu không phải bạn, hãy đổi mật khẩu ngay.',
    },
  },
  mail: {
    greeting: 'Xin chào {{name}},',
    verifyEmail: {
      subject: '[{{appName}}] Mã xác minh email',
      intro: 'Mã xác minh địa chỉ email của bạn là:',
      expiry: 'Mã có hiệu lực trong {{minutes}} phút.',
      ignore: 'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    },
    twoFactorCode: {
      subject: '[{{appName}}] Mã xác thực đăng nhập',
      intro: 'Mã xác thực 2 lớp của bạn là:',
      expiry: 'Mã có hiệu lực trong {{minutes}} phút và chỉ dùng được 1 lần.',
      context: 'Yêu cầu từ IP {{ip}} - thiết bị {{device}}.',
      warning:
        'Nếu không phải bạn đang đăng nhập, mật khẩu của bạn có thể đã bị lộ: hãy đổi mật khẩu ngay và không chia sẻ mã này cho bất kỳ ai.',
    },
    footer: 'Email này được gửi tự động từ {{appName}}, vui lòng không trả lời.',
    resetPassword: {
      subject: '[{{appName}}] Đặt lại mật khẩu',
      intro: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
      action: 'Đặt lại mật khẩu',
      expiry: 'Link có hiệu lực trong {{minutes}} phút.',
      ignore: 'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    },
  },
  categories: {
    notFound: 'Không tìm thấy danh mục',
    nameExists: 'Danh mục "{{name}}" đã tồn tại',
    inUse: 'Danh mục đang có sản phẩm, hãy chuyển sản phẩm sang danh mục khác hoặc ngừng sử dụng',
    inactive: 'Danh mục đã ngừng sử dụng',
  },
  products: {
    notFound: 'Không tìm thấy sản phẩm',
    skuExists: 'SKU "{{sku}}" đã tồn tại',
    hasTransactions: 'Sản phẩm đã phát sinh giao dịch, chỉ có thể ngừng kinh doanh',
    inactive: 'Sản phẩm {{sku}} đã ngừng kinh doanh',
    decimalQuantityLocked: 'Tồn kho hiện có số lẻ, không thể tắt cho phép số lượng lẻ',
  },
  productImages: {
    notFound: 'Không tìm thấy ảnh',
    tooLarge: 'Ảnh vượt quá {{maxMb}} MB',
    limitReached: 'Mỗi sản phẩm tối đa {{limit}} ảnh',
    notUploaded: 'Chưa tải ảnh lên hoặc tải lên chưa hoàn tất',
    contentMismatch: 'Nội dung file không phải ảnh JPEG, PNG hoặc WebP hợp lệ',
    expired: 'Phiên tải ảnh đã hết hạn, vui lòng chọn lại ảnh',
    notPending: 'Ảnh này đã được xử lý',
    orderMismatch: 'Danh sách thứ tự ảnh không khớp với ảnh hiện có',
  },
  suppliers: {
    notFound: 'Không tìm thấy nhà cung cấp',
    inUse: 'Nhà cung cấp đã có phiếu nhập, chỉ có thể ngừng hợp tác',
    inactive: 'Nhà cung cấp đã ngừng hợp tác',
  },
  purchases: {
    notFound: 'Không tìm thấy phiếu nhập',
    notDraft: 'Chỉ phiếu nháp mới được sửa hoặc huỷ',
    alreadyProcessed: 'Phiếu nhập đã được xử lý trước đó',
    stale: 'Phiếu nhập đã bị thay đổi bởi người khác, vui lòng tải lại',
  },
  sales: {
    notFound: 'Không tìm thấy đơn bán',
    notDraft: 'Chỉ đơn nháp mới được sửa',
    alreadyProcessed: 'Đơn bán đã được xử lý trước đó',
    stale: 'Đơn bán đã bị thay đổi bởi người khác, vui lòng tải lại',
    insufficientStock: 'Sản phẩm {{sku}} không đủ hàng: cần {{requested}}, còn {{available}}',
    priceOverrideForbidden: 'Bạn không có quyền bán khác giá niêm yết',
    notConfirmed: 'Đơn chưa được chốt',
    alreadyPaid: 'Đơn đã được thanh toán',
    alreadyCancelled: 'Đơn đã bị huỷ',
    cancelForbidden: 'Bạn không có quyền huỷ đơn đã chốt',
  },
  inventory: {
    negativeStock: 'Sản phẩm {{sku}} không đủ tồn: cần giảm {{requested}}, còn {{available}}',
    decimalNotAllowed: 'Sản phẩm {{sku}} chỉ nhận số lượng nguyên',
    noChange: 'Số đếm thực tế bằng tồn hiện tại, không có gì để điều chỉnh',
    adjustmentNotFound: 'Không tìm thấy phiếu điều chỉnh',
  },
  documents: {
    discountExceedsAmount: 'Chiết khấu vượt quá tổng tiền',
    lineDiscountExceedsAmount: 'Chiết khấu dòng {{line}} vượt quá thành tiền',
  },
  reports: {
    rangeTooLarge: 'Khoảng ngày tối đa {{days}} ngày',
  },
  storage: {
    unavailable: 'Kho lưu trữ ảnh chưa được cấu hình hoặc đang không khả dụng',
  },
} satisfies Messages;
