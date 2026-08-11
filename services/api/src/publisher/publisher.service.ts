import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { isIP } from 'node:net'

import { MediaAccountStatus, MediaPlatform, PublishAttentionReason, PublishTaskStatus } from '../generated/prisma/client'
import type { PublisherActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'

const platformToDb = { toutiao: MediaPlatform.TOUTIAO, douyin: MediaPlatform.DOUYIN } as const
const platformFromDb: Record<MediaPlatform, 'toutiao' | 'douyin'> = { [MediaPlatform.TOUTIAO]: 'toutiao', [MediaPlatform.DOUYIN]: 'douyin' }
const attentionReasonToDb = {
  login_required: PublishAttentionReason.LOGIN_REQUIRED,
  captcha_required: PublishAttentionReason.CAPTCHA_REQUIRED,
  manual_confirmation: PublishAttentionReason.MANUAL_CONFIRMATION,
  platform_changed: PublishAttentionReason.PLATFORM_CHANGED,
  assets_missing: PublishAttentionReason.ASSETS_MISSING,
  content_invalid: PublishAttentionReason.CONTENT_INVALID,
  fill_failed: PublishAttentionReason.FILL_FAILED,
  submission_unknown: PublishAttentionReason.SUBMISSION_UNKNOWN,
  submission_rejected: PublishAttentionReason.SUBMISSION_REJECTED,
} as const
const attentionReasonMessage: Record<PublishAttentionReason, string> = {
  [PublishAttentionReason.LOGIN_REQUIRED]: '本机平台登录已失效，需要重新扫码验证',
  [PublishAttentionReason.CAPTCHA_REQUIRED]: '平台要求验证码或安全验证，需要用户在本机处理',
  [PublishAttentionReason.MANUAL_CONFIRMATION]: '内容已填写，等待用户在平台最终确认发布',
  [PublishAttentionReason.PLATFORM_CHANGED]: '平台页面或发布流程发生变化，需要人工处理',
  [PublishAttentionReason.ASSETS_MISSING]: '文章配图快照缺失或源图片不可用，需要人工补齐后重新创建发布任务',
  [PublishAttentionReason.CONTENT_INVALID]: '文章标题或正文不符合平台发布要求，需要人工修改后重新创建任务',
  [PublishAttentionReason.FILL_FAILED]: '平台编辑器未确认完整写入内容，需要人工核对页面或适配器',
  [PublishAttentionReason.SUBMISSION_UNKNOWN]: '已触发平台最终提交但结果未知，禁止自动重试，请人工核验平台作品状态',
  [PublishAttentionReason.SUBMISSION_REJECTED]: '平台明确拒绝本次发布，请人工检查内容或账号状态后处理',
  [PublishAttentionReason.LEASE_EXPIRED]: '发布助手执行租约已过期，执行阶段不明，禁止自动重试，请人工核验平台作品状态',
}
const resumableAttentionReasons = new Set<PublishAttentionReason>([
  PublishAttentionReason.LOGIN_REQUIRED,
  PublishAttentionReason.CAPTCHA_REQUIRED,
])
const publishedEvidenceAttentionReasons = new Set<PublishAttentionReason>([
  PublishAttentionReason.MANUAL_CONFIRMATION,
  PublishAttentionReason.SUBMISSION_UNKNOWN,
  PublishAttentionReason.LEASE_EXPIRED,
])
const leaseExpiredReason = attentionReasonMessage[PublishAttentionReason.LEASE_EXPIRED]
const taskLeaseMs = 10 * 60 * 1000

@Injectable()
export class PublisherService {
  constructor(private readonly prisma: PrismaService) {}

  async getBootstrap(actor: PublisherActor): Promise<object> {
    await this.promoteDueScheduledTasks(actor.tenantId)
    const [accounts, queuedCount, activeCount] = await Promise.all([
      this.prisma.mediaAccount.findMany({ where: { tenantId: actor.tenantId }, include: { sessionBackup: { select: { capturedAt: true, revokedAt: true } } }, orderBy: { platform: 'asc' } }),
      this.prisma.publishTask.count({ where: { tenantId: actor.tenantId, status: PublishTaskStatus.QUEUED, articleVersionId: { not: null }, mediaAccountId: { not: null } } }),
      this.prisma.publishTask.count({ where: { tenantId: actor.tenantId, status: { in: [PublishTaskStatus.RUNNING, PublishTaskStatus.ATTENTION] }, articleVersionId: { not: null }, mediaAccountId: { not: null } } }),
    ])
    const rows = accounts.map((account) => this.accountDto(account, platformFromDb[account.platform]))
    for (const platform of ['toutiao', 'douyin'] as const) if (!rows.some((account) => account.platform === platform)) rows.push(this.accountDto(undefined, platform))
    return { username: actor.username, queuedCount, activeCount, finalPublicationMode: 'automatic_submission_with_attention_fallback', accounts: rows }
  }

  async listTasks(actor: PublisherActor): Promise<object[]> {
    await this.recoverExpiredLeases(actor.tenantId)
    await this.promoteDueScheduledTasks(actor.tenantId)
    const rows = await this.prisma.publishTask.findMany({
      where: {
        tenantId: actor.tenantId,
        articleVersionId: { not: null },
        mediaAccountId: { not: null },
        OR: [
          { status: { in: [PublishTaskStatus.QUEUED, PublishTaskStatus.ATTENTION] } },
          { status: PublishTaskStatus.RUNNING, leaseDeviceId: actor.publisherDeviceId },
        ],
      },
      include: { articleVersion: true, mediaAccount: true }, orderBy: { createdAt: 'asc' }, take: 100,
    })
    return rows.flatMap((row) => row.articleVersion ? [this.taskDto(row)] : [])
  }

  async claimTask(actor: PublisherActor, taskId: string): Promise<object> {
    await this.recoverExpiredLeases(actor.tenantId)
    await this.promoteDueScheduledTasks(actor.tenantId, taskId)
    const now = new Date()
    let claimed: { count: number }
    try {
      claimed = await this.prisma.publishTask.updateMany({
        where: { id: taskId, tenantId: actor.tenantId, articleVersionId: { not: null }, mediaAccountId: { not: null }, status: PublishTaskStatus.QUEUED },
        data: {
          status: PublishTaskStatus.RUNNING,
          failureReason: null,
          attentionReason: null,
          leaseDeviceId: actor.publisherDeviceId,
          leaseHeartbeatAt: now,
          leaseExpiresAt: this.leaseExpiry(now),
          attemptCount: { increment: 1 },
        },
      })
    } catch (error) {
      if (this.isUniqueConstraintFailure(error)) throw new ConflictException({ code: 'PUBLISH_WORKSPACE_BUSY', message: '当前商户已有执行中的发布任务，请等待完成或转人工处理后再领取下一条' })
      throw error
    }
    if (!claimed.count) throw new ConflictException({ code: 'PUBLISH_TASK_NOT_CLAIMABLE', message: '任务已被领取、已停止或不存在' })
    const row = await this.prisma.publishTask.findUnique({ where: { id: taskId }, include: { articleVersion: true, mediaAccount: true } })
    if (!row?.articleVersion) throw new NotFoundException({ code: 'PUBLISH_TASK_NOT_FOUND', message: '任务不存在或缺少文章版本快照' })
    return this.taskDto(row)
  }

  async taskImages(actor: PublisherActor, taskId: string): Promise<object> {
    const task = await this.prisma.publishTask.findFirst({
      where: { id: taskId, tenantId: actor.tenantId, articleVersionId: { not: null } },
      include: { articleVersion: { select: { galleryImageIds: true, imageCount: true } } },
    })
    if (!task?.articleVersion) throw new NotFoundException({ code: 'PUBLISH_TASK_NOT_FOUND', message: '任务不存在或缺少文章版本快照' })
    const imageIds = this.imageIds(task.articleVersion.galleryImageIds)
    if (!task.articleVersion.imageCount) return { requiredCount: 0, availability: 'not_required', images: [], missingImageIds: [] }
    if (imageIds.length !== task.articleVersion.imageCount) return { requiredCount: task.articleVersion.imageCount, availability: 'legacy_snapshot_missing', images: [], missingImageIds: [] }
    const rows = await this.prisma.galleryImage.findMany({
      where: { id: { in: imageIds }, deletedAt: null, publicUrl: { not: null }, gallery: { tenantId: actor.tenantId, deletedAt: null } },
      select: { id: true, fileName: true, mimeType: true, publicUrl: true },
    })
    const byId = new Map(rows.flatMap((image) => image.publicUrl ? [[image.id, image] as const] : []))
    const images = imageIds.flatMap((id) => {
      const image = byId.get(id)
      return image ? [{ id: image.id, fileName: image.fileName, mimeType: image.mimeType, url: image.publicUrl }] : []
    })
    const missingImageIds = imageIds.filter((id) => !byId.has(id))
    return { requiredCount: task.articleVersion.imageCount, availability: missingImageIds.length ? 'source_missing' : 'ready', images, missingImageIds }
  }

  async heartbeatTask(actor: PublisherActor, taskId: string): Promise<object> {
    const now = new Date()
    const updated = await this.prisma.publishTask.updateMany({
      where: {
        id: taskId,
        tenantId: actor.tenantId,
        articleVersionId: { not: null },
        status: PublishTaskStatus.RUNNING,
        leaseDeviceId: actor.publisherDeviceId,
        leaseExpiresAt: { gt: now },
      },
      data: { leaseHeartbeatAt: now, leaseExpiresAt: this.leaseExpiry(now) },
    })
    if (!updated.count) throw new ConflictException({ code: 'PUBLISH_TASK_LEASE_INVALID', message: '任务租约已失效或属于其他发布助手，请刷新任务后人工确认' })
    return this.loadTask(taskId)
  }

  async reportAttention(actor: PublisherActor, taskId: string, reason: unknown): Promise<object> {
    if (typeof reason !== 'string' || !(reason in attentionReasonToDb)) throw new ConflictException({ code: 'PUBLISH_ATTENTION_REASON_INVALID', message: '请选择有效的人工处理原因' })
    const dbReason = attentionReasonToDb[reason as keyof typeof attentionReasonToDb]
    const updated = await this.prisma.publishTask.updateMany({
      where: { id: taskId, tenantId: actor.tenantId, articleVersionId: { not: null }, status: PublishTaskStatus.RUNNING, leaseDeviceId: actor.publisherDeviceId },
      data: { status: PublishTaskStatus.ATTENTION, attentionReason: dbReason, failureReason: attentionReasonMessage[dbReason], leaseDeviceId: null, leaseHeartbeatAt: null, leaseExpiresAt: null },
    })
    if (!updated.count) throw new ConflictException({ code: 'PUBLISH_TASK_NOT_RUNNING', message: '仅执行中的任务可以标记为需人工处理' })
    return this.loadTask(taskId)
  }

  async resumeTask(actor: PublisherActor, taskId: string): Promise<object> {
    const task = await this.prisma.publishTask.findFirst({
      where: { id: taskId, tenantId: actor.tenantId, articleVersionId: { not: null }, status: PublishTaskStatus.ATTENTION },
      select: { attentionReason: true, mediaAccount: { select: { status: true } } },
    })
    if (!task) throw new ConflictException({ code: 'PUBLISH_TASK_NOT_RESUMABLE', message: '任务不在等待人工处理状态或无权访问' })
    if (!task.attentionReason || !resumableAttentionReasons.has(task.attentionReason)) throw new ConflictException({ code: 'PUBLISH_TASK_RESUME_UNSAFE', message: '该任务可能已提交、快照不可修复或结果不明，禁止继续自动发布' })
    if (task.mediaAccount?.status !== MediaAccountStatus.CONNECTED) throw new ConflictException({ code: 'PUBLISH_MEDIA_ACCOUNT_NOT_READY', message: '请先完成目标媒体账号验证并备份会话' })
    const originalReason = task.attentionReason
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.publishTask.updateMany({
        where: { id: taskId, tenantId: actor.tenantId, articleVersionId: { not: null }, status: PublishTaskStatus.ATTENTION, attentionReason: originalReason },
        data: { status: PublishTaskStatus.QUEUED, attentionReason: null, failureReason: null, leaseDeviceId: null, leaseHeartbeatAt: null, leaseExpiresAt: null },
      })
      if (!updated.count) throw new ConflictException({ code: 'PUBLISH_TASK_RESUME_CONFLICT', message: '任务状态已变化，请刷新后重试' })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'publish_task.resumed', entityType: 'PublishTask', entityId: taskId, detail: { attentionReason: originalReason.toLowerCase(), publisherDeviceId: actor.publisherDeviceId } } })
    })
    return this.loadTask(taskId)
  }

  async confirmTaskSuccess(actor: PublisherActor, taskId: string, resultUrl: unknown): Promise<object> {
    const task = await this.prisma.publishTask.findFirst({ where: { id: taskId, tenantId: actor.tenantId }, select: { platform: true } })
    if (!task) throw new NotFoundException({ code: 'PUBLISH_TASK_NOT_FOUND', message: '发布任务不存在或无权访问' })
    const normalizedUrl = this.publicationEvidenceUrl(resultUrl, task.platform)
    const now = new Date()
    const updated = await this.prisma.publishTask.updateMany({
      where: {
        id: taskId,
        tenantId: actor.tenantId,
        articleVersionId: { not: null },
        status: PublishTaskStatus.RUNNING,
        leaseDeviceId: actor.publisherDeviceId,
        leaseExpiresAt: { gt: now },
      },
      data: {
        status: PublishTaskStatus.SUCCEEDED,
        completedAt: now,
        resultUrl: normalizedUrl,
        failureReason: null,
        attentionReason: null,
        leaseDeviceId: null,
        leaseHeartbeatAt: null,
        leaseExpiresAt: null,
      },
    })
    if (!updated.count) throw new ConflictException({ code: 'PUBLISH_TASK_LEASE_INVALID', message: '任务租约已失效或不属于当前发布助手，请刷新后再确认' })
    return this.loadTask(taskId)
  }

  async resolveTaskAsPublished(actor: PublisherActor, taskId: string, resultUrl: unknown): Promise<object> {
    const task = await this.prisma.publishTask.findFirst({
      where: { id: taskId, tenantId: actor.tenantId },
      select: { platform: true, status: true, attentionReason: true, resultUrl: true },
    })
    if (!task) throw new NotFoundException({ code: 'PUBLISH_TASK_NOT_FOUND', message: '发布任务不存在或无权访问' })
    const normalizedUrl = this.publicationEvidenceUrl(resultUrl, task.platform)
    if (task.status === PublishTaskStatus.SUCCEEDED && task.resultUrl === normalizedUrl) return this.loadTask(taskId)
    if (task.status !== PublishTaskStatus.ATTENTION || !task.attentionReason || !publishedEvidenceAttentionReasons.has(task.attentionReason)) {
      throw new ConflictException({ code: 'PUBLISH_TASK_EVIDENCE_NOT_ALLOWED', message: '仅提交结果不明、租约过期或历史人工确认任务可通过官方作品链接核验为已发布' })
    }
    const originalReason = task.attentionReason
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.publishTask.updateMany({
        where: { id: taskId, tenantId: actor.tenantId, articleVersionId: { not: null }, status: PublishTaskStatus.ATTENTION, attentionReason: originalReason },
        data: { status: PublishTaskStatus.SUCCEEDED, completedAt: now, resultUrl: normalizedUrl, failureReason: null, attentionReason: null, leaseDeviceId: null, leaseHeartbeatAt: null, leaseExpiresAt: null },
      })
      if (!updated.count) throw new ConflictException({ code: 'PUBLISH_TASK_EVIDENCE_CONFLICT', message: '任务状态已变化，请刷新后重新核验' })
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          actorTenantId: actor.tenantId,
          action: 'publish_task.resolved_published',
          entityType: 'PublishTask',
          entityId: taskId,
          detail: { attentionReason: originalReason.toLowerCase(), publisherDeviceId: actor.publisherDeviceId, evidence: 'official_public_url' },
        },
      })
    })
    return this.loadTask(taskId)
  }

  async updateAccountState(actor: PublisherActor, platform: string, input: unknown): Promise<object> {
    const raw = input as { state?: unknown; localReferenceId?: unknown; label?: unknown }
    const state = raw?.state
    const localReferenceId = raw?.localReferenceId
    const label = typeof raw?.label === 'string' ? raw.label.trim() : ''
    if (!(platform in platformToDb) || !['connection_requested', 'verification_required', 'connected'].includes(String(state)) || typeof localReferenceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(localReferenceId) || label.length < 1 || label.length > 50) throw new ConflictException({ code: 'PUBLISHER_ACCOUNT_STATE_INVALID', message: '媒体账号引用、名称或状态无效' })
    const dbPlatform = platformToDb[platform as keyof typeof platformToDb]
    const status = state === 'connection_requested' ? MediaAccountStatus.CONNECTION_REQUESTED : state === 'connected' ? MediaAccountStatus.CONNECTED : MediaAccountStatus.VERIFICATION_REQUIRED
    const now = new Date()
    const data = { status, maskedName: label, failureReason: status === MediaAccountStatus.VERIFICATION_REQUIRED ? '本机资料尚未通过平台发布页能力验证' : null, lastHeartbeatAt: now, lastVerifiedAt: status === MediaAccountStatus.CONNECTED ? now : null }
    const row = await this.prisma.mediaAccount.upsert({
      where: { tenantId_platform_localReferenceId: { tenantId: actor.tenantId, platform: dbPlatform, localReferenceId } },
      update: data,
      create: { tenantId: actor.tenantId, platform: dbPlatform, localReferenceId, ...data },
    })
    return this.accountDto(row, platform as keyof typeof platformToDb)
  }

  private accountDto(row: { id: string; status: MediaAccountStatus; maskedName: string | null; localReferenceId: string | null; lastVerifiedAt: Date | null; lastHeartbeatAt: Date | null; failureReason: string | null; sessionBackup?: { capturedAt: Date; revokedAt: Date | null } | null } | undefined, platform: 'toutiao' | 'douyin') { return { id: row?.id ?? null, platform, status: row?.status.toLowerCase() ?? 'unbound', maskedName: row?.maskedName ?? null, localReferenceId: row?.localReferenceId ?? null, lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null, lastHeartbeatAt: row?.lastHeartbeatAt?.toISOString() ?? null, failureReason: row?.failureReason ?? null, backupAvailable: Boolean(row?.sessionBackup && !row.sessionBackup.revokedAt), backupCapturedAt: row?.sessionBackup && !row.sessionBackup.revokedAt ? row.sessionBackup.capturedAt.toISOString() : null } }
  private leaseExpiry(now: Date): Date { return new Date(now.getTime() + taskLeaseMs) }
  private async promoteDueScheduledTasks(tenantId: string, taskId?: string): Promise<void> {
    await this.prisma.publishTask.updateMany({
      where: { ...(taskId ? { id: taskId } : {}), tenantId, status: PublishTaskStatus.SCHEDULED, scheduledAt: { lte: new Date() }, articleVersionId: { not: null }, mediaAccountId: { not: null } },
      data: { status: PublishTaskStatus.QUEUED },
    })
  }
  private async recoverExpiredLeases(tenantId: string, taskId?: string): Promise<void> {
    const now = new Date()
    await this.prisma.publishTask.updateMany({
      where: { ...(taskId ? { id: taskId } : {}), tenantId, status: PublishTaskStatus.RUNNING, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      data: { status: PublishTaskStatus.ATTENTION, attentionReason: PublishAttentionReason.LEASE_EXPIRED, failureReason: leaseExpiredReason, leaseDeviceId: null, leaseHeartbeatAt: null, leaseExpiresAt: null },
    })
  }
  private async loadTask(taskId: string): Promise<object> {
    const row = await this.prisma.publishTask.findUnique({ where: { id: taskId }, include: { articleVersion: true, mediaAccount: true } })
    if (!row?.articleVersion) throw new NotFoundException({ code: 'PUBLISH_TASK_NOT_FOUND', message: '任务不存在或缺少文章版本快照' })
    return this.taskDto(row)
  }
  private taskDto(row: { id: string; platform: MediaPlatform; status: PublishTaskStatus; createdAt: Date; completedAt?: Date | null; resultUrl?: string | null; failureReason: string | null; attentionReason?: PublishAttentionReason | null; attemptCount?: number; mediaAccount?: { id: string; localReferenceId: string | null; maskedName: string | null } | null; articleVersion: { id: string; version: number; title: string; content: string; imageCount: number; galleryId: string | null; galleryImageIds?: unknown } | null }) {
    if (!row.articleVersion) throw new NotFoundException({ code: 'PUBLISH_TASK_VERSION_MISSING', message: '发布任务缺少文章版本快照' })
    return { id: row.id, platform: platformFromDb[row.platform], status: row.status.toLowerCase(), createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, resultUrl: row.resultUrl ?? null, failureReason: row.attentionReason ? attentionReasonMessage[row.attentionReason] : row.failureReason, attentionReason: row.attentionReason?.toLowerCase() ?? null, canResume: Boolean(row.attentionReason && resumableAttentionReasons.has(row.attentionReason)), canResolvePublished: Boolean(row.attentionReason && publishedEvidenceAttentionReasons.has(row.attentionReason)), attemptCount: row.attemptCount ?? 0, targetAccount: { id: row.mediaAccount?.id ?? null, localReferenceId: row.mediaAccount?.localReferenceId ?? null, maskedName: row.mediaAccount?.maskedName ?? null }, article: { versionId: row.articleVersion.id, version: row.articleVersion.version, title: row.articleVersion.title, content: row.articleVersion.content, imageCount: row.articleVersion.imageCount, galleryId: row.articleVersion.galleryId, galleryImageIds: this.imageIds(row.articleVersion.galleryImageIds) }, finalPublicationMode: 'automatic_submission_with_attention_fallback' }
  }
  private imageIds(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
  private isUniqueConstraintFailure(error: unknown): boolean { return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002') }
  private publicationEvidenceUrl(value: unknown, platform: MediaPlatform): string {
    if (typeof value !== 'string' || value.length > 2_000) throw new ConflictException({ code: 'PUBLISH_RESULT_URL_INVALID', message: '请填写不超过 2000 字符的官方公开内容链接' })
    let url: URL
    try { url = new URL(value.trim()) } catch { throw new ConflictException({ code: 'PUBLISH_RESULT_URL_INVALID', message: '请填写有效的 HTTPS 官方公开内容链接' }) }
    const hostname = url.hostname.toLowerCase()
    const officialHost = platform === MediaPlatform.TOUTIAO
      ? hostname === 'toutiao.com' || hostname.endsWith('.toutiao.com')
      : hostname === 'douyin.com' || hostname.endsWith('.douyin.com')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || isIP(hostname) || !officialHost) throw new ConflictException({ code: 'PUBLISH_RESULT_URL_INVALID', message: '结果链接必须是无参数的 HTTPS 头条或抖音公开内容链接' })
    return url.toString()
  }
}
