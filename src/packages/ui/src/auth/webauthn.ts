import type { WebAuthnOptionsJSON, WebAuthnResponseInput } from '@base/shared';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

/** Trình duyệt hỗ trợ passkey (WebAuthn) */
export function passkeySupported(): boolean {
  return browserSupportsWebAuthn();
}

/** Mở hộp thoại tạo passkey (vân tay, Face ID, Windows Hello, khoá bảo mật…) */
export async function createPasskey(options: WebAuthnOptionsJSON): Promise<WebAuthnResponseInput> {
  const response = await startRegistration({
    optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return response as unknown as WebAuthnResponseInput;
}

/** Mở hộp thoại xác thực bằng passkey đã đăng ký */
export async function getPasskey(options: WebAuthnOptionsJSON): Promise<WebAuthnResponseInput> {
  const response = await startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  return response as unknown as WebAuthnResponseInput;
}

/** Người dùng huỷ hộp thoại passkey hoặc hết thời gian chờ */
export function isPasskeyCancelled(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return (
    error.name === 'NotAllowedError' ||
    error.name === 'AbortError' ||
    code === 'ERROR_CEREMONY_ABORTED'
  );
}

/** Gợi ý tên passkey theo trình duyệt / hệ điều hành, ví dụ "Chrome trên Windows" */
export function suggestPasskeyName(on: string): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  if (browser && os) return `${browser} ${on} ${os}`;
  return browser || os || 'Passkey';
}
