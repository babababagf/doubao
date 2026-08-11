import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { sanitizeArticleContent } from '../content/article-sanitizer'
import { Prisma } from '../generated/prisma/client'
import {
  ArticleSource, ArticleStatus, DoubaoApiStatus, KeywordStatus, KnowledgeLibraryCategory,
  MediaAccountStatus, MediaPlatform, PublishAttentionReason, PublishDeduplicationMode, PublishTaskStatus, WebsiteStatus, WebsiteTemplate,
} from '../generated/prisma/client'
import type { MerchantActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { ObjectStorageConfigService } from '../tenancy/object-storage-config.service'
import { StaticSiteService } from '../site/static-site.service'
import { planPublishAssignments, type PublishDeduplication, type PublishPlatform } from './publish-batch-planner'

const knowledgeContentFields = [
  ['productServices', '产品服务'],
  ['productFeatures', '产品特点'],
  ['brandStory', '品牌故事'],
  ['userPainPoints', '用户痛点'],
  ['trustProof', '信任背书'],
  ['customerCases', '客户案例'],
  ['otherInfo', '其他信息'],
] as const
const templateToDb = { minimal_enterprise: WebsiteTemplate.MINIMAL_ENTERPRISE, local_store: WebsiteTemplate.LOCAL_STORE, brand_content: WebsiteTemplate.BRAND_CONTENT } as const
const resumablePublishAttentionReasons = new Set<PublishAttentionReason>([PublishAttentionReason.LOGIN_REQUIRED, PublishAttentionReason.CAPTCHA_REQUIRED])
const leaseExpiredPublishReason = '发布助手执行租约已过期，执行阶段不明，禁止自动重试，请人工核验平台作品状态'
const templateFromDb = Object.fromEntries(Object.entries(templateToDb).map(([key, value]) => [value, key])) as Record<WebsiteTemplate, string>
const mediaToDb = { toutiao: MediaPlatform.TOUTIAO, douyin: MediaPlatform.DOUYIN } as const
const mediaFromDb = Object.fromEntries(Object.entries(mediaToDb).map(([key, value]) => [value, key])) as Record<MediaPlatform, 'toutiao' | 'douyin'>
type PublishTaskWithContext = Prisma.PublishTaskGetPayload<{ include: { article: true; articleVersion: true; mediaAccount: true } }>
type PublishBatchWithTasks = Prisma.PublishBatchGetPayload<{ include: { tasks: { include: { article: true; articleVersion: true; mediaAccount: true } } } }>

function normalize(value: string): string { return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN') }
function requireText(input: unknown, min: number, max: number): string | null {
  return typeof input === 'string' && input.trim().length >= min && input.trim().length <= max ? input.trim() : null
}
function optionalText(input: unknown, max: number): string | null {
  return typeof input === 'string' && input.trim().length <= max ? input.trim() : null
}
function apiConflict(code: string, message: string): ConflictException { return new ConflictException({ code, message }) }
function formatBytes(bytes: number): string { return bytes === 0 ? '0 B' : `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function inclusionTrendStart(now = new Date()): Date {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - 29)
  return start
}

@Injectable()
export class MerchantContentService {
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageConfigService, private readonly sites: StaticSiteService) {}

  async getDashboard(actor: MerchantActor): Promise<object> {
    const [quota, keywordCount, questionTotal, articleCount, publishedCount, tasks, doubaoResults, phoneMetrics, imageStorageAvailable] = await Promise.all([
      this.prisma.quotaBalance.findUnique({ where: { tenantId: actor.tenantId } }),
      this.prisma.keyword.count({ where: { tenantId: actor.tenantId, deletedAt: null } }),
      this.prisma.question.count({ where: { tenantId: actor.tenantId, deletedAt: null } }),
      this.prisma.article.count({ where: { tenantId: actor.tenantId, deletedAt: null } }),
      this.prisma.publishTask.count({ where: { tenantId: actor.tenantId, status: PublishTaskStatus.SUCCEEDED } }),
      this.prisma.publishTask.findMany({ where: { tenantId: actor.tenantId }, include: { article: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.prisma.doubaoCheckResult.findMany({ where: { tenantId: actor.tenantId, apiStatus: DoubaoApiStatus.SUCCEEDED, checkedAt: { not: null } }, select: { id: true, questionId: true, matched: true, checkedAt: true }, orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.websiteMetricDaily.aggregate({ where: { tenantId: actor.tenantId }, _sum: { phoneExposureCount: true, phoneClickCount: true } }),
      this.storage.merchantStorageAvailable(actor.tenantId),
    ])
    if (!quota) throw new NotFoundException({ code: 'QUOTA_MISSING', message: '商户额度尚未初始化' })
    // “豆包收录数”只代表每个问题的当前成功状态。重复检测保留在明细中，不能反复累加到概览。
    const seenQuestions = new Set<string>()
    const currentDoubaoResults = doubaoResults.filter((result) => {
      const key = result.questionId ?? `legacy:${result.id}`
      if (seenQuestions.has(key)) return false
      seenQuestions.add(key)
      return true
    })
    const includedCount = currentDoubaoResults.filter((result) => result.matched).length
    const trend = new Map<string, number>()
    const trendStart = inclusionTrendStart()
    for (const result of [...currentDoubaoResults].reverse()) {
      if (!result.matched || !result.checkedAt || result.checkedAt < trendStart) continue
      const day = result.checkedAt.toISOString().slice(0, 10)
      trend.set(day, (trend.get(day) ?? 0) + 1)
    }
    return {
      resources: {
        keywords: { used: keywordCount, limit: quota.keywordLimit },
        computePoints: { available: quota.computePointsAvailable, consumedThisPeriod: quota.computePointsConsumed },
        writing: { used: quota.writingUsed, limit: quota.writingLimit }, articleCount, publishCount: publishedCount,
        imageStorage: { available: imageStorageAvailable, usedBytes: Number(quota.imageStorageBytes), formatted: formatBytes(Number(quota.imageStorageBytes)), lastCalibratedAt: quota.updatedAt.toISOString() },
      },
      effects: { questionTotal, doubaoIncludedCount: includedCount, phoneExposureCount: phoneMetrics._sum.phoneExposureCount ?? 0, phoneClickCount: phoneMetrics._sum.phoneClickCount ?? 0 },
      inclusionTrend: [...trend].map(([date, includedCount]) => ({ date, includedCount })),
      workflow: [
        { key: 'profile', label: '企业信息库（可选）', status: 'complete' },
        { key: 'questions', label: '问题词', status: questionTotal > 0 ? 'complete' : 'current' },
        { key: 'articles', label: '文章', status: articleCount > 0 ? 'complete' : questionTotal > 0 ? 'current' : 'pending' },
        { key: 'publish', label: '发布', status: publishedCount > 0 ? 'complete' : articleCount > 0 ? 'current' : 'pending' },
        { key: 'doubao', label: '豆包检测', status: currentDoubaoResults.length > 0 ? 'complete' : 'pending' },
      ],
      recentTasks: tasks.map((task) => ({ id: task.id, type: 'publish', title: `发布任务：${task.article.title}`, detail: mediaFromDb[task.platform], status: task.status.toLowerCase(), occurredAt: task.updatedAt.toISOString() })),
      lastCheckedAt: currentDoubaoResults[0]?.checkedAt?.toISOString() ?? null,
    }
  }

  async listQuestions(actor: MerchantActor, keywordId: string): Promise<object[]> {
    await this.requireKeyword(actor, keywordId)
    const questions = await this.prisma.question.findMany({ where: { tenantId: actor.tenantId, keywordId, deletedAt: null }, orderBy: { createdAt: 'desc' } })
    return questions.map((question) => this.questionDto(question))
  }
  async createQuestion(actor: MerchantActor, keywordId: string, input: unknown): Promise<object> {
    await this.requireKeyword(actor, keywordId)
    const text = requireText((input as { text?: unknown })?.text, 6, 180)
    if (!text) throw apiConflict('QUESTION_INPUT_INVALID', '问题词长度需为6至180个字符')
    try { return this.questionDto(await this.prisma.question.create({ data: { tenantId: actor.tenantId, keywordId, text, normalizedText: normalize(text) } })) }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw apiConflict('QUESTION_DUPLICATE', '同一关键词下已存在完全相同的问题词'); throw error }
  }
  async createQuestionsBatch(actor: MerchantActor, keywordId: string, input: unknown): Promise<object> {
    const keyword = await this.requireKeyword(actor, keywordId)
    const values = (input as { texts?: unknown })?.texts
    if (!Array.isArray(values) || values.length < 1 || values.length > 500 || !values.every((value) => typeof value === 'string')) throw apiConflict('QUESTION_BATCH_INPUT_INVALID', '批量问题词需为1至500条文本')
    const unique = new Map<string, string>()
    for (const value of values) {
      const text = value.trim()
      const normalizedText = normalize(text)
      if (text.length < 6 || text.length > 180 || !text.includes(keyword.name)) throw apiConflict('QUESTION_BATCH_INPUT_INVALID', `每条组合词需为6至180字，并完整包含主关键词“${keyword.name}”`)
      if (!unique.has(normalizedText)) unique.set(normalizedText, text)
    }
    const rows = [...unique].map(([normalizedText, text]) => ({ tenantId: actor.tenantId, keywordId, text, normalizedText }))
    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.question.createMany({ data: rows, skipDuplicates: true })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'question.batch.created', entityType: 'Keyword', entityId: keywordId, detail: { requestedCount: values.length, uniqueCount: rows.length, createdCount: created.count } } })
      return created
    })
    return { createdCount: result.count, skippedDuplicateCount: values.length - result.count }
  }
  async updateQuestion(actor: MerchantActor, questionId: string, input: unknown): Promise<object> {
    const status = (input as { status?: unknown })?.status
    if (status !== 'enabled' && status !== 'disabled') throw apiConflict('QUESTION_STATUS_INVALID', '问题词状态无效')
    const updated = await this.prisma.question.updateMany({ where: { id: questionId, tenantId: actor.tenantId, deletedAt: null }, data: { status: status === 'enabled' ? KeywordStatus.ENABLED : KeywordStatus.DISABLED } })
    if (!updated.count) throw this.notFound('QUESTION_NOT_FOUND', '问题词不存在或无权访问')
    const question = await this.prisma.question.findUniqueOrThrow({ where: { id: questionId } }); return this.questionDto(question)
  }
  async deleteQuestion(actor: MerchantActor, questionId: string): Promise<void> {
    const updated = await this.prisma.question.updateMany({ where: { id: questionId, tenantId: actor.tenantId, deletedAt: null }, data: { deletedAt: new Date(), status: KeywordStatus.DISABLED } })
    if (!updated.count) throw this.notFound('QUESTION_NOT_FOUND', '问题词不存在或无权访问')
  }

  async listKnowledge(actor: MerchantActor): Promise<object[]> { return (await this.prisma.knowledgeLibrary.findMany({ where: { tenantId: actor.tenantId, deletedAt: null }, orderBy: { updatedAt: 'desc' } })).map((item) => this.knowledgeDto(item)) }
  async createKnowledge(actor: MerchantActor, input: unknown): Promise<object> { const data = this.knowledgeInput(input); return this.knowledgeDto(await this.prisma.knowledgeLibrary.create({ data: { tenantId: actor.tenantId, ...data } })) }
  async updateKnowledge(actor: MerchantActor, id: string, input: unknown): Promise<object> { const data = this.knowledgeInput(input); const result = await this.prisma.knowledgeLibrary.updateMany({ where: { id, tenantId: actor.tenantId, deletedAt: null }, data }); if (!result.count) throw this.notFound('KNOWLEDGE_LIBRARY_NOT_FOUND', '信息库不存在或无权访问'); return this.knowledgeDto(await this.prisma.knowledgeLibrary.findUniqueOrThrow({ where: { id } })) }
  async deleteKnowledge(actor: MerchantActor, id: string): Promise<void> { const result = await this.prisma.knowledgeLibrary.updateMany({ where: { id, tenantId: actor.tenantId, deletedAt: null }, data: { deletedAt: new Date() } }); if (!result.count) throw this.notFound('KNOWLEDGE_LIBRARY_NOT_FOUND', '信息库不存在或无权访问') }

  async listGalleries(actor: MerchantActor): Promise<object[]> { const rows = await this.prisma.gallery.findMany({ where: { tenantId: actor.tenantId, deletedAt: null }, include: { images: { where: { deletedAt: null }, select: { id: true } } }, orderBy: { updatedAt: 'desc' } }); return rows.map((row) => ({ id: row.id, name: row.name, description: row.description, imageCount: row.images.length, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) }
  async createGallery(actor: MerchantActor, input: unknown): Promise<object> { const data = this.galleryInput(input); const row = await this.prisma.gallery.create({ data: { tenantId: actor.tenantId, ...data } }); return { id: row.id, ...data, imageCount: 0, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } }
  async updateGallery(actor: MerchantActor, id: string, input: unknown): Promise<object> { const data = this.galleryInput(input); const result = await this.prisma.gallery.updateMany({ where: { id, tenantId: actor.tenantId, deletedAt: null }, data }); if (!result.count) throw this.notFound('GALLERY_NOT_FOUND', '图库不存在或无权访问'); const row = await this.prisma.gallery.findUniqueOrThrow({ where: { id }, include: { images: { where: { deletedAt: null }, select: { id: true } } } }); return { id: row.id, name: row.name, description: row.description, imageCount: row.images.length, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } }
  async deleteGallery(actor: MerchantActor, id: string): Promise<void> { const result = await this.prisma.gallery.updateMany({ where: { id, tenantId: actor.tenantId, deletedAt: null }, data: { deletedAt: new Date() } }); if (!result.count) throw this.notFound('GALLERY_NOT_FOUND', '图库不存在或无权访问') }
  async listGalleryImages(actor: MerchantActor, galleryId: string): Promise<object[]> { await this.requireGallery(actor, galleryId); return (await this.prisma.galleryImage.findMany({ where: { galleryId, deletedAt: null }, orderBy: { createdAt: 'desc' } })).map((row) => ({ id: row.id, galleryId: row.galleryId, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, formattedSize: formatBytes(row.sizeBytes), url: row.publicUrl, createdAt: row.createdAt.toISOString() })) }
  async startGalleryImageUpload(actor: MerchantActor, galleryId: string, input: unknown): Promise<object> {
    await this.requireGallery(actor, galleryId)
    const data = this.imageUploadInput(input)
    const objectKey = `merchant/${actor.tenantId}/galleries/${galleryId}/${randomUUID()}`
    const expiresAt = new Date(Date.now() + 5 * 60_000)
    const session = await this.prisma.galleryUploadSession.create({ data: { tenantId: actor.tenantId, galleryId, objectKey, fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.sizeBytes, expiresAt } })
    try {
      const signed = await this.storage.issueMerchantUpload(actor.tenantId, objectKey, data.mimeType)
      return { uploadId: session.id, uploadUrl: signed.uploadUrl, method: 'PUT', headers: { 'content-type': data.mimeType }, expiresAt: signed.expiresAt }
    } catch (error) {
      await this.prisma.galleryUploadSession.delete({ where: { id: session.id } })
      throw error
    }
  }
  async completeGalleryImageUpload(actor: MerchantActor, galleryId: string, uploadId: string): Promise<object> {
    const session = await this.prisma.galleryUploadSession.findFirst({ where: { id: uploadId, tenantId: actor.tenantId, galleryId, completedAt: null } })
    if (!session) throw this.notFound('UPLOAD_SESSION_NOT_FOUND', '上传会话不存在、已完成或无权访问')
    if (session.expiresAt <= new Date()) throw apiConflict('UPLOAD_SESSION_EXPIRED', '上传会话已过期，请重新选择图片')
    const verified = await this.storage.verifyMerchantUpload(actor.tenantId, session.objectKey, session.mimeType, session.sizeBytes)
    const image = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.galleryUploadSession.updateMany({ where: { id: session.id, completedAt: null }, data: { completedAt: new Date() } })
      if (!claimed.count) throw apiConflict('UPLOAD_SESSION_ALREADY_COMPLETED', '上传会话已完成，请刷新图库')
      const created = await tx.galleryImage.create({ data: { galleryId, fileName: session.fileName, mimeType: session.mimeType, sizeBytes: session.sizeBytes, objectKey: session.objectKey, publicUrl: verified.publicUrl } })
      await tx.quotaBalance.update({ where: { tenantId: actor.tenantId }, data: { imageStorageBytes: { increment: session.sizeBytes } } })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'gallery_image.uploaded', entityType: 'GalleryImage', entityId: created.id, detail: { galleryId, sizeBytes: session.sizeBytes, mimeType: session.mimeType } } })
      return created
    }, { isolationLevel: 'Serializable' })
    return { id: image.id, galleryId: image.galleryId, fileName: image.fileName, mimeType: image.mimeType, sizeBytes: image.sizeBytes, formattedSize: formatBytes(image.sizeBytes), url: image.publicUrl, createdAt: image.createdAt.toISOString() }
  }
  async deleteGalleryImage(actor: MerchantActor, id: string): Promise<void> {
    const image = await this.prisma.galleryImage.findFirst({ where: { id, gallery: { tenantId: actor.tenantId }, deletedAt: null } })
    if (!image) throw this.notFound('GALLERY_IMAGE_NOT_FOUND', '图片不存在或无权访问')
    if (image.objectKey) await this.storage.deleteMerchantObject(actor.tenantId, image.objectKey)
    await this.prisma.$transaction(async (tx) => {
      await tx.galleryImage.update({ where: { id: image.id }, data: { deletedAt: new Date() } })
      const quota = await tx.quotaBalance.findUnique({ where: { tenantId: actor.tenantId } })
      if (quota) await tx.quotaBalance.update({ where: { tenantId: actor.tenantId }, data: { imageStorageBytes: BigInt(Math.max(Number(quota.imageStorageBytes) - image.sizeBytes, 0)) } })
    }, { isolationLevel: 'Serializable' })
  }

  async listInstructions(actor: MerchantActor): Promise<object[]> { return (await this.prisma.writingInstruction.findMany({ where: { tenantId: actor.tenantId, deletedAt: null }, orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }] })).map((row) => this.instructionDto(row)) }
  async createInstruction(actor: MerchantActor, input: unknown): Promise<object> { const data = this.instructionInput(input); return this.instructionDto(await this.prisma.writingInstruction.create({ data: { tenantId: actor.tenantId, ...data } })) }
  async updateInstruction(actor: MerchantActor, id: string, input: unknown): Promise<object> { const data = this.instructionInput(input); const existing = await this.prisma.writingInstruction.findFirst({ where: { id, tenantId: actor.tenantId, deletedAt: null } }); if (!existing) throw this.notFound('WRITING_INSTRUCTION_NOT_FOUND', '创作指令不存在或无权访问'); if (existing.isSystem) throw apiConflict('SYSTEM_INSTRUCTION_READ_ONLY', '系统默认指令不可修改'); const row = await this.prisma.writingInstruction.update({ where: { id }, data }); return this.instructionDto(row) }
  async deleteInstruction(actor: MerchantActor, id: string): Promise<void> { const existing = await this.prisma.writingInstruction.findFirst({ where: { id, tenantId: actor.tenantId, deletedAt: null } }); if (!existing) throw this.notFound('WRITING_INSTRUCTION_NOT_FOUND', '创作指令不存在或无权访问'); if (existing.isSystem) throw apiConflict('SYSTEM_INSTRUCTION_READ_ONLY', '系统默认指令不可删除'); await this.prisma.writingInstruction.update({ where: { id }, data: { deletedAt: new Date() } }) }

  async listArticles(actor: MerchantActor): Promise<object[]> { return (await this.prisma.article.findMany({ where: { tenantId: actor.tenantId, deletedAt: null }, orderBy: { updatedAt: 'desc' } })).map((row) => this.articleDto(row)) }
  async createArticle(actor: MerchantActor, input: unknown): Promise<object> {
    const article = await this.prisma.$transaction(async (tx) => {
      const data = await this.articleInput(tx, actor, input)
      const created = await tx.article.create({ data: { tenantId: actor.tenantId, ...data, source: ArticleSource.MANUAL } })
      await this.snapshotArticle(tx, created)
      return created
    })
    return this.articleDto(article)
  }
  async updateArticle(actor: MerchantActor, id: string, input: unknown): Promise<object> {
    const article = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.article.findFirst({ where: { id, tenantId: actor.tenantId, deletedAt: null } })
      if (!existing) throw this.notFound('ARTICLE_NOT_FOUND', '文章不存在或无权访问')
      const data = await this.articleInput(tx, actor, input)
      const existingImageIds = this.stringArray(existing.galleryImageIds)
      if (existing.title === data.title && existing.content === data.content && existing.status === data.status && existing.galleryId === data.galleryId && existingImageIds.length === data.galleryImageIds.length && existingImageIds.every((value, index) => value === data.galleryImageIds[index])) return existing
      const updated = await tx.article.update({ where: { id }, data: { ...data, currentVersion: { increment: 1 } } })
      await this.snapshotArticle(tx, updated)
      return updated
    })
    return this.articleDto(article)
  }
  async deleteArticle(actor: MerchantActor, id: string): Promise<void> { const result = await this.prisma.article.updateMany({ where: { id, tenantId: actor.tenantId, deletedAt: null }, data: { deletedAt: new Date() } }); if (!result.count) throw this.notFound('ARTICLE_NOT_FOUND', '文章不存在或无权访问') }
  async rejectAiCreation(): Promise<never> { throw apiConflict('AI_NOT_CONFIGURED', 'AI 写作需由贴牌配置并测试大模型接口后才能执行') }

  async getWebsite(actor: MerchantActor): Promise<object> { const row = await this.prisma.merchantWebsite.upsert({ where: { tenantId: actor.tenantId }, update: {}, create: { tenantId: actor.tenantId }, include: { profileVersion: { select: { version: true } } } }); return this.websiteDto(row, actor.tenantId) }
  async updateWebsite(actor: MerchantActor, input: unknown): Promise<object> { const value = (input as { template?: unknown })?.template; if (typeof value !== 'string' || !(value in templateToDb)) throw apiConflict('WEBSITE_TEMPLATE_INVALID', '请选择有效的网站模板'); const row = await this.prisma.merchantWebsite.upsert({ where: { tenantId: actor.tenantId }, update: { template: templateToDb[value as keyof typeof templateToDb], status: WebsiteStatus.NOT_GENERATED, lastGeneratedAt: null, artifactObjectPrefix: null, artifactManifestUrl: null, artifactUploadedAt: null, version: { increment: 1 } }, create: { tenantId: actor.tenantId, template: templateToDb[value as keyof typeof templateToDb] } }); return this.websiteDto(row, actor.tenantId) }
  async generateWebsite(actor: MerchantActor): Promise<object> { const row = await this.sites.generate(actor.tenantId); return this.websiteDto(row, actor.tenantId) }
  async rejectWebsiteGeneration(): Promise<never> { throw apiConflict('SITE_RENDERER_NOT_CONFIGURED', '静态建站渲染服务尚未接入，不能伪造已生成状态') }

  async listDoubaoResults(actor: MerchantActor): Promise<object[]> { return (await this.prisma.doubaoCheckResult.findMany({ where: { tenantId: actor.tenantId }, orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }] })).map((row) => ({ id: row.id, question: row.question, answer: row.answer, sources: Array.isArray(row.sources) ? row.sources : [], matched: row.matched, matchedName: row.matchedName, checkedAt: row.checkedAt?.toISOString() ?? null, apiStatus: row.apiStatus.toLowerCase(), failureReason: row.failureReason })) }
  async listMediaAccounts(actor: MerchantActor): Promise<object[]> {
    const stored = await this.prisma.mediaAccount.findMany({ where: { tenantId: actor.tenantId }, include: { sessionBackup: { select: { capturedAt: true, revokedAt: true } } }, orderBy: [{ platform: 'asc' }, { updatedAt: 'asc' }] })
    const rows: Array<{ id: string | null; platform: PublishPlatform; status: string; maskedName: string | null; localReferenceId: string | null; lastVerifiedAt: string | null; lastHeartbeatAt: string | null; failureReason: string | null; backupAvailable: boolean; backupCapturedAt: string | null }> = stored.map((row) => ({ id: row.id, platform: mediaFromDb[row.platform], status: row.status.toLowerCase(), maskedName: row.maskedName, localReferenceId: row.localReferenceId, lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null, lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null, failureReason: row.failureReason, backupAvailable: Boolean(row.sessionBackup && !row.sessionBackup.revokedAt), backupCapturedAt: row.sessionBackup && !row.sessionBackup.revokedAt ? row.sessionBackup.capturedAt.toISOString() : null }))
    for (const platform of ['toutiao', 'douyin'] as const) if (!rows.some((row) => row.platform === platform)) rows.push({ id: null, platform, status: 'unbound', maskedName: null, localReferenceId: null, lastVerifiedAt: null, lastHeartbeatAt: null, failureReason: null, backupAvailable: false, backupCapturedAt: null })
    return rows
  }
  async rejectMediaConnect(): Promise<never> { throw apiConflict('PUBLISHER_NOT_CONNECTED', '请使用本地发布助手扫码登录，网页端不保存媒体 Cookie') }
  async listPublishTasks(actor: MerchantActor): Promise<object[]> {
    return (await this.prisma.publishTask.findMany({ where: { tenantId: actor.tenantId }, include: { article: true, articleVersion: true, mediaAccount: true }, orderBy: { createdAt: 'desc' } })).map((row) => this.publishTaskDto(row))
  }

  async createPublishTasks(actor: MerchantActor, input: unknown, idempotencyKey: string): Promise<object> {
    const request = this.publishBatchInput(input)
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) throw apiConflict('IDEMPOTENCY_KEY_REQUIRED', '请提供 8-100 位 Idempotency-Key，避免重复创建发布批次')
    const scopedIdempotencyKey = `publish:${actor.tenantId}:${idempotencyKey}`
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingBatch = await tx.publishBatch.findUnique({ where: { idempotencyKey: scopedIdempotencyKey }, include: { tasks: { include: { article: true, articleVersion: true, mediaAccount: true }, orderBy: { createdAt: 'asc' } } } })
        if (existingBatch) return this.publishBatchDto(existingBatch)

        const articles = await tx.article.findMany({ where: { id: { in: request.articleIds }, tenantId: actor.tenantId, deletedAt: null } })
        if (articles.length !== request.articleIds.length) throw this.notFound('ARTICLE_NOT_FOUND', '部分文章不存在或无权访问')
        if (articles.some((article) => article.status !== ArticleStatus.PUBLISHABLE)) throw apiConflict('ARTICLE_NOT_PUBLISHABLE', '所选文章状态必须全部为“可发布”')
        const articleById = new Map(articles.map((article) => [article.id, article]))
        const snapshots = await tx.articleVersion.findMany({ where: { OR: articles.map((article) => ({ articleId: article.id, version: article.currentVersion })) } })
        if (snapshots.length !== articles.length) throw apiConflict('ARTICLE_VERSION_MISSING', '部分文章版本缺失，暂不能创建发布任务')
        const snapshotByArticle = new Map(snapshots.map((snapshot) => [snapshot.articleId, snapshot]))

        const accounts = await tx.mediaAccount.findMany({ where: { id: { in: request.mediaAccountIds }, tenantId: actor.tenantId, status: MediaAccountStatus.CONNECTED } })
        if (accounts.length !== request.mediaAccountIds.length) throw apiConflict('MEDIA_ACCOUNT_NOT_READY', '部分发布账号未连接、已失效或不属于当前商户')
        const accountsByPlatform: Record<PublishPlatform, string[]> = { toutiao: [], douyin: [] }
        for (const account of accounts) accountsByPlatform[mediaFromDb[account.platform]].push(account.id)
        if (request.platforms.some((platform) => accountsByPlatform[platform].length === 0)) throw apiConflict('MEDIA_ACCOUNT_REQUIRED', '每个所选平台至少选择一个已连接的发布账号')
        if (accounts.some((account) => !request.platforms.includes(mediaFromDb[account.platform]))) throw apiConflict('MEDIA_ACCOUNT_PLATFORM_MISMATCH', '发布账号必须属于已选择的平台')

        const existingTasks = await tx.publishTask.findMany({ where: { tenantId: actor.tenantId, articleId: { in: request.articleIds } }, include: { batch: { select: { deduplicationMode: true } } } })
        const startsAt = new Date()
        const plan = planPublishAssignments({
          articleIds: request.articleIds,
          platforms: request.platforms,
          accountsByPlatform,
          publishCount: request.publishCount,
          deduplicationMode: request.deduplicationMode,
          dailyLimits: request.dailyLimits,
          existing: existingTasks.map((task) => ({ articleId: task.articleId, platform: mediaFromDb[task.platform], deduplicationMode: task.batch?.deduplicationMode === PublishDeduplicationMode.ALL_PLATFORMS ? 'all_platforms' : 'per_platform' })),
          startsAt,
        })
        if (!plan.assignments.length) throw apiConflict('PUBLISH_TASK_ALL_DUPLICATES', '所选文章按当前去重方式均已存在发布任务，请调整文章库或去重方式')

        for (const assignment of plan.assignments) {
          const snapshot = snapshotByArticle.get(assignment.articleId)
          if (!snapshot) throw apiConflict('ARTICLE_VERSION_MISSING', '文章版本缺失，暂不能创建发布任务')
          const imageIds = this.stringArray(snapshot.galleryImageIds)
          if (assignment.platform === 'douyin' && snapshot.imageCount < 1) throw apiConflict('PUBLISH_IMAGES_REQUIRED', `抖音图文“${snapshot.title}”至少需要 1 张文章图片`)
          if (snapshot.imageCount !== imageIds.length) throw apiConflict('PUBLISH_IMAGES_MISSING', `文章“${snapshot.title}”的图片快照不完整，请先修复文章后再发布`)
        }

        const batch = await tx.publishBatch.create({ data: {
          tenantId: actor.tenantId,
          idempotencyKey: scopedIdempotencyKey,
          toutiaoDailyLimit: request.dailyLimits.toutiao,
          douyinDailyLimit: request.dailyLimits.douyin,
          deduplicationMode: request.deduplicationMode === 'all_platforms' ? PublishDeduplicationMode.ALL_PLATFORMS : PublishDeduplicationMode.PER_PLATFORM,
          totalCount: plan.assignments.length,
          estimatedTaskCount: plan.estimatedTaskCount,
          skippedDuplicateCount: plan.skippedDuplicateCount,
        } })
        const created = []
        for (const assignment of plan.assignments) {
          const article = articleById.get(assignment.articleId)
          const snapshot = snapshotByArticle.get(assignment.articleId)
          if (!article || !snapshot) throw apiConflict('ARTICLE_VERSION_MISSING', '文章版本缺失，暂不能创建发布任务')
          const row = await tx.publishTask.create({ data: {
            tenantId: actor.tenantId,
            batchId: batch.id,
            articleId: article.id,
            articleVersionId: snapshot.id,
            platform: mediaToDb[assignment.platform],
            mediaAccountId: assignment.mediaAccountId,
            status: assignment.scheduledAt.getTime() <= startsAt.getTime() ? PublishTaskStatus.QUEUED : PublishTaskStatus.SCHEDULED,
            scheduledAt: assignment.scheduledAt,
          }, include: { article: true, articleVersion: true, mediaAccount: true } })
          created.push(row)
        }
        return { batchId: batch.id, createdTaskCount: created.length, skippedDuplicateCount: plan.skippedDuplicateCount, estimatedTaskCount: plan.estimatedTaskCount, tasks: created.map((row) => this.publishTaskDto(row)) }
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      if (code === 'P2002' || code === 'P2034') throw apiConflict('PUBLISH_TASK_DUPLICATE', '其他请求已为部分文章创建发布任务，请刷新后重试')
      throw error
    }
  }

  private async requireKeyword(actor: MerchantActor, id: string) { const keyword = await this.prisma.keyword.findFirst({ where: { id, tenantId: actor.tenantId, deletedAt: null } }); if (!keyword) throw this.notFound('KEYWORD_NOT_FOUND', '关键词不存在或无权访问'); return keyword }
  private async requireGallery(actor: MerchantActor, id: string) { const row = await this.prisma.gallery.findFirst({ where: { id, tenantId: actor.tenantId, deletedAt: null } }); if (!row) throw this.notFound('GALLERY_NOT_FOUND', '图库不存在或无权访问'); return row }
  private questionDto(row: { id: string; keywordId: string; text: string; status: KeywordStatus; articleCreated: boolean; checkedAt: Date | null; createdAt: Date }) { return { id: row.id, keywordId: row.keywordId, text: row.text, status: row.status === KeywordStatus.ENABLED ? 'enabled' : 'disabled', articleCreated: row.articleCreated, checkedAt: row.checkedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() } }
  private knowledgeInput(input: unknown) {
    const raw = input as Record<string, unknown>
    const name = requireText(raw?.name, 2, 100)
    const companyName = requireText(raw?.companyName, 2, 120)
    const brandAlias = requireText(raw?.brandAlias, 1, 80)
    const structured = Object.fromEntries(knowledgeContentFields.map(([key]) => [key, optionalText(raw?.[key], 1000)])) as Record<(typeof knowledgeContentFields)[number][0], string | null>
    if (!name || !companyName || !brandAlias || Object.values(structured).some((value) => value === null)) throw apiConflict('KNOWLEDGE_LIBRARY_INPUT_INVALID', '请填写有效的信息库名称、公司名称、品牌简称和资料内容')
    const contentSections = [
      `公司名称：${companyName}`,
      `品牌简称：${brandAlias}`,
      ...knowledgeContentFields.flatMap(([key, label]) => structured[key] ? [`${label}：${structured[key]}`] : []),
    ]
    if (!knowledgeContentFields.some(([key]) => Boolean(structured[key]))) throw apiConflict('KNOWLEDGE_LIBRARY_INPUT_INVALID', '产品服务、产品特点、品牌故事、用户痛点、信任背书、客户案例或其他信息至少填写一项')
    const contentFields = structured as Record<(typeof knowledgeContentFields)[number][0], string>
    return { name, category: KnowledgeLibraryCategory.OTHER, content: contentSections.join('\n\n'), companyName, brandAlias, ...contentFields }
  }
  private knowledgeDto(row: { id: string; name: string; category: KnowledgeLibraryCategory; content: string; companyName: string; brandAlias: string; productServices: string; productFeatures: string; brandStory: string; userPainPoints: string; trustProof: string; customerCases: string; otherInfo: string; createdAt: Date; updatedAt: Date }) {
    const structured = Object.fromEntries(knowledgeContentFields.map(([key]) => [key, row[key]])) as Record<(typeof knowledgeContentFields)[number][0], string>
    if (!Object.values(structured).some(Boolean) && row.content) {
      const legacyKey = {
        [KnowledgeLibraryCategory.PRODUCT_SERVICE]: 'productServices',
        [KnowledgeLibraryCategory.PRODUCT_FEATURE]: 'productFeatures',
        [KnowledgeLibraryCategory.BRAND_STORY]: 'brandStory',
        [KnowledgeLibraryCategory.USER_PAIN_POINT]: 'userPainPoints',
        [KnowledgeLibraryCategory.TRUST_PROOF]: 'trustProof',
        [KnowledgeLibraryCategory.CUSTOMER_CASE]: 'customerCases',
        [KnowledgeLibraryCategory.OTHER]: 'otherInfo',
      }[row.category] as (typeof knowledgeContentFields)[number][0]
      structured[legacyKey] = row.content
    }
    return { id: row.id, name: row.name, companyName: row.companyName, brandAlias: row.brandAlias, ...structured, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
  }
  private galleryInput(input: unknown) { const raw = input as { name?: unknown; description?: unknown }; const name = requireText(raw?.name, 2, 100); const description = typeof raw?.description === 'string' && raw.description.length <= 400 ? raw.description.trim() : null; if (!name || description === null) throw apiConflict('GALLERY_INPUT_INVALID', '请填写有效的图库名称和说明'); return { name, description } }
  private imageUploadInput(input: unknown) { const raw = input as { fileName?: unknown; mimeType?: unknown; sizeBytes?: unknown }; const fileName = typeof raw?.fileName === 'string' ? raw.fileName.trim() : ''; const mimeType = typeof raw?.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : ''; const sizeBytes = typeof raw?.sizeBytes === 'number' && Number.isInteger(raw.sizeBytes) ? raw.sizeBytes : 0; // eslint-disable-next-line no-control-regex -- 文件名必须拒绝不可见控制字符
    if (!fileName || fileName.length > 260 || /[\\/\u0000-\u001f]/.test(fileName) || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType) || sizeBytes < 1 || sizeBytes > 20 * 1024 * 1024) throw apiConflict('IMAGE_UPLOAD_INPUT_INVALID', '仅支持 JPEG、PNG、WebP、GIF，单张图片为 1 B 至 20 MB'); return { fileName, mimeType, sizeBytes } }
  private instructionInput(input: unknown) { const raw = input as { name?: unknown; content?: unknown }; const name = requireText(raw?.name, 2, 100); const content = requireText(raw?.content, 20, 8000); if (!name || !content) throw apiConflict('WRITING_INSTRUCTION_INPUT_INVALID', '请填写有效的指令名称和内容'); return { name, content } }
  private instructionDto(row: { id: string; name: string; content: string; isSystem: boolean; createdAt: Date; updatedAt: Date }) { return { id: row.id, name: row.name, content: row.content, isSystem: row.isSystem, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } }
  private async articleInput(tx: Prisma.TransactionClient, actor: MerchantActor, input: unknown) {
    const raw = input as { title?: unknown; content?: unknown; status?: unknown; galleryId?: unknown; galleryImageIds?: unknown }
    const title = requireText(raw?.title, 2, 150)
    const rawContent = requireText(raw?.content, 20, 30000)
    const content = rawContent ? sanitizeArticleContent(rawContent) : ''
    const statusMap = { draft: ArticleStatus.DRAFT, pending_review: ArticleStatus.PENDING_REVIEW, publishable: ArticleStatus.PUBLISHABLE, disabled: ArticleStatus.DISABLED } as const
    const status = typeof raw?.status === 'string' ? statusMap[raw.status as keyof typeof statusMap] : undefined
    const galleryId = raw?.galleryId === null || raw?.galleryId === undefined ? null : typeof raw.galleryId === 'string' && raw.galleryId.trim() ? raw.galleryId.trim() : undefined
    const rawImageIds = Array.isArray(raw?.galleryImageIds) ? raw.galleryImageIds : []
    const galleryImageIds = [...new Set(rawImageIds.filter((value): value is string => typeof value === 'string' && value.length > 0))]
    if (!title || content.length < 20 || !status || galleryId === undefined || rawImageIds.length !== galleryImageIds.length || galleryImageIds.length > 3) throw apiConflict('ARTICLE_INPUT_INVALID', '请填写有效的文章标题、正文、状态和配图')
    if (!galleryId && galleryImageIds.length) throw apiConflict('ARTICLE_IMAGES_INVALID', '选择文章配图前必须先选择企业图库')
    if (galleryId) {
      const gallery = await tx.gallery.findFirst({ where: { id: galleryId, tenantId: actor.tenantId, deletedAt: null }, select: { id: true } })
      if (!gallery) throw this.notFound('GALLERY_NOT_FOUND', '所选图库不存在或无权访问')
      if (galleryImageIds.length) {
        const imageCount = await tx.galleryImage.count({ where: { id: { in: galleryImageIds }, galleryId, deletedAt: null } })
        if (imageCount !== galleryImageIds.length) throw apiConflict('ARTICLE_IMAGES_INVALID', '所选图片不存在、已删除或不属于当前图库')
      }
    }
    return { title, content, status, galleryId, imageCount: galleryImageIds.length, galleryImageIds }
  }
  private stringArray(value: Prisma.JsonValue): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
  private async snapshotArticle(tx: Prisma.TransactionClient, article: { id: string; tenantId: string; currentVersion: number; title: string; content: string; source: ArticleSource; status: ArticleStatus; knowledgeLibraryIds: Prisma.JsonValue; galleryId: string | null; imageCount: number; galleryImageIds?: Prisma.JsonValue; instructionId: string | null }): Promise<void> { await tx.articleVersion.create({ data: { articleId: article.id, tenantId: article.tenantId, version: article.currentVersion, title: article.title, content: article.content, source: article.source, status: article.status, knowledgeLibraryIds: article.knowledgeLibraryIds as Prisma.InputJsonValue, galleryId: article.galleryId, imageCount: article.imageCount, galleryImageIds: this.stringArray(article.galleryImageIds ?? []), instructionId: article.instructionId } }) }
  private articleDto(row: { id: string; title: string; content: string; source: ArticleSource; status: ArticleStatus; keywordId: string | null; knowledgeLibraryIds: Prisma.JsonValue; galleryId: string | null; imageCount: number; galleryImageIds?: Prisma.JsonValue; instructionId: string | null; currentVersion: number; createdAt: Date; updatedAt: Date }) { const statusMap = { [ArticleStatus.DRAFT]: 'draft', [ArticleStatus.PENDING_REVIEW]: 'pending_review', [ArticleStatus.PUBLISHABLE]: 'publishable', [ArticleStatus.DISABLED]: 'disabled' } as const; return { id: row.id, title: row.title, content: row.content, source: row.source === ArticleSource.MANUAL ? 'manual' : row.source === ArticleSource.AI_GENERATED ? 'ai_generated' : 'ai_mock', status: statusMap[row.status], keywordId: row.keywordId, knowledgeLibraryIds: Array.isArray(row.knowledgeLibraryIds) ? row.knowledgeLibraryIds.filter((item): item is string => typeof item === 'string') : [], galleryId: row.galleryId, imageCount: row.imageCount, galleryImageIds: this.stringArray(row.galleryImageIds ?? []), instructionId: row.instructionId, currentVersion: row.currentVersion, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } }
  private publishBatchInput(input: unknown): { articleIds: string[]; platforms: PublishPlatform[]; mediaAccountIds: string[]; publishCount: number; deduplicationMode: PublishDeduplication; dailyLimits: Record<PublishPlatform, number> } {
    const raw = input as { articleIds?: unknown; platforms?: unknown; mediaAccountIds?: unknown; publishCount?: unknown; deduplicationMode?: unknown; dailyLimits?: { toutiao?: unknown; douyin?: unknown } }
    const articleIds = Array.isArray(raw?.articleIds) ? [...new Set(raw.articleIds.filter((item): item is string => typeof item === 'string' && item.length > 0))] : []
    const platforms = Array.isArray(raw?.platforms) ? [...new Set(raw.platforms.filter((item): item is PublishPlatform => item === 'toutiao' || item === 'douyin'))] : []
    const mediaAccountIds = Array.isArray(raw?.mediaAccountIds) ? [...new Set(raw.mediaAccountIds.filter((item): item is string => typeof item === 'string' && item.length > 0))] : []
    const publishCount = raw?.publishCount
    const deduplicationMode = raw?.deduplicationMode
    const toutiao = raw?.dailyLimits?.toutiao
    const douyin = raw?.dailyLimits?.douyin
    if (!articleIds.length || articleIds.length > 100 || !platforms.length || platforms.length > 2 || !mediaAccountIds.length || mediaAccountIds.length > 40 || typeof publishCount !== 'number' || !Number.isInteger(publishCount) || publishCount < 1 || publishCount > 100 || publishCount > articleIds.length || (deduplicationMode !== 'per_platform' && deduplicationMode !== 'all_platforms') || typeof toutiao !== 'number' || !Number.isInteger(toutiao) || toutiao < 1 || toutiao > 100 || typeof douyin !== 'number' || !Number.isInteger(douyin) || douyin < 1 || douyin > 100) throw apiConflict('PUBLISH_TASK_INPUT_INVALID', '请选择文章库、平台、发布账号、去重方式及 1-100 的发布数量和每日数量')
    return { articleIds, platforms, mediaAccountIds, publishCount, deduplicationMode, dailyLimits: { toutiao, douyin } }
  }
  private publishTaskDto(row: PublishTaskWithContext): object {
    return {
      id: row.id,
      batchId: row.batchId,
      articleId: row.articleId,
      articleVersion: row.articleVersion?.version ?? null,
      articleTitle: row.articleVersion?.title ?? row.article.title,
      platform: mediaFromDb[row.platform],
      mediaAccountId: row.mediaAccountId,
      mediaAccountName: row.mediaAccount?.maskedName ?? null,
      status: row.status.toLowerCase(),
      scheduledAt: row.scheduledAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      resultUrl: row.resultUrl,
      failureReason: row.attentionReason === PublishAttentionReason.LEASE_EXPIRED ? leaseExpiredPublishReason : row.failureReason,
      attentionReason: row.attentionReason?.toLowerCase() ?? null,
      canResume: Boolean(row.attentionReason && resumablePublishAttentionReasons.has(row.attentionReason)),
      attemptCount: row.attemptCount,
    }
  }
  private publishBatchDto(batch: PublishBatchWithTasks): object {
    return { batchId: batch.id, createdTaskCount: batch.tasks.length, skippedDuplicateCount: batch.skippedDuplicateCount, estimatedTaskCount: batch.estimatedTaskCount, tasks: batch.tasks.map((task) => this.publishTaskDto(task)) }
  }
  private websiteDto(row: { template: WebsiteTemplate; hostname: string | null; status: WebsiteStatus; lastGeneratedAt: Date | null; version: number; artifactUploadedAt: Date | null; profileVersion?: number | { version: number } | null }, tenantId: string) { const profileVersion = typeof row.profileVersion === 'number' ? row.profileVersion : row.profileVersion?.version ?? null; return { template: templateFromDb[row.template], hostname: row.hostname, status: row.status.toLowerCase(), lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null, version: row.version, profileVersion, previewUrl: row.status === WebsiteStatus.LOCAL_READY || row.status === WebsiteStatus.PUBLISHED ? this.sites.previewUrl(tenantId) : null, storageState: row.artifactUploadedAt ? 'uploaded' : 'local_only', artifactUploadedAt: row.artifactUploadedAt?.toISOString() ?? null } }
  private notFound(code: string, message: string): NotFoundException { return new NotFoundException({ code, message }) }
}
