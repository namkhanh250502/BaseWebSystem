import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, passkeys, type Passkey, type User } from '@base/db';
import {
  MAX_PASSKEYS_PER_USER,
  type PasskeyDto,
  type WebAuthnOptionsJSON,
  type WebAuthnResponseInput,
} from '@base/shared';
import { badRequest, conflict, logger } from '@base/server-kit';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getEnv } from '../../config/env';
import { InjectDb, type Database } from '../../core/database';
import { MINUTE } from '../../core/rate-limit.service';
import { AuthChallengeStore, type ChallengePurpose } from './auth-challenge.store';

const CHALLENGE_TTL_MS = 5 * MINUTE;
const TIMEOUT_MS = 60_000;

/** Cấu hình Relying Party: RP ID (domain gắn passkey) và các origin được phép */
export function webAuthnConfig() {
  const env = getEnv();
  const origins = new Set([new URL(env.USER_APP_URL).origin, new URL(env.ADMIN_APP_URL).origin]);
  for (const extra of (env.WEBAUTHN_ORIGINS ?? '').split(',')) {
    if (extra.trim()) origins.add(new URL(extra.trim()).origin);
  }
  return {
    rpID: env.WEBAUTHN_RP_ID || new URL(env.USER_APP_URL).hostname,
    rpName: env.WEBAUTHN_RP_NAME || env.APP_NAME,
    origins: [...origins],
  };
}

export function toPasskeyDto(row: Passkey): PasskeyDto {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

/** UUID của user → 16 byte, dùng làm user handle ổn định cho WebAuthn */
function userHandle(userId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(userId.replace(/-/g, ''), 'hex'));
}

/** Passkey (WebAuthn) làm phương thức 2FA, dùng thư viện @simplewebauthn/server */
@Injectable()
export class PasskeyMethod {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly challenges: AuthChallengeStore,
  ) {}

  list(userId: string): Promise<Passkey[]> {
    return this.db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, userId))
      .orderBy(asc(passkeys.createdAt));
  }

  async countFor(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(passkeys)
      .where(eq(passkeys.userId, userId));
    return row?.value ?? 0;
  }

  async find(userId: string, id: string): Promise<Passkey | null> {
    const [row] = await this.db
      .select()
      .from(passkeys)
      .where(and(eq(passkeys.userId, userId), eq(passkeys.id, id)));
    return row ?? null;
  }

  /** Bước 1 đăng ký: options cho `navigator.credentials.create()` */
  async registrationOptions(user: User, purpose: ChallengePurpose): Promise<WebAuthnOptionsJSON> {
    const existing = await this.list(user.id);
    if (existing.length >= MAX_PASSKEYS_PER_USER) {
      throw badRequest('twoFactor.passkeyLimit', { max: MAX_PASSKEYS_PER_USER });
    }
    const { rpID, rpName } = webAuthnConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userID: userHandle(user.id),
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      timeout: TIMEOUT_MS,
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports ?? undefined,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await this.challenges.create(
      user.id,
      'webauthn_register',
      purpose,
      options.challenge,
      CHALLENGE_TTL_MS,
    );
    return options as unknown as WebAuthnOptionsJSON;
  }

  /** Bước 2 đăng ký: kiểm tra phản hồi của authenticator rồi lưu passkey */
  async register(
    user: User,
    response: WebAuthnResponseInput,
    name: string,
    purpose: ChallengePurpose,
  ): Promise<Passkey> {
    const challenge = await this.challenges.findActive(user.id, 'webauthn_register', purpose);
    // Challenge chỉ dùng 1 lần, kể cả khi xác minh thất bại
    if (!challenge || !(await this.challenges.consume(challenge.id))) {
      throw badRequest('twoFactor.passkeyChallengeExpired');
    }
    const { rpID, origins } = webAuthnConfig();
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: response as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge.value,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
    } catch (error) {
      logger.warn('Đăng ký passkey thất bại', (error as Error).message);
      throw badRequest('twoFactor.passkeyInvalid');
    }
    if (!verification.verified) throw badRequest('twoFactor.passkeyInvalid');

    const info = verification.registrationInfo;
    const [dup] = await this.db
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(eq(passkeys.credentialId, info.credential.id));
    if (dup) throw conflict('twoFactor.passkeyExists');
    if ((await this.countFor(user.id)) >= MAX_PASSKEYS_PER_USER) {
      throw badRequest('twoFactor.passkeyLimit', { max: MAX_PASSKEYS_PER_USER });
    }

    const [row] = await this.db
      .insert(passkeys)
      .values({
        userId: user.id,
        credentialId: info.credential.id,
        publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports ?? null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
        name,
      })
      .returning();
    return row!;
  }

  /** Bước 1 xác thực: options cho `navigator.credentials.get()` */
  async authenticationOptions(user: User, purpose: ChallengePurpose): Promise<WebAuthnOptionsJSON> {
    const list = await this.list(user.id);
    if (!list.length) throw badRequest('twoFactor.methodNotEnabled');
    const options = await generateAuthenticationOptions({
      rpID: webAuthnConfig().rpID,
      timeout: TIMEOUT_MS,
      userVerification: 'preferred',
      allowCredentials: list.map((p) => ({
        id: p.credentialId,
        transports: (p.transports ?? undefined) as AuthenticatorTransport[] | undefined,
      })),
    });
    await this.challenges.create(
      user.id,
      'webauthn_authenticate',
      purpose,
      options.challenge,
      CHALLENGE_TTL_MS,
    );
    return options as unknown as WebAuthnOptionsJSON;
  }

  /** Bước 2 xác thực: kiểm tra chữ ký, challenge, origin, RP ID và signature counter */
  async verify(
    user: User,
    response: WebAuthnResponseInput,
    purpose: ChallengePurpose,
  ): Promise<boolean> {
    const challenge = await this.challenges.findActive(user.id, 'webauthn_authenticate', purpose);
    if (!challenge || !(await this.challenges.consume(challenge.id))) return false;

    const [passkey] = await this.db
      .select()
      .from(passkeys)
      .where(and(eq(passkeys.userId, user.id), eq(passkeys.credentialId, response.id)));
    if (!passkey) return false;

    const { rpID, origins } = webAuthnConfig();
    try {
      const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response: response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge.value,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: passkey.credentialId,
          publicKey: isoBase64URL.toBuffer(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports ?? undefined,
        },
      });
      if (!verified) return false;
      await this.db
        .update(passkeys)
        .set({
          counter: authenticationInfo.newCounter,
          backedUp: authenticationInfo.credentialBackedUp,
          lastUsedAt: new Date(),
        })
        .where(eq(passkeys.id, passkey.id));
      return true;
    } catch (error) {
      // Gồm cả trường hợp counter không tăng (nghi authenticator bị nhân bản)
      logger.warn('Xác thực passkey thất bại', (error as Error).message);
      return false;
    }
  }

  async rename(userId: string, id: string, name: string): Promise<Passkey | null> {
    const [row] = await this.db
      .update(passkeys)
      .set({ name })
      .where(and(eq(passkeys.userId, userId), eq(passkeys.id, id)))
      .returning();
    return row ?? null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(passkeys)
      .where(and(eq(passkeys.userId, userId), eq(passkeys.id, id)))
      .returning({ id: passkeys.id });
    return rows.length > 0;
  }

  async removeAll(userId: string): Promise<void> {
    await this.db.delete(passkeys).where(eq(passkeys.userId, userId));
  }
}
