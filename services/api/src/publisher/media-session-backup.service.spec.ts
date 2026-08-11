import { describe, expect, it } from 'vitest'

import { MediaPlatform } from '../generated/prisma/client'
import { MediaSessionBackupService } from './media-session-backup.service'

const actor = { userId: 'user-1', tenantId: 'tenant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-new' } as const
const localReferenceId = '11111111-1111-4111-8111-111111111111'
const portableBundle = { schemaVersion: 1, platform: 'douyin', localReferenceId, capturedAt: '2026-08-08T00:00:00.000Z', cookies: [{ name: 'sessionid', value: 'secret', domain: '.douyin.com', path: '/', secure: true, httpOnly: true }], origins: [{ origin: 'https://creator.douyin.com', localStorage: [], sessionStorage: [] }] }

describe('MediaSessionBackupService', () => {
  it('保存时只向持久层写入密文并记录不含凭据的审计摘要', async () => {
    let createData: Record<string, unknown> | undefined
    let auditDetail: unknown
    const transaction = {
      mediaSessionBackup: { upsert: async ({ create }: { create: Record<string, unknown> }) => { createData = create; return { schemaVersion: 1, capturedAt: new Date(portableBundle.capturedAt), payloadBytes: 512 } } },
      auditLog: { create: async ({ data }: { data: { detail: unknown } }) => { auditDetail = data.detail; return {} } },
    }
    const prisma = {
      mediaAccount: { findFirst: async () => ({ id: 'media-1', platform: MediaPlatform.DOUYIN, localReferenceId }) },
      $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction),
    }
    const envelope = { encrypt: () => ({ payloadCiphertext: new Uint8Array([1]), payloadNonce: new Uint8Array([2]), payloadAuthTag: new Uint8Array([3]), wrappedDataKey: new Uint8Array([4]), keyWrapNonce: new Uint8Array([5]), keyWrapAuthTag: new Uint8Array([6]), keyProvider: 'platform-environment-v1', keyVersion: 'k1', payloadSha256: 'a'.repeat(64), payloadBytes: 512 }) }
    const service = new MediaSessionBackupService(prisma as never, envelope as never)

    await expect(service.save(actor, 'media-1', portableBundle)).resolves.toMatchObject({ available: true, payloadBytes: 512 })
    expect(createData).not.toHaveProperty('bundle')
    expect(createData).not.toHaveProperty('cookies')
    expect(JSON.stringify(auditDetail)).not.toContain('secret')
  })

  it('跨设备恢复时返回原会话包并留下跨设备审计标记', async () => {
    let auditDetail: unknown
    const plaintext = Buffer.from(JSON.stringify(portableBundle), 'utf8')
    const backup = { id: 'backup-1', tenantId: 'tenant-1', mediaAccountId: 'media-1', sourceDeviceId: 'device-old', schemaVersion: 1, capturedAt: new Date(portableBundle.capturedAt), payloadBytes: plaintext.length, payloadSha256: 'a'.repeat(64), payloadCiphertext: new Uint8Array([1]), payloadNonce: new Uint8Array([2]), payloadAuthTag: new Uint8Array([3]), wrappedDataKey: new Uint8Array([4]), keyWrapNonce: new Uint8Array([5]), keyWrapAuthTag: new Uint8Array([6]), keyProvider: 'platform-environment-v1', keyVersion: 'k1' }
    const prisma = {
      mediaAccount: { findFirst: async () => ({ id: 'media-1', platform: MediaPlatform.DOUYIN, localReferenceId }) },
      mediaSessionBackup: { findFirst: async () => backup, update: async () => ({}) },
      auditLog: { create: async ({ data }: { data: { detail: unknown } }) => { auditDetail = data.detail; return {} } },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    }
    const service = new MediaSessionBackupService(prisma as never, { decrypt: () => plaintext } as never)

    await expect(service.restore(actor, 'media-1')).resolves.toMatchObject({ crossDevice: true, bundle: { platform: 'douyin', cookies: [{ httpOnly: true }] } })
    expect(auditDetail).toMatchObject({ crossDevice: true, sourceDeviceId: 'device-old', targetDeviceId: 'device-new' })
  })
})
