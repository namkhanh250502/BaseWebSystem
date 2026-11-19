import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

const b64url = (buf: Uint8Array) => Buffer.from(buf).toString('base64url');
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();

export interface CeremonyOverrides {
  origin?: string;
  rpId?: string;
  challenge?: string;
  type?: string;
  /** Ghi đè signature counter của lần ký này */
  counter?: number;
  /** Không bật cờ User Present */
  noUserPresence?: boolean;
}

/**
 * Authenticator phần mềm (ES256) để test WebAuthn đầu-cuối mà không cần trình duyệt:
 * tạo attestation 'none' khi đăng ký và chữ ký hợp lệ khi xác thực.
 */
export class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  counter = 0;

  constructor(
    public origin = 'http://localhost:5173',
    public rpId = 'localhost',
  ) {
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  private cosePublicKey(): Uint8Array {
    const jwk = this.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const map = new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, isoBase64URL.toBuffer(jwk.x)],
      [-3, isoBase64URL.toBuffer(jwk.y)],
    ]);
    return isoCBOR.encode(map as never);
  }

  private authData(rpId: string, flags: number, counter: number, attested?: Uint8Array): Buffer {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    return Buffer.concat([
      sha256(rpId),
      Buffer.from([flags]),
      count,
      ...(attested ? [attested] : []),
    ]);
  }

  private clientData(type: string, challenge: string, origin: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  /** Phản hồi cho navigator.credentials.create() */
  register(options: { challenge: string; rp?: { id?: string } }, o: CeremonyOverrides = {}) {
    const rpId = o.rpId ?? options.rp?.id ?? this.rpId;
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const attested = Buffer.concat([
      Buffer.alloc(16),
      idLen,
      this.credentialId,
      this.cosePublicKey(),
    ]);
    // UP (0x01) + UV (0x04) + AT (0x40)
    const flags = (o.noUserPresence ? 0 : 0x01) | 0x04 | 0x40;
    const authData = this.authData(rpId, flags, o.counter ?? this.counter, attested);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(authData)],
      ]) as never,
    );
    const clientDataJSON = this.clientData(
      o.type ?? 'webauthn.create',
      o.challenge ?? options.challenge,
      o.origin ?? this.origin,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(clientDataJSON),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** Phản hồi cho navigator.credentials.get(); mỗi lần ký tăng counter */
  authenticate(options: { challenge: string; rpId?: string }, o: CeremonyOverrides = {}) {
    const rpId = o.rpId ?? options.rpId ?? this.rpId;
    this.counter += 1;
    const counter = o.counter ?? this.counter;
    const flags = (o.noUserPresence ? 0 : 0x01) | 0x04;
    const authData = this.authData(rpId, flags, counter);
    const clientDataJSON = this.clientData(
      o.type ?? 'webauthn.get',
      o.challenge ?? options.challenge,
      o.origin ?? this.origin,
    );
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientDataJSON)]),
      this.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
