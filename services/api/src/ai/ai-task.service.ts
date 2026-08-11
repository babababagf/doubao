import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'

import { sanitizeArticleContent } from '../content/article-sanitizer'

import { AiTaskStatus, AiTaskType, ArticleSource, ArticleStatus, EntitlementEntryType, KeywordStatus, type Prisma } from '../generated/prisma/client'
import type { MerchantActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { AiProviderService } from './ai-provider.service'
import type { ArticleContentDirection } from './ai-provider.service'
import { AiTaskQueueService } from './ai-task-queue.service'
import { DEFAULT_WRITING_INSTRUCTION, renderWritingInstruction } from './default-writing-instruction'

type ArticleTaskDirection = ArticleContentDirection | 'mixed'
type ArticleTaskInput = { keywordId: unknown; knowledgeLibraryId: unknown; galleryId: unknown; imageCount: unknown; instructionId?: unknown; contentDirection?: unknown; count: unknown }
type ArticleTaskRequest = { keywordId: string; keywordName: string; knowledgeLibraryId: string | null; knowledgeName: string; knowledgeContent: string; galleryId: string | null; galleryImageIds: string[]; imageCount: number; instructionId: string | null; instruction: string; contentDirection: ArticleTaskDirection; factMode: 'basic' | 'enriched'; companyName: string; aliases: string[]; industry: string; coreBusiness: string; introduction: string; questions: Array<{ id: string; text: string; contentDirection?: ArticleContentDirection }>; retryOfTaskId?: string }
type QuestionTaskInput = { count: unknown }
type QuestionTaskRequest = { keywordId: string; keywordName: string; companyName: string; aliases: string[]; industry: string; coreBusiness: string; count: number }
type ArticleRetryInput = { questionId?: unknown }

const TERMINAL: AiTaskStatus[] = [AiTaskStatus.SUCCEEDED, AiTaskStatus.PARTIALLY_FAILED, AiTaskStatus.FAILED, AiTaskStatus.STOPPED]
const taskKey = (type: 'article' | 'question' | 'article-retry', tenantId: string, key: string) => `ai:${type}:${tenantId}:${key}`
const normalizeQuestion = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
const jsonStringArray = (value: unknown): string[] => Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
const ARTICLE_DIRECTIONS: ArticleContentDirection[] = ['marketing', 'ranking', 'education', 'qa', 'selection_guide', 'case_study', 'industry_trend', 'local_service']
const ARTICLE_TASK_DIRECTIONS: ArticleTaskDirection[] = ['mixed', ...ARTICLE_DIRECTIONS]

@Injectable()
export class AiTaskService {
  constructor(private readonly prisma: PrismaService, private readonly queue: AiTaskQueueService, private readonly provider: AiProviderService) {}

  async createArticleTask(actor: MerchantActor, input: ArticleTaskInput, idempotencyKey: string): Promise<object> {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: '请提供 8-100 位的 Idempotency-Key，避免重复创建任务' })
    const data = this.articleInput(input)
    const key = taskKey('article', actor.tenantId, idempotencyKey)
    const { task, created } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiGenerationTask.findUnique({ where: { idempotencyKey: key } })
      if (existing) return { task: existing, created: false }
      const snapshot = await this.articleSnapshot(tx, actor.tenantId, data)
      const compute = snapshot.questions.length * 30
      const writing = snapshot.questions.length
      const quota = await tx.quotaBalance.findUnique({ where: { tenantId: actor.tenantId } })
      if (!quota || quota.computePointsAvailable - quota.computePointsReserved < compute || quota.writingLimit - quota.writingUsed - quota.writingReserved < writing) throw new ConflictException({ code: 'AI_QUOTA_INSUFFICIENT', message: '可用算力点数或写作篇数不足，不能创建任务' })
      await tx.quotaBalance.update({ where: { tenantId: actor.tenantId }, data: { computePointsReserved: { increment: compute }, writingReserved: { increment: writing } } })
      const created = await tx.aiGenerationTask.create({ data: { tenantId: actor.tenantId, type: AiTaskType.ARTICLE_WRITING, idempotencyKey: key, request: snapshot, totalCount: snapshot.questions.length, computePointsReserved: compute, writingReserved: writing } })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'ai_task.article.created', entityType: 'AiGenerationTask', entityId: created.id, detail: { keywordId: snapshot.keywordId, count: created.totalCount, computeReserved: compute, writingReserved: writing } } })
      return { task: created, created: true }
    }, { isolationLevel: 'Serializable' })
    if (!created) return this.view(task)
    try { await this.queue.enqueue(task.id) } catch {
      await this.releaseAfterQueueFailure(task.id)
      throw new ConflictException({ code: 'AI_QUEUE_UNAVAILABLE', message: '任务队列暂不可用，本次额度预占已退回，请稍后重试' })
    }
    return this.view(task)
  }

  async createQuestionTask(actor: MerchantActor, keywordId: string, input: QuestionTaskInput, idempotencyKey: string): Promise<object> {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: '请提供 8-100 位的 Idempotency-Key，避免重复创建任务' })
    const count = this.questionCount(input)
    const key = taskKey('question', actor.tenantId, idempotencyKey)
    const { task, created } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiGenerationTask.findUnique({ where: { idempotencyKey: key } })
      if (existing) return { task: existing, created: false }
      const snapshot = await this.questionSnapshot(tx, actor.tenantId, keywordId, count)
      const quota = await tx.quotaBalance.findUnique({ where: { tenantId: actor.tenantId } })
      if (!quota || quota.computePointsAvailable - quota.computePointsReserved < count) throw new ConflictException({ code: 'AI_QUOTA_INSUFFICIENT', message: '可用算力点数不足，不能创建问题词拓展任务' })
      await tx.quotaBalance.update({ where: { tenantId: actor.tenantId }, data: { computePointsReserved: { increment: count } } })
      const createdTask = await tx.aiGenerationTask.create({ data: { tenantId: actor.tenantId, type: AiTaskType.QUESTION_EXPANSION, idempotencyKey: key, request: snapshot, totalCount: count, computePointsReserved: count, writingReserved: 0 } })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'ai_task.question.created', entityType: 'AiGenerationTask', entityId: createdTask.id, detail: { keywordId, count, computeReserved: count } } })
      return { task: createdTask, created: true }
    }, { isolationLevel: 'Serializable' })
    if (!created) return this.view(task)
    try { await this.queue.enqueue(task.id) } catch {
      await this.releaseAfterQueueFailure(task.id)
      throw new ConflictException({ code: 'AI_QUEUE_UNAVAILABLE', message: '任务队列暂不可用，本次额度预占已退回，请稍后重试' })
    }
    return this.view(task)
  }

  async list(actor: MerchantActor): Promise<object[]> {
    const rows = await this.prisma.aiGenerationTask.findMany({ where: { tenantId: actor.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 })
    return rows.map((row) => this.view(row))
  }

  async stop(actor: MerchantActor, taskId: string): Promise<object> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const task = await this.prisma.$transaction(async (tx) => {
          const current = await tx.aiGenerationTask.findFirst({ where: { id: taskId, tenantId: actor.tenantId } })
          if (!current) throw new NotFoundException({ code: 'AI_TASK_NOT_FOUND', message: '创作任务不存在或无权访问' })
          if (TERMINAL.includes(current.status)) return current
          const stopped = await tx.aiGenerationTask.updateMany({
            where: { id: current.id, status: { in: [AiTaskStatus.QUEUED, AiTaskStatus.RUNNING] } },
            data: { status: AiTaskStatus.STOPPED, failureReason: '由商户停止', completedAt: new Date() },
          })
          if (!stopped.count) return (await tx.aiGenerationTask.findUnique({ where: { id: current.id } })) ?? current
          const locked = await tx.aiGenerationTask.findUnique({ where: { id: current.id } })
          if (!locked) return current
          await this.releaseReservation(tx, locked, 'stopped')
          return (await tx.aiGenerationTask.findUnique({ where: { id: current.id } })) ?? locked
        }, { isolationLevel: 'Serializable' })
        return this.view(task)
      } catch (reason) {
        if (!this.isSerializationConflict(reason)) throw reason
        if (attempt === 2) throw new ConflictException({ code: 'AI_TASK_CONCURRENT_UPDATE', message: '任务正在结算，请稍后再次停止' })
      }
    }
    throw new ConflictException({ code: 'AI_TASK_CONCURRENT_UPDATE', message: '任务正在结算，请稍后再次停止' })
  }

  async retryableArticleQuestions(actor: MerchantActor, taskId: string): Promise<object[]> {
    const task = await this.prisma.aiGenerationTask.findFirst({ where: { id: taskId, tenantId: actor.tenantId, type: AiTaskType.ARTICLE_WRITING } })
    if (!task) throw new NotFoundException({ code: 'AI_TASK_NOT_FOUND', message: '文章创作任务不存在或无权访问' })
    const request = this.articleRequest(task.request)
    const live = await this.prisma.question.findMany({ where: { tenantId: actor.tenantId, id: { in: request.questions.map((question) => question.id) }, status: KeywordStatus.ENABLED, articleCreated: false, deletedAt: null }, select: { id: true, text: true } })
    const byId = new Map(live.map((question) => [question.id, question]))
    return request.questions.map((question) => byId.get(question.id)).filter((question): question is { id: string; text: string } => Boolean(question)).map((question) => ({ ...question, taskFailureReason: task.failureReason }))
  }

  async retryArticleTask(actor: MerchantActor, taskId: string, input: ArticleRetryInput, idempotencyKey: string): Promise<object> {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: '请提供 8-100 位的 Idempotency-Key，避免重复创建任务' })
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ConflictException({ code: 'AI_RETRY_INPUT_INVALID', message: '重试参数无效' })
    const questionId = input.questionId === undefined || input.questionId === null ? null : typeof input.questionId === 'string' && input.questionId ? input.questionId : ''
    if (questionId === '') throw new ConflictException({ code: 'AI_RETRY_INPUT_INVALID', message: '单篇重试必须指定有效的问题词' })
    const key = taskKey('article-retry', actor.tenantId, `${taskId}:${idempotencyKey}`)
    const { task, created } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiGenerationTask.findUnique({ where: { idempotencyKey: key } })
      if (existing) return { task: existing, created: false }
      const original = await tx.aiGenerationTask.findFirst({ where: { id: taskId, tenantId: actor.tenantId, type: AiTaskType.ARTICLE_WRITING } })
      if (!original) throw new NotFoundException({ code: 'AI_TASK_NOT_FOUND', message: '文章创作任务不存在或无权访问' })
      if (!TERMINAL.includes(original.status)) throw new ConflictException({ code: 'AI_TASK_RETRY_NOT_READY', message: '任务尚未结束，暂不能重试' })
      const request = this.articleRequest(original.request)
      const live = await tx.question.findMany({ where: { tenantId: actor.tenantId, id: { in: request.questions.map((question) => question.id) }, status: KeywordStatus.ENABLED, articleCreated: false, deletedAt: null }, select: { id: true, text: true } })
      const liveById = new Map(live.map((question) => [question.id, question]))
      const candidates = request.questions.map((question) => liveById.get(question.id)).filter((question): question is { id: string; text: string } => Boolean(question))
      const questions = questionId ? candidates.filter((question) => question.id === questionId) : candidates
      if (!questions.length) throw new ConflictException({ code: 'AI_RETRY_NOTHING_TO_RUN', message: '没有可重试的未生成问题词；已成功文章不会重复生成' })
      if (questionId && questions.length !== 1) throw new ConflictException({ code: 'AI_RETRY_QUESTION_NOT_AVAILABLE', message: '该问题词不属于此任务、已生成或已不可用' })
      const compute = questions.length * 30
      const writing = questions.length
      const quota = await tx.quotaBalance.findUnique({ where: { tenantId: actor.tenantId } })
      if (!quota || quota.computePointsAvailable - quota.computePointsReserved < compute || quota.writingLimit - quota.writingUsed - quota.writingReserved < writing) throw new ConflictException({ code: 'AI_QUOTA_INSUFFICIENT', message: '可用算力点数或写作篇数不足，不能重试' })
      await tx.quotaBalance.update({ where: { tenantId: actor.tenantId }, data: { computePointsReserved: { increment: compute }, writingReserved: { increment: writing } } })
      const retryRequest: ArticleTaskRequest = { ...request, retryOfTaskId: original.id, questions }
      const createdTask = await tx.aiGenerationTask.create({ data: { tenantId: actor.tenantId, type: AiTaskType.ARTICLE_WRITING, idempotencyKey: key, request: retryRequest, totalCount: questions.length, computePointsReserved: compute, writingReserved: writing } })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'ai_task.article.retry_created', entityType: 'AiGenerationTask', entityId: createdTask.id, detail: { retryOfTaskId: original.id, questionId, count: questions.length, computeReserved: compute, writingReserved: writing } } })
      return { task: createdTask, created: true }
    }, { isolationLevel: 'Serializable' })
    if (!created) return this.view(task)
    try { await this.queue.enqueue(task.id) } catch {
      await this.releaseAfterQueueFailure(task.id)
      throw new ConflictException({ code: 'AI_QUEUE_UNAVAILABLE', message: '任务队列暂不可用，本次重试额度预占已退回，请稍后重试' })
    }
    return this.view(task)
  }

  async execute(taskId: string): Promise<void> {
    const initial = await this.prisma.aiGenerationTask.findUnique({ where: { id: taskId }, select: { status: true } })
    if (!initial || (initial.status !== AiTaskStatus.QUEUED && initial.status !== AiTaskStatus.RUNNING)) return
    if (initial.status === AiTaskStatus.QUEUED) {
      const claimed = await this.prisma.aiGenerationTask.updateMany({ where: { id: taskId, status: AiTaskStatus.QUEUED }, data: { status: AiTaskStatus.RUNNING, startedAt: new Date() } })
      if (!claimed.count) return
    }
    // BullMQ 同一 jobId 在同一时刻只会交给一个 Worker。这里接管 RUNNING 只用于进程中断后的重试，
    // 已提交文章与额度扣减在同一事务，重放不会产生第二条文章或第二笔扣点。
    const task = await this.prisma.aiGenerationTask.findUnique({ where: { id: taskId } })
    if (!task) return
    try {
      if (task.type === AiTaskType.QUESTION_EXPANSION) {
        await this.executeQuestionTask(task)
        return
      }
      if (task.type !== AiTaskType.ARTICLE_WRITING) return
      const request = task.request as unknown as ArticleTaskRequest
      let failure: string | null = null
      for (let index = 0; index < request.questions.length; index += 1) {
        const current = await this.prisma.aiGenerationTask.findUnique({ where: { id: task.id }, select: { status: true } })
        if (current?.status === AiTaskStatus.STOPPED) return
        const question = request.questions[index]
        if (!question) continue
        try {
          const contentDirection = this.resolveArticleDirection(request, question, index)
          const generated = await this.provider.writeArticle(task.tenantId, { companyName: request.companyName, aliases: request.aliases, industry: request.industry, coreBusiness: request.coreBusiness, introduction: request.introduction, keyword: request.keywordName, question: question.text, knowledgeName: request.knowledgeName, knowledgeContent: request.knowledgeContent, instruction: request.instruction, contentDirection, factMode: request.factMode ?? (request.knowledgeLibraryId ? 'enriched' : 'basic') })
          await this.commitArticle(task.id, question, generated)
        } catch (reason) {
          failure = this.safeFailure(reason)
          break
        }
      }
      await this.finish(task.id, failure)
    } catch (reason) {
      await this.finish(task.id, this.safeFailure(reason))
    }
  }

  private async executeQuestionTask(task: { id: string; tenantId: string; type: AiTaskType; status: AiTaskStatus; request: Prisma.JsonValue; totalCount: number }): Promise<void> {
    const request = task.request as unknown as QuestionTaskRequest
    try {
      const questions = await this.provider.expandQuestions(task.tenantId, { companyName: request.companyName, aliases: request.aliases, industry: request.industry, coreBusiness: request.coreBusiness, keyword: request.keywordName, count: request.count })
      const created = await this.commitQuestions(task.id, questions)
      await this.finish(task.id, created < task.totalCount ? '模型返回的问题词不足或存在重复，未使用额度已退回' : null)
    } catch (reason) {
      await this.finish(task.id, this.safeFailure(reason))
    }
  }

  private async articleSnapshot(tx: Prisma.TransactionClient, tenantId: string, data: { keywordId: string; knowledgeLibraryId: string | null; galleryId: string | null; imageCount: number; instructionId: string | null; contentDirection: ArticleTaskDirection; count: number }): Promise<ArticleTaskRequest> {
    const [keyword, library, gallery, tenant, instruction] = await Promise.all([
      tx.keyword.findFirst({ where: { id: data.keywordId, tenantId, status: KeywordStatus.ENABLED, deletedAt: null } }),
      data.knowledgeLibraryId ? tx.knowledgeLibrary.findFirst({ where: { id: data.knowledgeLibraryId, tenantId, deletedAt: null } }) : Promise.resolve(null),
      data.galleryId ? tx.gallery.findFirst({ where: { id: data.galleryId, tenantId, deletedAt: null }, include: { images: { where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } } } }) : Promise.resolve(null),
      tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      data.instructionId ? tx.writingInstruction.findFirst({ where: { id: data.instructionId, tenantId, deletedAt: null } }) : null,
    ])
    if (!keyword || !tenant) throw new ConflictException({ code: 'AI_TASK_INPUT_INVALID', message: '关键词或商户账户不存在、已删除或不可用' })
    if (data.knowledgeLibraryId && !library) throw new ConflictException({ code: 'AI_TASK_INPUT_INVALID', message: '所选企业信息库不存在或已删除' })
    if (data.galleryId && !gallery) throw new ConflictException({ code: 'AI_TASK_INPUT_INVALID', message: '所选企业图库不存在或已删除' })
    if (gallery && gallery.images.length < data.imageCount) throw new ConflictException({ code: 'AI_GALLERY_IMAGES_INSUFFICIENT', message: '所选图库图片不足，不能满足每篇配图数量' })
    if (data.instructionId && !instruction) throw new ConflictException({ code: 'AI_TASK_INPUT_INVALID', message: '创作指令不存在或已删除' })
    const questions = await tx.question.findMany({ where: { tenantId, keywordId: keyword.id, status: KeywordStatus.ENABLED, articleCreated: false, deletedAt: null }, orderBy: { createdAt: 'asc' }, take: data.count, select: { id: true, text: true } })
    if (questions.length < data.count) throw new ConflictException({ code: 'AI_QUESTION_INSUFFICIENT', message: '可创作问题词不足，请减少篇数或先拓展问题词' })
    const questionsWithDirection = questions.map((question, index) => ({ ...question, contentDirection: data.contentDirection === 'mixed' ? ARTICLE_DIRECTIONS[index % ARTICLE_DIRECTIONS.length]! : data.contentDirection }))
    const keywordBrandTerms = jsonStringArray(keyword.brandTerms)
    const companyName = library?.companyName || keywordBrandTerms[0] || tenant.name
    const renderedInstruction = renderWritingInstruction(instruction?.content ?? DEFAULT_WRITING_INSTRUCTION, keyword.name, companyName)
    const aliases = library?.brandAlias ? [library.brandAlias] : keywordBrandTerms.slice(1)
    return { keywordId: keyword.id, keywordName: keyword.name, knowledgeLibraryId: library?.id ?? null, knowledgeName: library?.name ?? '', knowledgeContent: library?.content ?? '', galleryId: gallery?.id ?? null, galleryImageIds: gallery?.images.map((image) => image.id) ?? [], imageCount: data.imageCount, instructionId: instruction?.id ?? null, instruction: renderedInstruction, contentDirection: data.contentDirection, factMode: library ? 'enriched' : 'basic', companyName, aliases, industry: '', coreBusiness: library?.productServices ?? '', introduction: library?.brandStory ?? '', questions: questionsWithDirection }
  }

  private async questionSnapshot(tx: Prisma.TransactionClient, tenantId: string, keywordId: string, count: number): Promise<QuestionTaskRequest> {
    const [keyword, tenant] = await Promise.all([
      tx.keyword.findFirst({ where: { id: keywordId, tenantId, status: KeywordStatus.ENABLED, deletedAt: null } }),
      tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ])
    if (!keyword || !tenant) throw new ConflictException({ code: 'AI_TASK_INPUT_INVALID', message: '关键词或商户账户不存在、已删除或不可用' })
    const brandTerms = jsonStringArray(keyword.brandTerms)
    return { keywordId: keyword.id, keywordName: keyword.name, companyName: brandTerms[0] || tenant.name, aliases: brandTerms.slice(1), industry: '', coreBusiness: '', count }
  }

  private async commitArticle(taskId: string, question: { id: string; text: string }, generated: { title: string; content: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiGenerationTask.updateMany({ where: { id: taskId, status: AiTaskStatus.RUNNING }, data: { updatedAt: new Date() } })
      if (!claimed.count) return
      const task = await tx.aiGenerationTask.findUnique({ where: { id: taskId } })
      if (!task) return
      const request = task.request as unknown as ArticleTaskRequest
      const liveQuestion = await tx.question.findFirst({ where: { id: question.id, tenantId: task.tenantId, deletedAt: null } })
      if (!liveQuestion) throw new ConflictException({ code: 'AI_QUESTION_UNAVAILABLE', message: '问题词已不可用' })
      const existing = await tx.article.findUnique({ where: { questionId: question.id } })
      if (existing) return
      const content = sanitizeArticleContent(generated.content)
      if (content.length < 20) throw new ConflictException({ code: 'AI_ARTICLE_CONTENT_INVALID', message: '模型返回的文章正文清洗后为空或过短' })
      const galleryImageIds = this.selectImageIds(request.galleryImageIds, request.imageCount, question.id)
      const article = await tx.article.create({ data: { tenantId: task.tenantId, title: generated.title, content, source: ArticleSource.AI_GENERATED, status: ArticleStatus.PUBLISHABLE, keywordId: request.keywordId, questionId: question.id, knowledgeLibraryIds: request.knowledgeLibraryId ? [request.knowledgeLibraryId] : [], galleryId: request.galleryId, imageCount: request.imageCount, galleryImageIds, instructionId: request.instructionId } })
      await tx.articleVersion.create({ data: { articleId: article.id, tenantId: article.tenantId, version: article.currentVersion, title: article.title, content: article.content, source: article.source, status: article.status, knowledgeLibraryIds: article.knowledgeLibraryIds as Prisma.InputJsonValue, galleryId: article.galleryId, imageCount: article.imageCount, galleryImageIds, instructionId: article.instructionId } })
      await tx.question.update({ where: { id: question.id }, data: { articleCreated: true } })
      await tx.quotaBalance.update({ where: { tenantId: task.tenantId }, data: { computePointsReserved: { decrement: 30 }, writingReserved: { decrement: 1 }, computePointsAvailable: { decrement: 30 }, computePointsConsumed: { increment: 30 }, writingUsed: { increment: 1 } } })
      await tx.entitlementLedger.createMany({ data: [
        { targetTenantId: task.tenantId, type: EntitlementEntryType.COMPUTE_CONSUME, quantity: 30, idempotencyKey: `ai:${task.id}:question:${question.id}:compute`, detail: { taskId: task.id, questionId: question.id } },
        { targetTenantId: task.tenantId, type: EntitlementEntryType.WRITING_CONSUME, quantity: 1, idempotencyKey: `ai:${task.id}:question:${question.id}:writing`, detail: { taskId: task.id, questionId: question.id } },
      ] })
      await tx.aiGenerationTask.update({ where: { id: task.id }, data: { completedCount: { increment: 1 } } })
    }, { isolationLevel: 'Serializable' })
  }

  private async commitQuestions(taskId: string, values: string[]): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiGenerationTask.updateMany({ where: { id: taskId, status: AiTaskStatus.RUNNING, type: AiTaskType.QUESTION_EXPANSION }, data: { updatedAt: new Date() } })
      if (!claimed.count) return 0
      const task = await tx.aiGenerationTask.findUnique({ where: { id: taskId } })
      if (!task) return 0
      const request = task.request as unknown as QuestionTaskRequest
      const unique = new Map<string, string>()
      for (const value of values) {
        const text = value.trim()
        const normalized = normalizeQuestion(text)
        if (text.length >= 6 && text.length <= 180 && normalized.length >= 6 && !unique.has(normalized)) unique.set(normalized, text)
      }
      const texts = [...unique.values()].slice(0, task.totalCount)
      if (!texts.length) return 0
      const result = await tx.question.createMany({ data: texts.map((text) => ({ tenantId: task.tenantId, keywordId: request.keywordId, text, normalizedText: normalizeQuestion(text) })), skipDuplicates: true })
      if (!result.count) return 0
      await tx.quotaBalance.update({ where: { tenantId: task.tenantId }, data: { computePointsReserved: { decrement: result.count }, computePointsAvailable: { decrement: result.count }, computePointsConsumed: { increment: result.count } } })
      await tx.entitlementLedger.create({ data: { targetTenantId: task.tenantId, type: EntitlementEntryType.COMPUTE_CONSUME, quantity: result.count, idempotencyKey: `ai:${task.id}:questions:compute`, detail: { taskId: task.id, createdCount: result.count } } })
      await tx.aiGenerationTask.update({ where: { id: task.id }, data: { completedCount: { increment: result.count } } })
      return result.count
    }, { isolationLevel: 'Serializable' })
  }

  private async finish(taskId: string, failure: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiGenerationTask.updateMany({ where: { id: taskId, status: AiTaskStatus.RUNNING }, data: { updatedAt: new Date() } })
      if (!claimed.count) return
      const task = await tx.aiGenerationTask.findUnique({ where: { id: taskId } })
      if (!task) return
      const failed = Math.max(task.totalCount - task.completedCount, 0)
      const status = failed === 0 ? AiTaskStatus.SUCCEEDED : task.completedCount > 0 ? AiTaskStatus.PARTIALLY_FAILED : AiTaskStatus.FAILED
      await tx.aiGenerationTask.update({ where: { id: task.id }, data: { status, failedCount: failed, failureReason: failure, completedAt: new Date(), result: { completed: task.completedCount, failed } } })
      await this.releaseReservation(tx, task, status.toLowerCase())
    }, { isolationLevel: 'Serializable' })
  }

  private async releaseAfterQueueFailure(taskId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiGenerationTask.updateMany({
        where: { id: taskId, status: AiTaskStatus.QUEUED },
        data: { status: AiTaskStatus.FAILED, failureReason: '任务队列不可用', completedAt: new Date() },
      })
      if (!claimed.count) return
      const task = await tx.aiGenerationTask.findUnique({ where: { id: taskId } })
      if (!task) return
      await tx.aiGenerationTask.update({ where: { id: task.id }, data: { failedCount: task.totalCount } })
      await this.releaseReservation(tx, task, 'queue_unavailable')
    }, { isolationLevel: 'Serializable' })
  }

  private async releaseReservation(tx: Prisma.TransactionClient, task: { id: string; tenantId: string; type: AiTaskType; completedCount: number; computePointsReserved: number; writingReserved: number }, reason: string): Promise<void> {
    const computePerSuccess = task.type === AiTaskType.ARTICLE_WRITING ? 30 : 1
    const writingPerSuccess = task.type === AiTaskType.ARTICLE_WRITING ? 1 : 0
    const compute = Math.max(task.computePointsReserved - task.completedCount * computePerSuccess, 0)
    const writing = Math.max(task.writingReserved - task.completedCount * writingPerSuccess, 0)
    if (compute || writing) await tx.quotaBalance.update({ where: { tenantId: task.tenantId }, data: { computePointsReserved: { decrement: compute }, writingReserved: { decrement: writing } } })
    await tx.aiGenerationTask.update({ where: { id: task.id }, data: { computePointsReserved: 0, writingReserved: 0 } })
    await tx.auditLog.create({ data: { tenantId: task.tenantId, action: 'ai_task.reservation_released', entityType: 'AiGenerationTask', entityId: task.id, detail: { reason, compute, writing } } })
  }

  private articleInput(input: ArticleTaskInput) {
    const keywordId = typeof input.keywordId === 'string' ? input.keywordId : ''
    const knowledgeLibraryId = typeof input.knowledgeLibraryId === 'string' && input.knowledgeLibraryId ? input.knowledgeLibraryId : null
    const galleryId = typeof input.galleryId === 'string' && input.galleryId ? input.galleryId : null
    const instructionId = typeof input.instructionId === 'string' && input.instructionId ? input.instructionId : null
    const contentDirection = typeof input.contentDirection === 'string' && ARTICLE_TASK_DIRECTIONS.includes(input.contentDirection as ArticleTaskDirection) ? input.contentDirection as ArticleTaskDirection : 'mixed'
    const imageCount = typeof input.imageCount === 'number' && Number.isInteger(input.imageCount) ? input.imageCount : 0
    const count = typeof input.count === 'number' && Number.isInteger(input.count) ? input.count : 0
    if (!keywordId || ![0, 1, 2, 3].includes(imageCount) || (!galleryId && imageCount !== 0) || count < 1 || count > 100) throw new ConflictException({ code: 'AI_TASK_INPUT_INVALID', message: '请填写关键词和1-100篇创作数量；未选图库时配图必须为0，选择图库后可设置0-3张配图' })
    return { keywordId, knowledgeLibraryId, galleryId, imageCount, instructionId, contentDirection, count }
  }

  private questionCount(input: QuestionTaskInput): number {
    const count = typeof input.count === 'number' && Number.isInteger(input.count) ? input.count : 0
    if (count < 1 || count > 20) throw new ConflictException({ code: 'AI_TASK_INPUT_INVALID', message: '问题词拓展数量为 1 到 20' })
    return count
  }

  private articleRequest(value: Prisma.JsonValue): ArticleTaskRequest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConflictException({ code: 'AI_TASK_SNAPSHOT_INVALID', message: '创作任务快照无效，不能重试' })
    const request = value as unknown as ArticleTaskRequest
    if (!Array.isArray(request.questions) || !request.questions.every((question) => typeof question?.id === 'string' && typeof question.text === 'string')) throw new ConflictException({ code: 'AI_TASK_SNAPSHOT_INVALID', message: '创作任务问题快照无效，不能重试' })
    return request
  }
  private view(row: { id: string; type: AiTaskType; status: AiTaskStatus; request?: Prisma.JsonValue; totalCount: number; completedCount: number; failedCount: number; computePointsReserved: number; writingReserved: number; failureReason: string | null; createdAt: Date; startedAt: Date | null; completedAt: Date | null }) {
    const retryOfTaskId = row.type === AiTaskType.ARTICLE_WRITING && row.request ? this.articleRequest(row.request).retryOfTaskId ?? null : null
    return { id: row.id, type: row.type.toLowerCase(), status: row.status.toLowerCase(), totalCount: row.totalCount, completedCount: row.completedCount, failedCount: row.failedCount, computePointsReserved: row.computePointsReserved, writingReserved: row.writingReserved, failureReason: row.failureReason, retryOfTaskId, createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null }
  }
  private selectImageIds(ids: string[], count: number, seed: string): string[] {
    if (count === 0) return []
    if (ids.length < count) throw new ConflictException({ code: 'AI_GALLERY_IMAGES_INSUFFICIENT', message: '创作任务的图片快照不足，不能生成文章' })
    const start = createHash('sha256').update(seed).digest().readUInt32BE(0) % ids.length
    return Array.from({ length: count }, (_, index) => ids[(start + index) % ids.length]).filter((id): id is string => Boolean(id))
  }
  private resolveArticleDirection(request: ArticleTaskRequest, question: ArticleTaskRequest['questions'][number], index: number): ArticleContentDirection {
    if (question.contentDirection && ARTICLE_DIRECTIONS.includes(question.contentDirection)) return question.contentDirection
    if (request.contentDirection && request.contentDirection !== 'mixed' && ARTICLE_DIRECTIONS.includes(request.contentDirection)) return request.contentDirection
    return ARTICLE_DIRECTIONS[index % ARTICLE_DIRECTIONS.length]!
  }
  private safeFailure(reason: unknown): string { return reason instanceof ConflictException ? (reason.getResponse() as { message?: string }).message?.slice(0, 160) ?? '任务执行失败' : '任务执行失败，请由贴牌检查模型配置和可用额度' }
  private isSerializationConflict(reason: unknown): boolean { return typeof reason === 'object' && reason !== null && 'code' in reason && (reason as { code?: unknown }).code === 'P2034' }
}
