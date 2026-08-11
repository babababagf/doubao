import { describe, expect, it } from 'vitest'

import type { AdminActor } from '../auth/auth.types'
import { PlatformUpdatePolicyService } from './platform-update-policy.service'

const platformActor = { userId: 'platform-1', tenantId: null, username: 'admin001', role: 'PLATFORM_ADMIN', status: 'ACTIVE' } as unknown as AdminActor

describe('PlatformUpdatePolicyService', () => {
  it('未配置时对发布助手保持禁用状态', async () => {
    const service = new PlatformUpdatePolicyService({ platformUpdatePolicy: { findUnique: async () => null } } as never)
    await expect(service.getForPublisher()).resolves.toEqual({ enabled: false, feedUrl: null, minimumVersion: null, releaseNotes: '', updatedAt: null })
  })

  it('只接受总后台配置的公开 HTTPS 更新源', async () => {
    const upsert = async ({ create }: { create: Record<string, unknown> }) => ({ ...create, updatedAt: new Date('2026-08-07T00:00:00.000Z') })
    const prisma = { $transaction: async (work: (tx: { platformUpdatePolicy: { upsert: typeof upsert }; auditLog: { create: () => Promise<void> } }) => Promise<unknown>) => work({ platformUpdatePolicy: { upsert }, auditLog: { create: async () => undefined } }) }
    const service = new PlatformUpdatePolicyService(prisma as never)

    await expect(service.save(platformActor, { enabled: true, feedUrl: 'https://updates.example.com/publisher/', minimumVersion: '0.1.6', releaseNotes: '安全修复' })).resolves.toMatchObject({ enabled: true, feedUrl: 'https://updates.example.com/publisher', minimumVersion: '0.1.6' })
    await expect(service.save(platformActor, { enabled: true, feedUrl: 'http://updates.example.com', minimumVersion: '', releaseNotes: '' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'UPDATE_POLICY_INVALID' }) })
    await expect(service.save(platformActor, { enabled: true, feedUrl: 'https://127.0.0.1/updates', minimumVersion: '', releaseNotes: '' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'UPDATE_POLICY_INVALID' }) })
    await expect(service.save(platformActor, { enabled: true, feedUrl: 'https://updates.example.com', minimumVersion: 'v0.1.6', releaseNotes: '' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'UPDATE_POLICY_INVALID' }) })
    await expect(service.save({ ...platformActor, role: 'WHITE_LABEL_ADMIN' }, { enabled: false, feedUrl: '', minimumVersion: '', releaseNotes: '' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) })
  })
})
