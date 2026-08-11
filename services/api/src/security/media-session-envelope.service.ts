import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export interface MediaSessionEncryptionContext {
  tenantId: string
  mediaAccountId: string
  platform: string
  localReferenceId: string
  schemaVersion: number
}

export interface EncryptedMediaSessionPayload {
  payloadCiphertext: Uint8Array<ArrayBuffer>
  payloadNonce: Uint8Array<ArrayBuffer>
  payloadAuthTag: Uint8Array<ArrayBuffer>
  wrappedDataKey: Uint8Array<ArrayBuffer>
  keyWrapNonce: Uint8Array<ArrayBuffer>
  keyWrapAuthTag: Uint8Array<ArrayBuffer>
  keyProvider: string
  keyVersion: string
  payloadSha256: string
  payloadBytes: number
}

@Injectable()
export class MediaSessionEnvelopeService {
  constructor(private readonly config: ConfigService) {}

  encrypt(payload: Buffer, context: MediaSessionEncryptionContext): EncryptedMediaSessionPayload {
    const keyring = this.keyring()
    const dataKey = randomBytes(32)
    const aad = this.aad(context)
    const encryptedPayload = this.encryptAesGcm(payload, dataKey, aad)
    const wrappedKey = this.encryptAesGcm(dataKey, keyring.activeKey, Buffer.from(`doubaohk-media-session-key:${keyring.activeVersion}`, 'utf8'))
    return {
      payloadCiphertext: new Uint8Array(encryptedPayload.ciphertext),
      payloadNonce: new Uint8Array(encryptedPayload.nonce),
      payloadAuthTag: new Uint8Array(encryptedPayload.authTag),
      wrappedDataKey: new Uint8Array(wrappedKey.ciphertext),
      keyWrapNonce: new Uint8Array(wrappedKey.nonce),
      keyWrapAuthTag: new Uint8Array(wrappedKey.authTag),
      keyProvider: 'platform-environment-v1',
      keyVersion: keyring.activeVersion,
      payloadSha256: createHash('sha256').update(payload).digest('hex'),
      payloadBytes: payload.length,
    }
  }

  decrypt(payload: EncryptedMediaSessionPayload, context: MediaSessionEncryptionContext): Buffer {
    try {
      const keyring = this.keyring()
      const wrappingKey = keyring.keys.get(payload.keyVersion)
      if (!wrappingKey) throw new Error('unknown key version')
      const dataKey = this.decryptAesGcm(
        Buffer.from(payload.wrappedDataKey),
        wrappingKey,
        Buffer.from(payload.keyWrapNonce),
        Buffer.from(payload.keyWrapAuthTag),
        Buffer.from(`doubaohk-media-session-key:${payload.keyVersion}`, 'utf8'),
      )
      const plaintext = this.decryptAesGcm(Buffer.from(payload.payloadCiphertext), dataKey, Buffer.from(payload.payloadNonce), Buffer.from(payload.payloadAuthTag), this.aad(context))
      const digest = createHash('sha256').update(plaintext).digest('hex')
      if (digest !== payload.payloadSha256 || plaintext.length !== payload.payloadBytes) throw new Error('payload integrity mismatch')
      return plaintext
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw new InternalServerErrorException({ code: 'MEDIA_SESSION_DECRYPT_FAILED', message: '媒体账号会话备份无法解密或完整性校验失败' })
    }
  }

  private aad(context: MediaSessionEncryptionContext): Buffer {
    return Buffer.from([
      'doubaohk-media-session-v1',
      context.tenantId,
      context.mediaAccountId,
      context.platform,
      context.localReferenceId,
      String(context.schemaVersion),
    ].join('\u0000'), 'utf8')
  }

  private encryptAesGcm(value: Buffer, key: Buffer, aad: Buffer): { ciphertext: Buffer; nonce: Buffer; authTag: Buffer } {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(aad)
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()])
    return { ciphertext, nonce, authTag: cipher.getAuthTag() }
  }

  private decryptAesGcm(ciphertext: Buffer, key: Buffer, nonce: Buffer, authTag: Buffer, aad: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAAD(aad)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  }

  private keyring(): { activeVersion: string; activeKey: Buffer; keys: Map<string, Buffer> } {
    const activeVersion = this.config.get<string>('MEDIA_SESSION_KMS_ACTIVE_KEY_VERSION')?.trim()
    const encodedKeyring = this.config.get<string>('MEDIA_SESSION_KMS_KEYRING')
    let parsed: unknown
    try { parsed = encodedKeyring ? JSON.parse(encodedKeyring) : null } catch { parsed = null }
    if (!activeVersion || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ServiceUnavailableException({ code: 'MEDIA_SESSION_KMS_MISSING', message: '服务器未配置媒体会话平台托管密钥，拒绝保存或恢复媒体账号会话' })
    }
    const keys = new Map<string, Buffer>()
    for (const [version, encoded] of Object.entries(parsed)) {
      if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(version)) continue
      const key = Buffer.from(encoded, 'base64')
      if (key.length === 32) keys.set(version, key)
    }
    const activeKey = keys.get(activeVersion)
    if (!activeKey) throw new ServiceUnavailableException({ code: 'MEDIA_SESSION_KMS_MISSING', message: '服务器未配置媒体会话平台托管密钥，拒绝保存或恢复媒体账号会话' })
    return { activeVersion, activeKey, keys }
  }
}
