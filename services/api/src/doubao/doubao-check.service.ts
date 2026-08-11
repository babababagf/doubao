import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'

import { AccountStatus, DoubaoApiStatus, DoubaoCheckBatchScope, DoubaoCheckBatchStatus, KeywordStatus, TenantKind, UserRole } from '../generated/prisma/client'
import type { AdminActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { DoubaoProviderService } from './doubao-provider.service'
import { DoubaoCheckQueueService } from './doubao-check-queue.service'

type CreateInput = { merchantId?: unknown; all?: unknown; confirmedAll?: unknown }
const terminal: DoubaoCheckBatchStatus[] = [DoubaoCheckBatchStatus.SUCCEEDED, DoubaoCheckBatchStatus.PARTIALLY_FAILED, DoubaoCheckBatchStatus.FAILED]
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')

@Injectable()
export class DoubaoCheckService {
  constructor(private readonly prisma: PrismaService, private readonly queue: DoubaoCheckQueueService, private readonly provider: DoubaoProviderService) {}

  async create(actor: AdminActor, input: CreateInput, idempotencyKey: string): Promise<object> {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN || !actor.tenantId) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '只有贴牌可发起豆包检测，代理和商户只能查看结果' })
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: '请提供 8-100 位的 Idempotency-Key，避免重复创建检测任务' })
    const all = input.all === true
    const merchantId = typeof input.merchantId === 'string' ? input.merchantId : ''
    if (all === Boolean(merchantId)) throw new ConflictException({ code: 'DOUBAO_CHECK_SCOPE_INVALID', message: '请选择一个商户，或选择全部商户检测' })
    if (all && input.confirmedAll !== true) throw new ConflictException({ code: 'DOUBAO_CHECK_CONFIRM_REQUIRED', message: '批量检测会产生贴牌接口调用费用，请确认后再提交' })
    const provider = await this.provider.available(actor.tenantId)
    const tenants = await this.prisma.tenant.findMany({
      where: all ? { whiteLabelId: actor.tenantId, kind: TenantKind.MERCHANT, status: AccountStatus.ACTIVE, expiresAt: { gt: new Date() }, closedAt: null } : { id: merchantId, whiteLabelId: actor.tenantId, kind: TenantKind.MERCHANT, status: AccountStatus.ACTIVE, expiresAt: { gt: new Date() }, closedAt: null },
      include: { profile: true, questions: { where: { status: KeywordStatus.ENABLED, deletedAt: null }, select: { id: true, text: true } } },
    })
    if (!tenants.length) throw new NotFoundException({ code: 'DOUBAO_CHECK_MERCHANT_NOT_FOUND', message: '没有可检测的有效商户' })
    const items = tenants.flatMap((tenant) => tenant.questions.map((question) => ({ tenantId: tenant.id, questionId: question.id, question: question.text })))
    if (!items.length) throw new ConflictException({ code: 'DOUBAO_CHECK_QUESTION_EMPTY', message: '所选商户没有启用的问题词，不能发起检测' })
    const key = `doubao:${actor.tenantId}:${idempotencyKey}`
    const { batch, created } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.doubaoCheckBatch.findUnique({ where: { idempotencyKey: key } })
      if (existing) return { batch: existing, created: false }
      const activeDuplicateCount = await tx.doubaoCheckResult.count({
        where: {
          batch: { whiteLabelId: actor.tenantId!, providerConfigId: provider.id, status: { in: [DoubaoCheckBatchStatus.QUEUED, DoubaoCheckBatchStatus.RUNNING] } },
          OR: items.map((item) => ({ tenantId: item.tenantId, questionId: item.questionId })),
        },
      })
      if (activeDuplicateCount) throw new ConflictException({ code: 'DOUBAO_CHECK_ALREADY_RUNNING', message: `已有 ${activeDuplicateCount} 个相同问题正在检测，请等待当前批次完成后再提交` })
      const createdBatch = await tx.doubaoCheckBatch.create({ data: { whiteLabelId: actor.tenantId!, scope: all ? DoubaoCheckBatchScope.ALL_MERCHANTS : DoubaoCheckBatchScope.SINGLE_MERCHANT, idempotencyKey: key, providerConfigId: provider.id, providerAlias: provider.alias, providerModel: provider.modelName, targetMerchantCount: tenants.length, totalCount: items.length, requestedByUserId: actor.userId } })
      await tx.doubaoCheckResult.createMany({ data: items.map((item) => ({ ...item, batchId: createdBatch.id, answer: '', matched: false, apiStatus: DoubaoApiStatus.PENDING })) })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId!, actorUserId: actor.userId, actorTenantId: actor.tenantId!, action: 'doubao_check.batch.created', entityType: 'DoubaoCheckBatch', entityId: createdBatch.id, detail: { scope: createdBatch.scope.toLowerCase(), merchantCount: tenants.length, questionCount: items.length, providerId: provider.id, providerAlias: provider.alias } } })
      return { batch: createdBatch, created: true }
    }, { isolationLevel: 'Serializable' })
    if (created) {
      try { await this.queue.enqueue(batch.id) } catch { await this.failQueue(batch.id); throw new ConflictException({ code: 'DOUBAO_CHECK_QUEUE_UNAVAILABLE', message: '检测任务队列不可用，未产生检测结果，请稍后重试' }) }
    }
    return this.view(batch)
  }

  async list(actor: AdminActor): Promise<object[]> {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN || !actor.tenantId) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '只有贴牌可查看检测批次' })
    const rows = await this.prisma.doubaoCheckBatch.findMany({ where: { whiteLabelId: actor.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 })
    return rows.map((row) => this.view(row))
  }

  async listFailures(actor: AdminActor, batchId: string): Promise<object[]> {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN || !actor.tenantId) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '只有贴牌可查看检测失败明细' })
    const batch = await this.prisma.doubaoCheckBatch.findFirst({ where: { id: batchId, whiteLabelId: actor.tenantId } })
    if (!batch) throw new NotFoundException({ code: 'DOUBAO_CHECK_BATCH_NOT_FOUND', message: '检测批次不存在或不属于当前贴牌' })
    const rows = await this.prisma.doubaoCheckResult.findMany({ where: { batchId, apiStatus: DoubaoApiStatus.FAILED }, include: { tenant: { select: { name: true } } }, orderBy: { checkedAt: 'desc' }, take: 500 })
    return rows.map((row) => ({ id: row.id, merchantName: row.tenant.name, question: row.question, failureReason: row.failureReason ?? '检测调用失败', checkedAt: row.checkedAt?.toISOString() ?? null }))
  }

  async retryFailures(actor: AdminActor, batchId: string, idempotencyKey: string): Promise<object> {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN || !actor.tenantId) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '只有贴牌可重试失败的豆包检测项' })
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: '请提供 8-100 位的 Idempotency-Key，避免重复创建检测重试任务' })
    const original = await this.prisma.doubaoCheckBatch.findFirst({ where: { id: batchId, whiteLabelId: actor.tenantId, status: { in: terminal } } })
    if (!original) throw new NotFoundException({ code: 'DOUBAO_CHECK_BATCH_NOT_RETRYABLE', message: '检测批次不存在、尚未结束或不属于当前贴牌' })
    const failures = await this.prisma.doubaoCheckResult.findMany({ where: { batchId, apiStatus: DoubaoApiStatus.FAILED }, select: { tenantId: true, questionId: true, question: true } })
    const items = failures.filter((row): row is { tenantId: string; questionId: string; question: string } => Boolean(row.questionId && row.question.trim())).map((row) => ({ tenantId: row.tenantId, questionId: row.questionId, question: row.question }))
    if (!items.length) throw new ConflictException({ code: 'DOUBAO_CHECK_RETRY_EMPTY', message: '该批次没有可重试的失败问题词' })
    const provider = await this.provider.available(actor.tenantId)
    const key = `doubao-retry:${actor.tenantId}:${batchId}:${idempotencyKey}`
    const { batch, created } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.doubaoCheckBatch.findUnique({ where: { idempotencyKey: key } })
      if (existing) return { batch: existing, created: false }
      const activeDuplicateCount = await tx.doubaoCheckResult.count({
        where: {
          batch: { whiteLabelId: actor.tenantId!, providerConfigId: provider.id, status: { in: [DoubaoCheckBatchStatus.QUEUED, DoubaoCheckBatchStatus.RUNNING] } },
          OR: items.map((item) => ({ tenantId: item.tenantId, questionId: item.questionId })),
        },
      })
      if (activeDuplicateCount) throw new ConflictException({ code: 'DOUBAO_CHECK_ALREADY_RUNNING', message: `已有 ${activeDuplicateCount} 个失败问题正在检测，请等待当前批次完成后再重试` })
      const createdBatch = await tx.doubaoCheckBatch.create({ data: { whiteLabelId: actor.tenantId!, scope: original.scope, idempotencyKey: key, providerConfigId: provider.id, providerAlias: provider.alias, providerModel: provider.modelName, targetMerchantCount: new Set(items.map((item) => item.tenantId)).size, totalCount: items.length, requestedByUserId: actor.userId } })
      await tx.doubaoCheckResult.createMany({ data: items.map((item) => ({ ...item, batchId: createdBatch.id, answer: '', matched: false, apiStatus: DoubaoApiStatus.PENDING })) })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId!, actorUserId: actor.userId, actorTenantId: actor.tenantId!, action: 'doubao_check.batch.retry_created', entityType: 'DoubaoCheckBatch', entityId: createdBatch.id, detail: { retryOfBatchId: batchId, failedQuestionCount: items.length, providerId: provider.id, providerAlias: provider.alias } } })
      return { batch: createdBatch, created: true }
    }, { isolationLevel: 'Serializable' })
    if (created) {
      try { await this.queue.enqueue(batch.id) } catch { await this.failQueue(batch.id); throw new ConflictException({ code: 'DOUBAO_CHECK_QUEUE_UNAVAILABLE', message: '失败项重试队列不可用，未产生检测结果，请稍后重试' }) }
    }
    return this.view(batch)
  }

  async execute(batchId: string): Promise<void> {
    const initial = await this.prisma.doubaoCheckBatch.findUnique({ where: { id: batchId }, select: { status: true } })
    if (!initial || (initial.status !== DoubaoCheckBatchStatus.QUEUED && initial.status !== DoubaoCheckBatchStatus.RUNNING)) return
    if (initial.status === DoubaoCheckBatchStatus.QUEUED) {
      const claimed = await this.prisma.doubaoCheckBatch.updateMany({ where: { id: batchId, status: DoubaoCheckBatchStatus.QUEUED }, data: { status: DoubaoCheckBatchStatus.RUNNING, startedAt: new Date() } })
      if (!claimed.count) return
    }
    // 队列重试仅接管进程中断留下的 RUNNING 批次；单 Worker 和固定 jobId 防止正常重复并发。
    const batch = await this.prisma.doubaoCheckBatch.findUnique({ where: { id: batchId } })
    if (!batch) return
    const rows = await this.prisma.doubaoCheckResult.findMany({ where: { batchId, apiStatus: { in: [DoubaoApiStatus.PENDING, DoubaoApiStatus.RUNNING] } }, include: { tenant: { include: { profile: true } } }, orderBy: { id: 'asc' } })
    for (const row of rows) {
      const live = await this.prisma.doubaoCheckBatch.findUnique({ where: { id: batchId }, select: { status: true } })
      if (!live || terminal.includes(live.status)) return
      await this.prisma.doubaoCheckResult.update({ where: { id: row.id }, data: { apiStatus: DoubaoApiStatus.RUNNING } })
      try {
        const result = await this.provider.search(batch.whiteLabelId, batch.providerConfigId, row.question)
        const matchedName = this.match(result.answer, row.tenant.profile?.companyName ?? row.tenant.name, row.tenant.profile?.aliases)
        await this.prisma.$transaction(async (tx) => {
          await tx.doubaoCheckResult.update({ where: { id: row.id }, data: { answer: result.answer, sources: result.sources, matched: Boolean(matchedName), matchedName, apiStatus: DoubaoApiStatus.SUCCEEDED, checkedAt: new Date(), failureReason: null } })
          await tx.question.update({ where: { id: row.questionId! }, data: { checkedAt: new Date() } })
          await tx.doubaoCheckBatch.update({ where: { id: batchId }, data: { completedCount: { increment: 1 }, successfulCount: { increment: 1 }, ...(matchedName ? { matchedCount: { increment: 1 } } : {}) } })
        })
      } catch (error) {
        const reason = error instanceof ConflictException ? ((error.getResponse() as { message?: string }).message ?? '检测调用失败') : '检测调用失败，请由贴牌检查模型配置和联网搜索服务'
        await this.prisma.$transaction(async (tx) => {
          await tx.doubaoCheckResult.update({ where: { id: row.id }, data: { apiStatus: DoubaoApiStatus.FAILED, failureReason: reason.slice(0, 300), checkedAt: new Date() } })
          await tx.doubaoCheckBatch.update({ where: { id: batchId }, data: { completedCount: { increment: 1 }, failedCount: { increment: 1 } } })
        })
      }
    }
    const done = await this.prisma.doubaoCheckBatch.findUnique({ where: { id: batchId } })
    if (!done || done.status !== DoubaoCheckBatchStatus.RUNNING) return
    if (done.completedCount !== done.totalCount) {
      await this.prisma.doubaoCheckBatch.update({ where: { id: batchId }, data: { status: DoubaoCheckBatchStatus.FAILED, completedAt: new Date(), failureReason: '检测结果状态不完整，已停止，避免错误统计为成功' } })
      return
    }
    const status = done.failedCount === 0 ? DoubaoCheckBatchStatus.SUCCEEDED : done.successfulCount > 0 ? DoubaoCheckBatchStatus.PARTIALLY_FAILED : DoubaoCheckBatchStatus.FAILED
    await this.prisma.doubaoCheckBatch.update({ where: { id: batchId }, data: { status, completedAt: new Date(), failureReason: status === DoubaoCheckBatchStatus.FAILED ? '所有问题检测失败，请检查贴牌模型和联网搜索服务' : null } })
  }

  private async failQueue(batchId: string): Promise<void> { await this.prisma.doubaoCheckBatch.updateMany({ where: { id: batchId, status: DoubaoCheckBatchStatus.QUEUED }, data: { status: DoubaoCheckBatchStatus.FAILED, failureReason: '检测任务队列不可用', completedAt: new Date(), failedCount: 0 } }) }
  private match(answer: string, companyName: string, aliases: unknown): string | null { const values = [companyName, ...(Array.isArray(aliases) ? aliases.filter((item): item is string => typeof item === 'string') : [])].map((value) => value.trim()).filter((value) => value.length >= 2).sort((a, b) => b.length - a.length); const text = normalize(answer); return values.find((value) => text.includes(normalize(value))) ?? null }
  private view(row: { id: string; scope: DoubaoCheckBatchScope; status: DoubaoCheckBatchStatus; providerAlias: string; providerModel: string; targetMerchantCount: number; totalCount: number; completedCount: number; successfulCount: number; failedCount: number; matchedCount: number; failureReason: string | null; createdAt: Date; startedAt: Date | null; completedAt: Date | null }) { return { id: row.id, scope: row.scope.toLowerCase(), status: row.status.toLowerCase(), providerAlias: row.providerAlias, providerModel: row.providerModel, targetMerchantCount: row.targetMerchantCount, totalCount: row.totalCount, completedCount: row.completedCount, successfulCount: row.successfulCount, failedCount: row.failedCount, matchedCount: row.matchedCount, failureReason: row.failureReason, createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null } }
}
