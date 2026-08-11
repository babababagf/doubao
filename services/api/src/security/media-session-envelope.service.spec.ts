import { describe, expect, it } from 'vitest'

import { MediaSessionEnvelopeService } from './media-session-envelope.service'

function service(activeVersion = 'k1'): MediaSessionEnvelopeService {
  const keyring = JSON.stringify({ k1: Buffer.alloc(32, 7).toString('base64'), old: Buffer.alloc(32, 3).toString('base64') })
  return new MediaSessionEnvelopeService({ get: (name: string) => name === 'MEDIA_SESSION_KMS_ACTIVE_KEY_VERSION' ? activeVersion : name === 'MEDIA_SESSION_KMS_KEYRING' ? keyring : undefined } as never)
}

const context = { tenantId: 'tenant-1', mediaAccountId: 'media-1', platform: 'douyin', localReferenceId: 'local-1', schemaVersion: 1 }

describe('MediaSessionEnvelopeService', () => {
  it('使用独立数据密钥加密并可按原上下文恢复', () => {
    const crypto = service()
    const plaintext = Buffer.from('{"cookies":[{"name":"sessionid","value":"secret"}]}', 'utf8')
    const encrypted = crypto.encrypt(plaintext, context)

    expect(Buffer.from(encrypted.payloadCiphertext).equals(plaintext)).toBe(false)
    expect(encrypted.keyVersion).toBe('k1')
    expect(encrypted.payloadSha256).toHaveLength(64)
    expect(crypto.decrypt(encrypted, context).equals(plaintext)).toBe(true)
  })

  it('拒绝跨租户或跨媒体账号替换密文', () => {
    const crypto = service()
    const encrypted = crypto.encrypt(Buffer.from('secret'), context)
    expect(() => crypto.decrypt(encrypted, { ...context, tenantId: 'tenant-2' })).toThrowError()
  })

  it('未配置独立媒体会话密钥时拒绝保存', () => {
    expect(() => service('missing').encrypt(Buffer.from('secret'), context)).toThrowError()
  })
})
