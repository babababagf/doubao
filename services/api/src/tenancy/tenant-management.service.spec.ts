import { describe, expect, it } from 'vitest'

import type { AdminActor } from '../auth/auth.types'
import { TenantManagementService } from './tenant-management.service'

describe('TenantManagementService 审计日志', () => {
  it('只允许总后台读取，并脱敏敏感详情字段', async () => {
    const prisma = {
      auditLog: {
        findMany: async () => [{
          id: 'audit-1', tenant: { name: '测试贴牌' }, actorTenantId: 'tenant-admin', action: 'provider_config.tested', entityType: 'ProviderConfig', entityId: 'provider-1',
          detail: { alias: '豆包检测', apiKey: 'should-not-leak', nested: { accessSecret: 'should-not-leak' } }, createdAt: new Date('2026-08-07T00:00:00.000Z'),
        }],
      },
    }
    const service = new TenantManagementService(prisma as never)
    const actor = { userId: 'platform-1', tenantId: null, username: 'admin001', role: 'PLATFORM_ADMIN', status: 'ACTIVE' } as unknown as AdminActor

    await expect(service.listAuditLogs(actor)).resolves.toEqual([expect.objectContaining({
      tenantName: '测试贴牌', actorScope: 'tenant_admin', detail: { alias: '豆包检测', apiKey: 'REDACTED', nested: { accessSecret: 'REDACTED' } },
    })])
    await expect(service.listAuditLogs({ ...actor, role: 'WHITE_LABEL_ADMIN' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) })
  })

  it('只允许总后台读取全局任务概览，并对任务失败原因脱敏', async () => {
    const at = new Date('2026-08-08T01:00:00.000Z')
    const prisma = {
      aiGenerationTask: {
        groupBy: async () => [{ status: 'QUEUED', _count: { _all: 2 } }, { status: 'PARTIALLY_FAILED', _count: { _all: 1 } }],
        findMany: async () => [{ id: 'ai-1', type: 'ARTICLE_WRITING', status: 'PARTIALLY_FAILED', totalCount: 3, completedCount: 2, failedCount: 1, failureReason: 'provider token leaked', createdAt: at, updatedAt: at, tenant: { name: '商户 A' } }],
      },
      doubaoCheckBatch: {
        groupBy: async () => [{ status: 'RUNNING', _count: { _all: 1 } }],
        findMany: async () => [{ id: 'doubao-1', status: 'RUNNING', totalCount: 8, completedCount: 2, failedCount: 0, failureReason: null, createdAt: at, updatedAt: at, whiteLabel: { name: '贴牌 A' } }],
      },
      publishTask: {
        groupBy: async () => [{ status: 'ATTENTION', _count: { _all: 1 } }, { status: 'STOPPED', _count: { _all: 1 } }],
        findMany: async () => [{ id: 'publish-1', status: 'ATTENTION', failureReason: '等待人工确认', createdAt: at, updatedAt: at, tenant: { name: '商户 B' } }],
      },
    }
    const service = new TenantManagementService(prisma as never)
    const actor = { userId: 'platform-1', tenantId: null, username: 'admin001', role: 'PLATFORM_ADMIN', status: 'ACTIVE' } as unknown as AdminActor

    await expect(service.listTaskOperations(actor)).resolves.toMatchObject({
      summary: { queued: 2, running: 1, attention: 1, failed: 2 },
      items: [
        expect.objectContaining({ id: 'ai-1', category: 'ai_article_writing', failureReason: '失败原因包含敏感字段，已隐藏' }),
        expect.objectContaining({ id: 'doubao-1', category: 'doubao_check', status: 'running' }),
        expect.objectContaining({ id: 'publish-1', category: 'publish', status: 'attention' }),
      ],
    })
    await expect(service.listTaskOperations({ ...actor, role: 'WHITE_LABEL_ADMIN' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) })
  })
})
