import { describe, expect, it } from 'vitest'

import { ArticleSource, ArticleStatus, MediaAccountStatus, MediaPlatform, WebsiteStatus, WebsiteTemplate } from '../generated/prisma/client'
import { MerchantContentService } from './merchant-content.service'

describe('MerchantContentService 发布任务版本快照', () => {
  it('批量组合问题词只保存完整包含主关键词的去重结果', async () => {
    const saved: Array<Record<string, unknown>> = []
    const tx = {
      question: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { saved.push(...data); return { count: data.length } } },
      auditLog: { create: async () => ({}) },
    }
    const prisma = {
      keyword: { findFirst: async () => ({ id: 'keyword-1', name: '西安铜锅涮肉' }) },
      $transaction: async (work: (inner: typeof tx) => Promise<unknown>) => work(tx),
    }
    const service = new MerchantContentService(prisma as never, null as never, null as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' } as const

    await expect(service.createQuestionsBatch(actor, 'keyword-1', { texts: ['推荐西安铜锅涮肉哪家好', '靠谱的西安铜锅涮肉公司'] })).resolves.toEqual({ createdCount: 2, skippedDuplicateCount: 0 })
    expect(saved).toEqual([
      expect.objectContaining({ keywordId: 'keyword-1', text: '推荐西安铜锅涮肉哪家好' }),
      expect.objectContaining({ keywordId: 'keyword-1', text: '靠谱的西安铜锅涮肉公司' }),
    ])
    await expect(service.createQuestionsBatch(actor, 'keyword-1', { texts: ['推荐其他火锅公司'] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'QUESTION_BATCH_INPUT_INVALID' }) })
  })

  it('企业信息库按结构化字段保存，并生成供 AI 使用的资料正文', async () => {
    const created: Array<Record<string, unknown>> = []
    const prisma = {
      knowledgeLibrary: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data)
          return { id: 'library-1', ...data, deletedAt: null, createdAt: new Date('2026-08-10T10:00:00.000Z'), updatedAt: new Date('2026-08-10T10:00:00.000Z') }
        },
      },
    }
    const service = new MerchantContentService(prisma as never, null as never, null as never)
    const result = await service.createKnowledge(
      { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' },
      { name: '品牌资料', companyName: '测试企业有限公司', brandAlias: '测试品牌', productServices: '提供企业内容策划和网站建设服务。', productFeatures: '', brandStory: '', userPainPoints: '', trustProof: '拥有标准化交付流程。', customerCases: '', otherInfo: '' },
    ) as Record<string, unknown>

    expect(created[0]).toEqual(expect.objectContaining({ companyName: '测试企业有限公司', brandAlias: '测试品牌', productServices: '提供企业内容策划和网站建设服务。' }))
    expect(created[0]?.content).toContain('公司名称：测试企业有限公司')
    expect(created[0]?.content).toContain('产品服务：提供企业内容策划和网站建设服务。')
    expect(result).toEqual(expect.objectContaining({ name: '品牌资料', companyName: '测试企业有限公司', trustProof: '拥有标准化交付流程。' }))
    expect(result).not.toHaveProperty('content')
    expect(result).not.toHaveProperty('category')
  })

  it('企业信息库至少需要填写一项资料内容', async () => {
    const service = new MerchantContentService({ knowledgeLibrary: { create: async () => { throw new Error('不应写入') } } } as never, null as never, null as never)
    await expect(service.createKnowledge(
      { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' },
      { name: '空资料', companyName: '测试企业有限公司', brandAlias: '测试品牌', productServices: '', productFeatures: '', brandStory: '', userPainPoints: '', trustProof: '', customerCases: '', otherInfo: '' },
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'KNOWLEDGE_LIBRARY_INPUT_INVALID' }) })
  })

  it('手动文章只保存当前商户图库中的最多三张图片并建立版本快照', async () => {
    const snapshots: Array<Record<string, unknown>> = []
    const tx = {
      gallery: { findFirst: async () => ({ id: 'gallery-1' }) },
      galleryImage: { count: async () => 2 },
      article: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'article-manual-1',
          ...data,
          keywordId: null,
          questionId: null,
          knowledgeLibraryIds: [],
          instructionId: null,
          currentVersion: 1,
          deletedAt: null,
          createdAt: new Date('2026-08-10T10:00:00.000Z'),
          updatedAt: new Date('2026-08-10T10:00:00.000Z'),
        }),
      },
      articleVersion: { create: async ({ data }: { data: Record<string, unknown> }) => { snapshots.push(data); return data } },
    }
    const prisma = { $transaction: async (work: (inner: typeof tx) => Promise<unknown>) => work(tx) }
    const service = new MerchantContentService(prisma as never, null as never, null as never)

    const result = await service.createArticle(
      { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' },
      { title: '带图库素材的手动文章', content: '<p>这是一篇用于验证文章图片归属和版本快照的正文内容，长度已经满足保存要求。</p>', status: 'publishable', galleryId: 'gallery-1', galleryImageIds: ['image-1', 'image-2'] },
    ) as Record<string, unknown>

    expect(result).toEqual(expect.objectContaining({ source: 'manual', galleryId: 'gallery-1', imageCount: 2, galleryImageIds: ['image-1', 'image-2'], currentVersion: 1 }))
    expect(snapshots).toEqual([expect.objectContaining({ galleryId: 'gallery-1', imageCount: 2, galleryImageIds: ['image-1', 'image-2'] })])
  })

  it('编辑 AI 文章时保留原始来源，只更新正文、状态和配图版本', async () => {
    const updates: Array<Record<string, unknown>> = []
    const existing = {
      id: 'article-ai-1', tenantId: 'merchant-1', title: '原始标题', content: '<p>原始正文内容已经超过二十个字符，用于测试。</p>', source: ArticleSource.AI_GENERATED,
      status: ArticleStatus.PUBLISHABLE, keywordId: 'keyword-1', questionId: 'question-1', knowledgeLibraryIds: [], galleryId: null, imageCount: 0,
      galleryImageIds: [], instructionId: null, currentVersion: 1, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    }
    const tx = {
      gallery: { findFirst: async () => ({ id: 'gallery-1' }) },
      galleryImage: { count: async () => 1 },
      article: {
        findFirst: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data)
          return { ...existing, ...data, currentVersion: 2, updatedAt: new Date() }
        },
      },
      articleVersion: { create: async ({ data }: { data: Record<string, unknown> }) => data },
    }
    const prisma = { $transaction: async (work: (inner: typeof tx) => Promise<unknown>) => work(tx) }
    const service = new MerchantContentService(prisma as never, null as never, null as never)

    const result = await service.updateArticle(
      { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' },
      existing.id,
      { title: '编辑后的 AI 文章标题', content: '<h2>新的小标题</h2><p>编辑后的正文仍然保留 AI 生成来源，同时固定新的图库素材。</p>', status: 'publishable', galleryId: 'gallery-1', galleryImageIds: ['image-1'] },
    ) as Record<string, unknown>

    expect(updates[0]).not.toHaveProperty('source')
    expect(result).toEqual(expect.objectContaining({ source: 'ai_generated', currentVersion: 2, galleryImageIds: ['image-1'] }))
  })

  it('控制台只按每个问题最新一次成功检测计算豆包收录数', async () => {
    const recentMatched = new Date()
    recentMatched.setUTCDate(recentMatched.getUTCDate() - 1)
    const recentUnmatched = new Date()
    const oldMatched = new Date()
    oldMatched.setUTCDate(oldMatched.getUTCDate() - 31)
    const quota = { keywordLimit: 50, computePointsAvailable: 1000, computePointsConsumed: 30, writingUsed: 1, writingLimit: 100, imageStorageBytes: 0, updatedAt: new Date('2026-08-08T00:00:00.000Z') }
    const prisma = {
      quotaBalance: { findUnique: async () => quota },
      keyword: { count: async () => 1 },
      question: { count: async () => 2 },
      article: { count: async () => 3 },
      publishTask: { count: async () => 4, findMany: async () => [] },
      doubaoCheckResult: {
        findMany: async () => [
          { id: 'result-new-unmatched', questionId: 'question-1', matched: false, checkedAt: recentUnmatched },
          { id: 'result-new-matched', questionId: 'question-2', matched: true, checkedAt: recentMatched },
          { id: 'result-old-matched', questionId: 'question-3', matched: true, checkedAt: oldMatched },
        ],
      },
      websiteMetricDaily: { aggregate: async () => ({ _sum: { phoneExposureCount: 2, phoneClickCount: 1 } }) },
    }
    const storage = { merchantStorageAvailable: async () => true }
    const service = new MerchantContentService(prisma as never, storage as never, null as never)

    await expect(service.getDashboard({ userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' })).resolves.toEqual(expect.objectContaining({
      effects: expect.objectContaining({ questionTotal: 2, doubaoIncludedCount: 2 }),
      resources: expect.objectContaining({ imageStorage: expect.objectContaining({ available: true, usedBytes: 0, formatted: '0 B' }) }),
      inclusionTrend: [{ date: recentMatched.toISOString().slice(0, 10), includedCount: 1 }],
      lastCheckedAt: recentUnmatched.toISOString(),
    }))
  })

  it('豆包检测结果只返回已保存的来源数组，历史空值安全回退为空数组', async () => {
    const prisma = {
      doubaoCheckResult: {
        findMany: async () => [
          { id: 'result-1', question: '测试企业提供什么服务？', answer: '测试企业提供企业服务。', sources: [{ title: '验证来源', url: 'https://example.com/reference' }], matched: true, matchedName: '测试企业', checkedAt: new Date('2026-08-08T00:00:00.000Z'), apiStatus: 'SUCCEEDED', failureReason: null },
          { id: 'result-2', question: '历史问题', answer: '', sources: null, matched: false, matchedName: null, checkedAt: null, apiStatus: 'FAILED', failureReason: '检测失败' },
        ],
      },
    }
    const service = new MerchantContentService(prisma as never, null as never, null as never)

    await expect(service.listDoubaoResults({ userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' })).resolves.toEqual([
      expect.objectContaining({ id: 'result-1', sources: [{ title: '验证来源', url: 'https://example.com/reference' }], apiStatus: 'succeeded' }),
      expect.objectContaining({ id: 'result-2', sources: [], apiStatus: 'failed' }),
    ])
  })

  it('读取已生成网站时返回固定的企业资料版本', async () => {
    const upsert = async (input: { include?: { profileVersion?: { select?: { version?: boolean } } } }) => {
      expect(input.include).toEqual({ profileVersion: { select: { version: true } } })
      return { template: WebsiteTemplate.BRAND_CONTENT, hostname: null, status: WebsiteStatus.LOCAL_READY, lastGeneratedAt: new Date('2026-08-07T12:00:00.000Z'), version: 3, profileVersion: { version: 7 } }
    }
    const service = new MerchantContentService({ merchantWebsite: { upsert } } as never, null as never, { previewUrl: () => '/api/public/sites/merchant-1/index.html' } as never)

    await expect(service.getWebsite({ userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' })).resolves.toEqual(expect.objectContaining({ template: 'brand_content', profileVersion: 7, previewUrl: '/api/public/sites/merchant-1/index.html' }))
  })

  it('媒体账号列表只暴露加密会话备份状态，不返回会话内容', async () => {
    const capturedAt = new Date('2026-08-08T01:02:03.000Z')
    const prisma = { mediaAccount: { findMany: async () => [{ id: 'media-1', platform: MediaPlatform.TOUTIAO, status: MediaAccountStatus.CONNECTED, maskedName: '头条主号', localReferenceId: 'ref-1', lastVerifiedAt: capturedAt, lastHeartbeatAt: capturedAt, failureReason: null, sessionBackup: { capturedAt, revokedAt: null } }] } }
    const service = new MerchantContentService(prisma as never, null as never, null as never)

    const rows = await service.listMediaAccounts({ userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' }) as Array<Record<string, unknown>>
    expect(rows[0]).toEqual(expect.objectContaining({ id: 'media-1', backupAvailable: true, backupCapturedAt: capturedAt.toISOString() }))
    expect(rows[0]).not.toHaveProperty('sessionBackup')
    expect(rows).toContainEqual(expect.objectContaining({ platform: 'douyin', status: 'unbound', backupAvailable: false, backupCapturedAt: null }))
  })

  it.each([ArticleStatus.DRAFT, ArticleStatus.PENDING_REVIEW, ArticleStatus.DISABLED])('拒绝非可发布文章：%s', async (status) => {
    const article = { id: 'article-1', tenantId: 'merchant-1', currentVersion: 1, title: '待审核文章', content: '文章正文不少于二十个字符，用于测试发布校验。', source: ArticleSource.MANUAL, status, keywordId: null, knowledgeLibraryIds: [], galleryId: null, imageCount: 0, instructionId: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), questionId: null }
    const tx = {
      publishBatch: { findUnique: async () => null },
      article: { findMany: async () => [article] },
      articleVersion: { findMany: async () => { throw new Error('不应读取版本快照') } },
      publishTask: { create: async () => { throw new Error('不应创建发布任务') } },
    }
    const prisma = { $transaction: async (work: (inner: typeof tx) => Promise<unknown>) => work(tx) }
    const service = new MerchantContentService(prisma as never, null as never, null as never)

    await expect(service.createPublishTasks(
      { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' },
      { articleIds: [article.id], platforms: ['toutiao'], mediaAccountIds: ['media-1'], publishCount: 1, deduplicationMode: 'per_platform', dailyLimits: { toutiao: 3, douyin: 3 } },
      'test-draft-article',
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ARTICLE_NOT_PUBLISHABLE' }) })
  })

  it('创建任务时固定引用文章当前版本，而不是只保存文章 ID', async () => {
    const createdRows: Array<Record<string, unknown>> = []
    const article = {
      id: 'article-1', tenantId: 'merchant-1', currentVersion: 3, title: '最新文章标题', content: '文章正文不少于二十个字符，用于测试发布快照。',
      source: ArticleSource.MANUAL, status: ArticleStatus.PUBLISHABLE, keywordId: null, knowledgeLibraryIds: [], galleryId: null, imageCount: 0, instructionId: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), questionId: null,
    }
    const snapshot = { id: 'article-version-3', articleId: article.id, tenantId: article.tenantId, version: 3, title: article.title, content: article.content, source: article.source, status: article.status, knowledgeLibraryIds: [], galleryId: null, imageCount: 0, galleryImageIds: [], instructionId: null, createdAt: new Date() }
    const mediaAccount = { id: 'media-1', platform: MediaPlatform.TOUTIAO, status: MediaAccountStatus.CONNECTED, maskedName: '头条测试账号' }
    const tx = {
      publishBatch: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'batch-1', ...data, createdAt: new Date() }),
      },
      article: { findMany: async () => [article] },
      articleVersion: { findMany: async () => [snapshot] },
      mediaAccount: { findMany: async () => [mediaAccount] },
      publishTask: {
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdRows.push(data)
          return { id: 'task-1', ...data, article, articleVersion: snapshot, mediaAccount, createdAt: new Date(), updatedAt: new Date(), completedAt: null, resultUrl: null, failureReason: null }
        },
      },
    }
    const prisma = { $transaction: async (work: (inner: typeof tx) => Promise<unknown>) => work(tx) }
    const service = new MerchantContentService(prisma as never, null as never, null as never)

    const result = await service.createPublishTasks(
      { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' },
      { articleIds: [article.id], platforms: ['toutiao'], mediaAccountIds: [mediaAccount.id], publishCount: 1, deduplicationMode: 'per_platform', dailyLimits: { toutiao: 3, douyin: 3 } },
      'test-current-version',
    ) as { tasks: Array<{ articleVersion: number; articleTitle: string }> }

    expect(createdRows).toEqual([expect.objectContaining({ articleId: article.id, articleVersionId: snapshot.id, platform: MediaPlatform.TOUTIAO })])
    expect(result.tasks).toEqual([expect.objectContaining({ articleVersion: 3, articleTitle: article.title })])
  })
})
