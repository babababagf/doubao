import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

@Injectable()
export class CredentialCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): { ciphertext: string; nonce: string } {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key(), nonce)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64')
    return { ciphertext, nonce: nonce.toString('base64') }
  }

  decrypt(ciphertext: string, nonce: string): string {
    const payload = Buffer.from(ciphertext, 'base64')
    const authTag = payload.subarray(payload.length - 16)
    const encrypted = payload.subarray(0, payload.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(nonce, 'base64'))
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }

  private key(): Buffer {
    const encoded = this.config.get<string>('CREDENTIAL_ENCRYPTION_KEY')
    const key = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0)
    if (key.length !== 32) throw new ServiceUnavailableException({ code: 'CREDENTIAL_ENCRYPTION_KEY_MISSING', message: '服务器未配置有效的凭证加密主密钥，拒绝保存 API Key' })
    return key
  }
}
