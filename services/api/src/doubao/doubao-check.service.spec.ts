import { describe, expect, it, vi } from 'vitest'

import { AccountStatus, DoubaoApiStatus, DoubaoCheckBatchScope, DoubaoCheckBatchStatus, UserRole } from '../generated/prisma/client'
import { DoubaoCheckService } from './doubao-check.service'

function applyUpdate<T extends object>(target: T, data: Record<string, unknown>): T {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      const increment = (value as { increment: number }).increment
      Object.assign(target, { [key]: ((target as Record<string, number>)[key] ?? 0) + increment })
    } else Object.assign(target, { [key]: value })
  }
  return target
}

describe('DoubaoCheckService Worker 重试', () => {
  it('代理即使直接调用检测接口也不能查看或创建贴牌检测批次', async () => {
    const service = new DoubaoCheckService({} as never, {} as never, {} as never)
    const agent = { userId: 'agent-user', tenantId: 'agent-1', username: 'agent001', role: UserRole.AGENT_ADMIN, status: AccountStatus.ACTIVE }

    await expect(service.list(agent)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) })
    await expect(service.create(agent, { merchantId: 'merchant-1' }, 'agent-check-001')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) })
    await expect(service.listFailures(agent, 'batch-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) })
    await expect(service.retryFailures(agent, 'batch-1', 'agent-retry-001')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FORBIDDEN' }) })
  })

  it('只复制失败问题词创建重试批次，并跳过没有问题 ID 的历史失败记录', async () => {
    const at = new Date('2026-08-08T02:00:00.000Z')
    const original = { id: 'batch-original', whiteLabelId: 'white-1', scope: DoubaoCheckBatchScope.ALL_MERCHANTS, status: DoubaoCheckBatchStatus.PARTIALLY_FAILED, providerConfigId: 'old-provider', providerAlias: '旧检测模型', providerModel: 'old-model', targetMerchantCount: 2, totalCount: 3, completedCount: 3, successfulCount: 1, failedCount: 2, matchedCount: 0, failureReason: null, createdAt: at, startedAt: at, completedAt: at }
    const created = { ...original, id: 'batch-retry', providerConfigId: 'provider-current', providerAlias: '当前检测模型', providerModel: 'current-model', status: DoubaoCheckBatchStatus.QUEUED, totalCount: 2, targetMerchantCount: 1, completedCount: 0, successfulCount: 0, failedCount: 0, createdAt: at, startedAt: null, completedAt: null }
    const createMany = vi.fn(async () => ({ count: 2 }))
    const enqueue = vi.fn(async () => undefined)
    const prisma = {
      doubaoCheckBatch: { findFirst: vi.fn(async () => original) },
      doubaoCheckResult: { findMany: vi.fn(async () => [{ tenantId: 'merchant-1', questionId: 'question-1', question: '测试企业服务怎么样？' }, { tenantId: 'merchant-1', questionId: 'question-2', question: '测试企业价格如何？' }, { tenantId: 'merchant-1', questionId: null, question: '历史记录' }]) },
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        doubaoCheckBatch: { findUnique: async () => null, create: async () => created },
        doubaoCheckResult: { count: async () => 0, createMany },
        auditLog: { create: async () => ({}) },
      }),
    }
    const provider = { available: vi.fn(async () => ({ id: 'provider-current', alias: '当前检测模型', modelName: 'current-model' })) }
    const service = new DoubaoCheckService(prisma as never, { enqueue } as never, provider as never)
    const actor = { userId: 'white-user', tenantId: 'white-1', username: 'tenant001', role: UserRole.WHITE_LABEL_ADMIN, status: AccountStatus.ACTIVE }

    await expect(service.retryFailures(actor, original.id, 'retry-failures-001')).resolves.toMatchObject({ id: created.id, totalCount: 2, providerAlias: '当前检测模型' })
    expect(createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ questionId: 'question-1' }), expect.objectContaining({ questionId: 'question-2' })]) })
    expect(enqueue).toHaveBeenCalledWith(created.id)
  })

  it('接管中断后仍为 RUNNING 的批次和结果，不会将未完成结果误标为成功', async () => {
    const batch = {
      id: 'batch-running',
      whiteLabelId: 'white-1',
      scope: DoubaoCheckBatchScope.SINGLE_MERCHANT,
      status: DoubaoCheckBatchStatus.RUNNING,
      providerConfigId: 'provider-1',
      providerAlias: '豆包检测',
      providerModel: 'doubao-seed',
      targetMerchantCount: 1,
      totalCount: 1,
      completedCount: 0,
      successfulCount: 0,
      failedCount: 0,
      matchedCount: 0,
      failureReason: null,
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
    }
    const row = { id: 'result-running', questionId: 'question-1', question: '测试企业服务怎么样？', apiStatus: DoubaoApiStatus.RUNNING, tenant: { name: '测试企业', profile: { companyName: '测试企业', aliases: [] } } }
    const batchUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => applyUpdate(batch, data))
    const resultUpdate = vi.fn(async () => ({}))
    const findMany = vi.fn(async () => [row])
    const prisma = {
      doubaoCheckBatch: { findUnique: vi.fn(async () => batch), updateMany: vi.fn(async () => ({ count: 0 })), update: batchUpdate },
      doubaoCheckResult: { findMany, update: resultUpdate },
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        doubaoCheckResult: { update: resultUpdate },
        question: { update: async () => ({}) },
        doubaoCheckBatch: { update: batchUpdate },
      }),
    }
    const provider = { search: vi.fn(async () => ({ answer: '测试企业提供企业服务', sources: [{ title: '验证来源', url: 'https://example.com/' }] })) }
    const service = new DoubaoCheckService(prisma as never, {} as never, provider as never)

    await service.execute(batch.id)

    expect(prisma.doubaoCheckBatch.updateMany).not.toHaveBeenCalled()
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { batchId: batch.id, apiStatus: { in: [DoubaoApiStatus.PENDING, DoubaoApiStatus.RUNNING] } } }))
    expect(provider.search).toHaveBeenCalledTimes(1)
    expect(resultUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sources: [{ title: '验证来源', url: 'https://example.com/' }] }) }))
    expect(batch).toMatchObject({ completedCount: 1, successfulCount: 1, matchedCount: 1, status: DoubaoCheckBatchStatus.SUCCEEDED })
  })
})
