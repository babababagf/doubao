import { describe, expect, it, vi } from 'vitest'

import { AiTaskStatus, AiTaskType, ArticleSource, ArticleStatus, UserRole } from '../generated/prisma/client'
import { AiTaskService } from './ai-task.service'

describe('AiTaskService Worker 重试', () => {
  it('接管中断后仍为 RUNNING 的问题词任务，并在失败时释放预占额度', async () => {
    const task = {
      id: 'task-running',
      tenantId: 'merchant-1',
      type: AiTaskType.QUESTION_EXPANSION,
      status: AiTaskStatus.RUNNING,
      request: { keywordId: 'keyword-1', keywordName: '企业服务', companyName: '测试企业', aliases: [], industry: '服务业', coreBusiness: '企业服务', count: 1 },
      totalCount: 1,
      completedCount: 0,
      failedCount: 0,
      computePointsReserved: 1,
      writingReserved: 0,
      failureReason: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
    }
    const taskUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(task, data)
      return task
    })
    const taskUpdateMany = vi.fn(async () => ({ count: task.status === AiTaskStatus.RUNNING ? 1 : 0 }))
    const quotaUpdate = vi.fn(async () => ({}))
    const auditCreate = vi.fn(async () => ({}))
    const prisma = {
      aiGenerationTask: {
        findUnique: vi.fn(async () => task),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: taskUpdate,
      },
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        aiGenerationTask: { findUnique: async () => task, update: taskUpdate, updateMany: taskUpdateMany },
        quotaBalance: { update: quotaUpdate },
        auditLog: { create: auditCreate },
      }),
    }
    const provider = { expandQuestions: vi.fn(async () => { throw new Error('provider interrupted') }) }
    const service = new AiTaskService(prisma as never, {} as never, provider as never)

    await service.execute(task.id)

    expect(provider.expandQuestions).toHaveBeenCalledTimes(1)
    expect(taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: task.id, status: AiTaskStatus.RUNNING } }))
    expect(task).toMatchObject({ status: AiTaskStatus.FAILED, computePointsReserved: 0, writingReserved: 0 })
    expect(quotaUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'merchant-1' } }))
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'ai_task.reservation_released' }) }))
  })

  it('为失败任务中的单个未生成问题创建可追溯的新重试任务并重新预占额度', async () => {
    const actor = { userId: 'merchant-user', tenantId: 'merchant-1', username: 'merchant001', role: UserRole.MERCHANT, status: 'ACTIVE' } as never
    const request = { keywordId: 'keyword-1', keywordName: '企业服务', knowledgeLibraryId: 'library-1', knowledgeName: '企业资料', knowledgeContent: '真实企业资料', galleryId: 'gallery-1', galleryImageIds: ['image-1'], imageCount: 1, instructionId: null, instruction: '保持真实', contentDirection: 'mixed', companyName: '测试企业', aliases: [], industry: '服务业', coreBusiness: '企业服务', introduction: '企业简介', questions: [{ id: 'question-1', text: '测试企业服务怎么样？', contentDirection: 'marketing' }, { id: 'question-2', text: '测试企业如何联系？', contentDirection: 'qa' }] }
    const original = { id: 'failed-task', tenantId: 'merchant-1', type: AiTaskType.ARTICLE_WRITING, status: AiTaskStatus.FAILED, request, totalCount: 2, completedCount: 1, failedCount: 1, computePointsReserved: 0, writingReserved: 0, failureReason: '模型返回格式无效', createdAt: new Date(), startedAt: new Date(), completedAt: new Date() }
    let createdInput: { request?: unknown; totalCount?: number; computePointsReserved?: number; writingReserved?: number } | null = null
    const queue = { enqueue: vi.fn(async () => undefined) }
    const prisma = {
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        aiGenerationTask: {
          findUnique: async () => null,
          findFirst: async () => original,
          create: async ({ data }: { data: { request: unknown; totalCount: number; computePointsReserved: number; writingReserved: number } }) => {
            createdInput = data
            return { ...original, id: 'retry-task', status: AiTaskStatus.QUEUED, request: data.request, totalCount: data.totalCount, completedCount: 0, failedCount: 0, computePointsReserved: data.computePointsReserved, writingReserved: data.writingReserved, failureReason: null, startedAt: null, completedAt: null }
          },
        },
        question: { findMany: async () => [{ id: 'question-1', text: '测试企业服务怎么样？' }] },
        quotaBalance: { findUnique: async () => ({ computePointsAvailable: 100, computePointsReserved: 0, writingLimit: 10, writingUsed: 0, writingReserved: 0 }), update: async () => ({}) },
        auditLog: { create: async () => ({}) },
      }),
    }
    const service = new AiTaskService(prisma as never, queue as never, {} as never)

    const result = await service.retryArticleTask(actor, original.id, { questionId: 'question-1' }, 'retry-key-1')

    expect(queue.enqueue).toHaveBeenCalledWith('retry-task')
    expect(createdInput).toMatchObject({ totalCount: 1, computePointsReserved: 30, writingReserved: 1, request: expect.objectContaining({ retryOfTaskId: original.id, questions: [{ id: 'question-1', text: '测试企业服务怎么样？' }] }) })
    expect(result).toMatchObject({ id: 'retry-task', retryOfTaskId: original.id, totalCount: 1 })
  })

  it('遇到序列化冲突会重试，部分完成后停止只释放尚未使用的预占额度', async () => {
    const actor = { userId: 'merchant-user', tenantId: 'merchant-1', username: 'merchant001', role: UserRole.MERCHANT, status: 'ACTIVE' } as never
    const task = { id: 'running-article', tenantId: 'merchant-1', type: AiTaskType.ARTICLE_WRITING, status: AiTaskStatus.RUNNING, request: { questions: [{ id: 'question-1', text: '测试问题' }] }, totalCount: 2, completedCount: 1, failedCount: 0, computePointsReserved: 60, writingReserved: 2, failureReason: null, createdAt: new Date(), startedAt: new Date(), completedAt: null }
    const quotaUpdate = vi.fn(async () => ({}))
    const directUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(task, data); return task })
    const stopUpdateMany = vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(task, data); return { count: 1 } })
    let transactionAttempt = 0
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      transactionAttempt += 1
      if (transactionAttempt === 1) throw { code: 'P2034' }
      return work({
        aiGenerationTask: { findFirst: async () => task, findUnique: async () => task, update: directUpdate, updateMany: stopUpdateMany },
        quotaBalance: { update: quotaUpdate },
        auditLog: { create: async () => ({}) },
      })
    })
    const prisma = {
      $transaction: transaction,
    }
    const service = new AiTaskService(prisma as never, {} as never, {} as never)

    await service.stop(actor, task.id)
    await service.stop(actor, task.id)

    expect(quotaUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { computePointsReserved: { decrement: 30 }, writingReserved: { decrement: 1 } } }))
    expect(quotaUpdate).toHaveBeenCalledTimes(1)
    expect(stopUpdateMany).toHaveBeenCalledTimes(1)
    expect(transaction).toHaveBeenCalledTimes(3)
    expect(task).toMatchObject({ status: AiTaskStatus.STOPPED, computePointsReserved: 0, writingReserved: 0 })
  })

  it('模型返回前任务已停止时，不再写入文章、扣费或覆盖停止终态', async () => {
    const task = {
      id: 'stopped-during-provider', tenantId: 'merchant-1', type: AiTaskType.ARTICLE_WRITING, status: AiTaskStatus.RUNNING as AiTaskStatus,
      request: { keywordId: 'keyword-1', keywordName: '企业服务', knowledgeLibraryId: 'library-1', knowledgeName: '企业资料', knowledgeContent: '真实企业资料', galleryId: 'gallery-1', galleryImageIds: ['image-1'], imageCount: 1, instructionId: null, instruction: '保持真实', contentDirection: 'mixed', companyName: '测试企业', aliases: [], industry: '服务业', coreBusiness: '企业服务', introduction: '企业简介', questions: [{ id: 'question-1', text: '测试企业服务怎么样？', contentDirection: 'marketing' }] },
      totalCount: 1, completedCount: 0, failedCount: 0, computePointsReserved: 0, writingReserved: 0,
      failureReason: '由商户停止', startedAt: new Date(), completedAt: new Date(), createdAt: new Date(),
    }
    const articleCreate = vi.fn(async () => ({ id: 'article-1' }))
    const quotaUpdate = vi.fn(async () => ({}))
    const taskUpdateMany = vi.fn(async () => ({ count: task.status === AiTaskStatus.RUNNING ? 1 : 0 }))
    const prisma = {
      aiGenerationTask: {
        findUnique: vi.fn(async () => task),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        aiGenerationTask: { findUnique: async () => task, updateMany: taskUpdateMany, update: vi.fn() },
        article: { create: articleCreate, findUnique: vi.fn(async () => null) },
        articleVersion: { create: vi.fn() },
        question: { findFirst: vi.fn(), update: vi.fn() },
        quotaBalance: { update: quotaUpdate },
        entitlementLedger: { createMany: vi.fn() },
        auditLog: { create: vi.fn() },
      }),
    }
    const provider = {
      writeArticle: vi.fn(async () => {
        task.status = AiTaskStatus.STOPPED
        return { title: '测试文章', content: '这是一篇长度足够且保持真实准确的企业服务测试文章正文。' }
      }),
    }
    const service = new AiTaskService(prisma as never, {} as never, provider as never)

    await service.execute(task.id)

    expect(provider.writeArticle).toHaveBeenCalledTimes(1)
    expect(provider.writeArticle).toHaveBeenCalledWith(task.tenantId, expect.objectContaining({ contentDirection: 'marketing', factMode: 'enriched' }))
    expect(taskUpdateMany).toHaveBeenCalled()
    expect(articleCreate).not.toHaveBeenCalled()
    expect(quotaUpdate).not.toHaveBeenCalled()
    expect(task.status).toBe(AiTaskStatus.STOPPED)
  })

  it('DeepSeek 成功返回可入库文章后直接以可发布状态入库并生成一致版本快照', async () => {
    const task = {
      id: 'article-task-1', tenantId: 'merchant-1', type: AiTaskType.ARTICLE_WRITING, status: AiTaskStatus.RUNNING,
      request: { keywordId: 'keyword-1', knowledgeLibraryId: null, galleryId: null, galleryImageIds: [], imageCount: 0, instructionId: null },
    }
    const articleCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'article-1', currentVersion: 1, ...data,
    }))
    const versionCreate = vi.fn(async () => ({}))
    const prisma = {
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        aiGenerationTask: {
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => task,
          update: async () => ({}),
        },
        article: { findUnique: async () => null, create: articleCreate },
        articleVersion: { create: versionCreate },
        question: {
          findFirst: async () => ({ id: 'question-1', tenantId: task.tenantId }),
          update: async () => ({}),
        },
        quotaBalance: { update: async () => ({}) },
        entitlementLedger: { createMany: async () => ({ count: 2 }) },
      }),
    }
    const service = new AiTaskService(prisma as never, {} as never, {} as never)

    await (service as unknown as { commitArticle: (taskId: string, question: { id: string; text: string }, generated: { title: string; content: string }) => Promise<void> }).commitArticle(
      task.id,
      { id: 'question-1', text: '西安铜锅涮肉怎么选？' },
      { title: '2026年西安铜锅涮肉怎么选？从食材到锅底看关键标准', content: '这是一篇通过标题、正文结构和基础内容质量校验的文章正文，成功后应直接进入可发布文章列表。' },
    )

    expect(articleCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ source: ArticleSource.AI_GENERATED, status: ArticleStatus.PUBLISHABLE }) })
    expect(versionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: ArticleStatus.PUBLISHABLE }) })
  })

  it('仅关键词时允许无信息库、无图库、零配图创建基础写作输入', () => {
    const service = new AiTaskService({} as never, {} as never, {} as never)
    const articleInput = (service as unknown as { articleInput: (input: Record<string, unknown>) => Record<string, unknown> }).articleInput({
      keywordId: 'keyword-1', knowledgeLibraryId: null, galleryId: null, imageCount: 0, instructionId: null, contentDirection: 'marketing', count: 3,
    })

    expect(articleInput).toEqual({ keywordId: 'keyword-1', knowledgeLibraryId: null, galleryId: null, imageCount: 0, instructionId: null, contentDirection: 'marketing', count: 3 })
  })

  it('基础写作任务快照不查询缺失的信息库和图库', async () => {
    const knowledgeFind = vi.fn()
    const galleryFind = vi.fn()
    const service = new AiTaskService({} as never, {} as never, {} as never)
    const articleSnapshot = (service as unknown as { articleSnapshot: (tx: unknown, tenantId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>> }).articleSnapshot
    const snapshot = await articleSnapshot.call(service, {
      keyword: { findFirst: async () => ({ id: 'keyword-1', name: '西安铜锅涮肉' }) },
      knowledgeLibrary: { findFirst: knowledgeFind },
      gallery: { findFirst: galleryFind },
      tenant: { findUnique: async () => ({ name: '星术涮肉' }) },
      writingInstruction: { findFirst: vi.fn() },
      question: { findMany: async () => [{ id: 'question-1', text: '西安铜锅涮肉怎么选？' }] },
    }, 'merchant-1', { keywordId: 'keyword-1', knowledgeLibraryId: null, galleryId: null, imageCount: 0, instructionId: null, contentDirection: 'marketing', count: 1 })

    expect(knowledgeFind).not.toHaveBeenCalled()
    expect(galleryFind).not.toHaveBeenCalled()
    expect(snapshot).toMatchObject({ factMode: 'basic', knowledgeLibraryId: null, knowledgeContent: '', galleryId: null, galleryImageIds: [], imageCount: 0, companyName: '星术涮肉' })
    expect(snapshot.instruction).toContain('西安铜锅涮肉')
    expect(snapshot.instruction).toContain('星术涮肉 2-3 次')
    expect(snapshot.instruction).toContain('2-3 个模糊化处理的数据支撑点')
    expect(snapshot.instruction).not.toContain('{训练词占位符}')
    expect(snapshot.instruction).not.toContain('{转化词占位符}')
  })

  it('选中企业信息库时只使用信息库的企业与业务资料', async () => {
    const service = new AiTaskService({} as never, {} as never, {} as never)
    const articleSnapshot = (service as unknown as { articleSnapshot: (tx: unknown, tenantId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>> }).articleSnapshot
    const snapshot = await articleSnapshot.call(service, {
      keyword: { findFirst: async () => ({ id: 'keyword-1', name: '西安铜锅涮肉' }) },
      knowledgeLibrary: { findFirst: async () => ({
        id: 'library-1',
        name: '星术涮肉资料',
        companyName: '西安星术涮肉餐饮管理有限公司',
        brandAlias: '星术涮肉',
        productServices: '铜锅涮肉与门店堂食',
        brandStory: '专注本地铜锅涮肉',
        content: '公司名称：西安星术涮肉餐饮管理有限公司\n\n品牌简称：星术涮肉\n\n产品服务：铜锅涮肉与门店堂食',
      }) },
      gallery: { findFirst: vi.fn() },
      tenant: { findUnique: async () => ({ name: '账户默认公司名' }) },
      writingInstruction: { findFirst: vi.fn() },
      question: { findMany: async () => [{ id: 'question-1', text: '西安铜锅涮肉怎么选？' }] },
    }, 'merchant-1', { keywordId: 'keyword-1', knowledgeLibraryId: 'library-1', galleryId: null, imageCount: 0, instructionId: null, contentDirection: 'marketing', count: 1 })

    expect(snapshot).toMatchObject({
      factMode: 'enriched',
      companyName: '西安星术涮肉餐饮管理有限公司',
      aliases: ['星术涮肉'],
      coreBusiness: '铜锅涮肉与门店堂食',
      introduction: '专注本地铜锅涮肉',
    })
    expect(snapshot.instruction).toContain('西安星术涮肉餐饮管理有限公司 2-3 次')
    expect(snapshot.instruction).not.toContain('账户默认公司名')
  })
})
