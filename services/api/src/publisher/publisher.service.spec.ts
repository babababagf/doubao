import { describe, expect, it } from 'vitest'

import { MediaAccountStatus, MediaPlatform, PublishAttentionReason, PublishTaskStatus } from '../generated/prisma/client'
import { PublisherService } from './publisher.service'

describe('PublisherService', () => {
  it('同一商户可以按本地引用分别登记两个同平台媒体账号', async () => {
    const rows = new Map<string, {
      id: string
      status: MediaAccountStatus
      maskedName: string | null
      localReferenceId: string | null
      lastVerifiedAt: Date | null
      lastHeartbeatAt: Date | null
      failureReason: string | null
    }>()
    const prisma = {
      mediaAccount: {
        upsert: async ({ where, update, create }: {
          where: { tenantId_platform_localReferenceId: { tenantId: string; platform: MediaPlatform; localReferenceId: string } }
          update: Omit<(typeof create), 'tenantId' | 'platform' | 'localReferenceId'>
          create: {
            tenantId: string
            platform: MediaPlatform
            localReferenceId: string
            status: MediaAccountStatus
            maskedName: string
            failureReason: string | null
            lastHeartbeatAt: Date
            lastVerifiedAt: Date | null
          }
        }) => {
          const key = `${where.tenantId_platform_localReferenceId.tenantId}:${where.tenantId_platform_localReferenceId.platform}:${where.tenantId_platform_localReferenceId.localReferenceId}`
          const existing = rows.get(key)
          const row = existing
            ? { ...existing, ...update }
            : { id: `media-${rows.size + 1}`, status: create.status, maskedName: create.maskedName, localReferenceId: create.localReferenceId, lastVerifiedAt: create.lastVerifiedAt, lastHeartbeatAt: create.lastHeartbeatAt, failureReason: create.failureReason }
          rows.set(key, row)
          return row
        },
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const
    const firstRef = '11111111-1111-4111-8111-111111111111'
    const secondRef = '22222222-2222-4222-8222-222222222222'

    await expect(service.updateAccountState(actor, 'toutiao', { state: 'connection_requested', localReferenceId: firstRef, label: '头条主号' })).resolves.toMatchObject({ id: 'media-1', localReferenceId: firstRef, maskedName: '头条主号', status: 'connection_requested' })
    await expect(service.updateAccountState(actor, 'toutiao', { state: 'connected', localReferenceId: secondRef, label: '头条副号' })).resolves.toMatchObject({ id: 'media-2', localReferenceId: secondRef, maskedName: '头条副号', status: 'connected' })
    await expect(service.updateAccountState(actor, 'toutiao', { state: 'connected', localReferenceId: firstRef, label: '头条主号' })).resolves.toMatchObject({ id: 'media-1', localReferenceId: firstRef, status: 'connected' })
    expect(rows).toHaveLength(2)
  })

  it('任务领取结果携带精确的目标媒体账号引用', async () => {
    const mediaAccount = { id: 'media-2', localReferenceId: '22222222-2222-4222-8222-222222222222', maskedName: '抖音副号' }
    const version = { id: 'article-v2', version: 2, title: '目标账号文章', content: '正文', imageCount: 1, galleryId: 'gallery-1', galleryImageIds: ['image-1'] }
    let claimWhere: Record<string, unknown> | null = null
    const prisma = {
      publishTask: {
        updateMany: async ({ where }: { where: Record<string, unknown> }) => { claimWhere = where; return { count: 1 } },
        findUnique: async () => ({ id: 'task-2', platform: MediaPlatform.DOUYIN, status: PublishTaskStatus.RUNNING, createdAt: new Date('2026-08-08T00:00:00.000Z'), failureReason: null, articleVersion: version, mediaAccount }),
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.claimTask(actor, 'task-2')).resolves.toMatchObject({
      id: 'task-2',
      targetAccount: mediaAccount,
      article: { version: 2, title: '目标账号文章' },
    })
    expect(claimWhere).toMatchObject({ id: 'task-2', mediaAccountId: { not: null }, articleVersionId: { not: null } })
  })

  it('发布助手列表和数量不包含历史未绑定媒体账号任务', async () => {
    const countWhere: Array<Record<string, unknown>> = []
    let listWhere: Record<string, unknown> | null = null
    const prisma = {
      mediaAccount: { findMany: async () => [] },
      publishTask: {
        count: async ({ where }: { where: Record<string, unknown> }) => { countWhere.push(where); return 0 },
        updateMany: async () => ({ count: 0 }),
        findMany: async ({ where }: { where: Record<string, unknown> }) => { listWhere = where; return [] },
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await service.getBootstrap(actor)
    await service.listTasks(actor)
    expect(countWhere).toHaveLength(2)
    expect(countWhere.every((where) => JSON.stringify(where).includes('mediaAccountId'))).toBe(true)
    expect(listWhere).toMatchObject({ tenantId: 'merchant-1', articleVersionId: { not: null }, mediaAccountId: { not: null } })
  })

  it('数据库拒绝同商户第二条执行任务时返回明确忙碌状态', async () => {
    const prisma = { publishTask: { updateMany: async ({ where }: { where: { status: PublishTaskStatus } }) => { if (where.status === PublishTaskStatus.QUEUED) throw { code: 'P2002' }; return { count: 0 } } } }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.claimTask(actor, 'task-2')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUBLISH_WORKSPACE_BUSY' }),
    })
  })

  it('轮询时只将已到期且具有文章版本的计划任务激活为排队', async () => {
    const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = []
    const prisma = {
      publishTask: {
        updateMany: async (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => { updates.push(input); return { count: 0 } },
        findMany: async () => [],
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.listTasks(actor)).resolves.toEqual([])
    expect(updates[1]).toEqual({
      where: { tenantId: 'merchant-1', status: PublishTaskStatus.SCHEDULED, scheduledAt: { lte: expect.any(Date) }, articleVersionId: { not: null }, mediaAccountId: { not: null } },
      data: { status: PublishTaskStatus.QUEUED },
    })
  })

  it('直接领取前仅尝试激活同租户的指定到期任务', async () => {
    const updates: Array<{ where: Record<string, unknown> }> = []
    const prisma = { publishTask: { updateMany: async (input: { where: Record<string, unknown> }) => { updates.push(input); return { count: 0 } } } }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.claimTask(actor, 'scheduled-task')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PUBLISH_TASK_NOT_CLAIMABLE' }) })
    expect(updates[1]?.where).toEqual({ id: 'scheduled-task', tenantId: 'merchant-1', status: PublishTaskStatus.SCHEDULED, scheduledAt: { lte: expect.any(Date) }, articleVersionId: { not: null }, mediaAccountId: { not: null } })
    expect(updates[2]?.where).toMatchObject({ id: 'scheduled-task', tenantId: 'merchant-1', status: PublishTaskStatus.QUEUED, mediaAccountId: { not: null } })
  })

  it('领取新任务前先回收同商户全部过期运行租约', async () => {
    const whereClauses: unknown[] = []
    const dataClauses: unknown[] = []
    const prisma = {
      publishTask: {
        updateMany: async ({ where, data }: { where: unknown; data: unknown }) => { whereClauses.push(where); dataClauses.push(data); return { count: 0 } },
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.claimTask(actor, 'new-task')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PUBLISH_TASK_NOT_CLAIMABLE' }) })
    expect(whereClauses[0]).toMatchObject({ tenantId: 'merchant-1', status: PublishTaskStatus.RUNNING, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: expect.any(Date) } }] })
    expect(whereClauses[0]).not.toHaveProperty('id')
    expect(dataClauses[0]).toMatchObject({ status: PublishTaskStatus.ATTENTION, attentionReason: PublishAttentionReason.LEASE_EXPIRED })
  })

  it('只允许原子领取排队任务，并且只能回传需人工处理状态', async () => {
    let status: PublishTaskStatus = PublishTaskStatus.QUEUED
    let storedAttentionReason: PublishAttentionReason | null = null
    const version = { id: 'article-v2', version: 2, title: '版本快照标题', content: '这是不可变的文章版本正文，用于发布助手本地填充。', imageCount: 1, galleryId: 'gallery-1', galleryImageIds: ['image-1'] }
    const prisma = {
      publishTask: {
        updateMany: async ({ where, data }: { where: { status: PublishTaskStatus }; data: { status?: PublishTaskStatus; failureReason?: string | null; attentionReason?: PublishAttentionReason | null } }) => {
          if (where.status !== status) return { count: 0 }
          if (data.status) status = data.status
          if ('attentionReason' in data) storedAttentionReason = data.attentionReason ?? null
          return { count: 1 }
        },
        findUnique: async () => ({ id: 'task-1', platform: MediaPlatform.DOUYIN, status, createdAt: new Date('2026-08-07T00:00:00.000Z'), failureReason: status === PublishTaskStatus.ATTENTION ? '内容已填写，等待用户在平台最终确认发布' : null, attentionReason: storedAttentionReason, articleVersion: version }),
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    const claimed = await service.claimTask(actor, 'task-1') as { status: string; article: { version: number }; finalPublicationMode: string }
    expect(claimed).toMatchObject({ status: 'running', article: { version: 2 }, finalPublicationMode: 'automatic_submission_with_attention_fallback' })
    const heartbeat = await service.heartbeatTask(actor, 'task-1') as { status: string }
    expect(heartbeat).toMatchObject({ status: 'running' })
    const attention = await service.reportAttention(actor, 'task-1', 'manual_confirmation') as { status: string; failureReason: string | null }
    expect(attention).toEqual(expect.objectContaining({ status: 'attention', failureReason: '内容已填写，等待用户在平台最终确认发布', attentionReason: 'manual_confirmation', canResume: false }))
    await expect(service.claimTask(actor, 'task-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PUBLISH_TASK_NOT_CLAIMABLE' }) })
  })

  it('只允许最终提交前的可恢复异常重新排队并写入审计日志', async () => {
    let status: PublishTaskStatus = PublishTaskStatus.ATTENTION
    let reason: PublishAttentionReason | null = PublishAttentionReason.LOGIN_REQUIRED
    const auditRows: unknown[] = []
    const version = { id: 'article-v1', version: 1, title: '安全续发文章', content: '正文', imageCount: 0, galleryId: null, galleryImageIds: [] }
    const tx = {
      publishTask: {
        updateMany: async ({ where, data }: { where: { status: PublishTaskStatus; attentionReason: PublishAttentionReason }; data: { status: PublishTaskStatus; attentionReason: null } }) => {
          if (where.status !== status || where.attentionReason !== reason) return { count: 0 }
          status = data.status
          reason = data.attentionReason
          return { count: 1 }
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => { auditRows.push(data); return data } },
    }
    const prisma = {
      publishTask: {
        findFirst: async () => ({ attentionReason: reason, mediaAccount: { status: MediaAccountStatus.CONNECTED } }),
        findUnique: async () => ({ id: 'task-resume', platform: MediaPlatform.TOUTIAO, status, createdAt: new Date('2026-08-08T00:00:00.000Z'), failureReason: null, attentionReason: reason, attemptCount: 1, articleVersion: version }),
      },
      $transaction: async (run: (client: typeof tx) => Promise<void>) => run(tx),
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.resumeTask(actor, 'task-resume')).resolves.toMatchObject({ status: 'queued', attentionReason: null, canResume: false, attemptCount: 1 })
    expect(auditRows).toEqual([expect.objectContaining({ action: 'publish_task.resumed', entityId: 'task-resume', detail: { attentionReason: 'login_required', publisherDeviceId: 'device-1' } })])
  })

  it('结果不明、页面/填写异常、素材快照缺失或无结构原因的任务禁止续发', async () => {
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const
    for (const reason of [PublishAttentionReason.SUBMISSION_UNKNOWN, PublishAttentionReason.PLATFORM_CHANGED, PublishAttentionReason.FILL_FAILED, PublishAttentionReason.ASSETS_MISSING, null]) {
      const prisma = { publishTask: { findFirst: async () => ({ attentionReason: reason, mediaAccount: { status: MediaAccountStatus.CONNECTED } }) } }
      const service = new PublisherService(prisma as never)
      await expect(service.resumeTask(actor, `unsafe-${String(reason)}`)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PUBLISH_TASK_RESUME_UNSAFE' }) })
    }
  })

  it('只向发布助手返回文章版本锁定且仍可用的图片', async () => {
    const prisma = {
      publishTask: {
        findFirst: async () => ({ articleVersion: { imageCount: 2, galleryImageIds: ['image-2', 'removed-image'] } }),
      },
      galleryImage: {
        findMany: async () => [
          { id: 'image-2', fileName: 'second.webp', mimeType: 'image/webp', publicUrl: 'https://images.example/second.webp' },
        ],
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.taskImages(actor, 'task-1')).resolves.toEqual({
      requiredCount: 2,
      availability: 'source_missing',
      images: [
        { id: 'image-2', fileName: 'second.webp', mimeType: 'image/webp', url: 'https://images.example/second.webp' },
      ],
      missingImageIds: ['removed-image'],
    })
  })

  it('只允许当前设备以同平台的官方公开链接回传发布成功', async () => {
    let status: PublishTaskStatus = PublishTaskStatus.RUNNING
    let resultUrl: string | null = null
    let completedAt: Date | null = null
    const version = { id: 'article-v2', version: 2, title: '版本快照标题', content: '正文', imageCount: 0, galleryId: null, galleryImageIds: [] }
    const prisma = {
      publishTask: {
        findFirst: async () => ({ platform: MediaPlatform.DOUYIN }),
        updateMany: async ({ where, data }: { where: { status: PublishTaskStatus; leaseDeviceId?: string }; data: { status?: PublishTaskStatus; resultUrl?: string; completedAt?: Date } }) => {
          if (where.status !== status || where.leaseDeviceId !== 'device-1') return { count: 0 }
          status = data.status ?? status
          resultUrl = data.resultUrl ?? null
          completedAt = data.completedAt ?? null
          return { count: 1 }
        },
        findUnique: async () => ({ id: 'task-1', platform: MediaPlatform.DOUYIN, status, createdAt: new Date('2026-08-07T00:00:00.000Z'), completedAt, resultUrl, failureReason: null, articleVersion: version }),
      },
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.confirmTaskSuccess(actor, 'task-1', 'https://www.douyin.com/video/123')).resolves.toMatchObject({ status: 'succeeded', resultUrl: 'https://www.douyin.com/video/123', completedAt: expect.any(String) })
    expect(resultUrl).toBe('https://www.douyin.com/video/123')
    await expect(service.confirmTaskSuccess(actor, 'task-1', 'https://www.toutiao.com/article/123')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PUBLISH_RESULT_URL_INVALID' }) })
  })

  it('结果不明任务可用同平台官方公开链接人工核验成功并写审计', async () => {
    let status: PublishTaskStatus = PublishTaskStatus.ATTENTION
    let attentionReason: PublishAttentionReason | null = PublishAttentionReason.SUBMISSION_UNKNOWN
    let resultUrl: string | null = null
    let completedAt: Date | null = null
    const auditRows: unknown[] = []
    const version = { id: 'article-v3', version: 3, title: '待人工核验标题', content: '正文', imageCount: 0, galleryId: null, galleryImageIds: [] }
    const tx = {
      publishTask: {
        updateMany: async ({ where, data }: { where: { status: PublishTaskStatus; attentionReason: PublishAttentionReason }; data: { status: PublishTaskStatus; attentionReason: null; resultUrl: string; completedAt: Date } }) => {
          if (where.status !== status || where.attentionReason !== attentionReason) return { count: 0 }
          status = data.status
          attentionReason = data.attentionReason
          resultUrl = data.resultUrl
          completedAt = data.completedAt
          return { count: 1 }
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => { auditRows.push(data); return data } },
    }
    const prisma = {
      publishTask: {
        findFirst: async () => ({ platform: MediaPlatform.TOUTIAO, status, attentionReason, resultUrl }),
        findUnique: async () => ({ id: 'task-evidence', platform: MediaPlatform.TOUTIAO, status, createdAt: new Date('2026-08-08T00:00:00.000Z'), completedAt, resultUrl, failureReason: null, attentionReason, attemptCount: 1, articleVersion: version }),
      },
      $transaction: async (run: (client: typeof tx) => Promise<void>) => run(tx),
    }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-2' } as const

    await expect(service.resolveTaskAsPublished(actor, 'task-evidence', 'https://www.toutiao.com/article/123')).resolves.toMatchObject({ status: 'succeeded', resultUrl: 'https://www.toutiao.com/article/123', canResolvePublished: false })
    expect(auditRows).toEqual([expect.objectContaining({ action: 'publish_task.resolved_published', entityId: 'task-evidence', detail: { attentionReason: 'submission_unknown', publisherDeviceId: 'device-2', evidence: 'official_public_url' } })])
    await expect(service.resolveTaskAsPublished(actor, 'task-evidence', 'https://www.toutiao.com/article/123')).resolves.toMatchObject({ status: 'succeeded' })
    expect(auditRows).toHaveLength(1)
  })

  it('素材缺失任务不能用人工链接绕过版本快照问题', async () => {
    const prisma = { publishTask: { findFirst: async () => ({ platform: MediaPlatform.DOUYIN, status: PublishTaskStatus.ATTENTION, attentionReason: PublishAttentionReason.ASSETS_MISSING, resultUrl: null }) } }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.resolveTaskAsPublished(actor, 'assets-missing', 'https://www.douyin.com/video/123')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PUBLISH_TASK_EVIDENCE_NOT_ALLOWED' }) })
  })

  it('历史文章缺少图片快照时明确要求人工处理，不从当前图库替换图片', async () => {
    const prisma = { publishTask: { findFirst: async () => ({ articleVersion: { imageCount: 1, galleryImageIds: [] } }) } }
    const service = new PublisherService(prisma as never)
    const actor = { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE', publisherDeviceId: 'device-1' } as const

    await expect(service.taskImages(actor, 'legacy-task')).resolves.toEqual({ requiredCount: 1, availability: 'legacy_snapshot_missing', images: [], missingImageIds: [] })
  })
})
