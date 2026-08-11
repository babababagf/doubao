import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'

import { AccountStatus, TenantKind, UserRole } from '../generated/prisma/client'
import type { AdminActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'

type ManagedTenant = {
  id: string
  companyName: string
  kind: 'white_label' | 'agent' | 'merchant'
  status: 'active' | 'disabled' | 'expired'
  expiresAt: string
  parent: { id: string; name: string } | null
  whiteLabelId: string | null
  username: string
  createdAt: string
}

type ManagedAuditLog = {
  id: string
  tenantName: string | null
  actorScope: 'system' | 'tenant_admin'
  action: string
  entityType: string
  entityId: string
  detail: unknown
  createdAt: string
}

type PlatformTaskSummary = {
  queued: number
  running: number
  attention: number
  failed: number
}

type PlatformTaskItem = {
  id: string
  category: 'ai_question_expansion' | 'ai_article_writing' | 'doubao_check' | 'publish'
  status: string
  tenantName: string
  totalCount: number
  completedCount: number
  failedCount: number
  failureReason: string | null
  createdAt: string
  updatedAt: string
}

type PlatformTaskRow = Omit<PlatformTaskItem, 'status' | 'failureReason' | 'createdAt' | 'updatedAt'> & {
  status: string
  failureReason: string | null
  createdAt: Date
  updatedAt: Date
}

type PlatformTaskOperations = {
  summary: PlatformTaskSummary
  items: PlatformTaskItem[]
}

@Injectable()
export class TenantManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AdminActor): Promise<ManagedTenant[]> {
    this.requirePlatform(actor)
    const tenants = await this.prisma.tenant.findMany({
      where: { closedAt: null },
      include: { parent: { select: { id: true, name: true } }, users: { select: { usernameCanonical: true }, take: 1 } },
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
    })
    return tenants.map((tenant) => this.view(tenant))
  }

  async updateStatus(actor: AdminActor, tenantId: string, input: { status?: unknown }): Promise<ManagedTenant> {
    this.requirePlatform(actor)
    const targetStatus = input.status === 'active' ? AccountStatus.ACTIVE : input.status === 'disabled' ? AccountStatus.DISABLED : null
    if (!targetStatus) throw new ConflictException({ code: 'TENANT_STATUS_INVALID', message: '状态仅支持 active 或 disabled' })
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, closedAt: null }, include: { parent: { select: { id: true, name: true } }, users: { select: { usernameCanonical: true }, take: 1 } } })
    if (!tenant) throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: '账户不存在或已关闭' })
    if (tenant.status === targetStatus) return this.view(tenant)

    const affectedTenantIds = await this.affectedTenantIds(tenant)
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tenant.update({ where: { id: tenant.id }, data: { status: targetStatus }, include: { parent: { select: { id: true, name: true } }, users: { select: { usernameCanonical: true }, take: 1 } } })
      await tx.session.updateMany({ where: { user: { tenantId: { in: affectedTenantIds } }, revokedAt: null }, data: { revokedAt: new Date() } })
      await tx.auditLog.create({ data: { tenantId: tenant.id, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'tenant.status.updated', entityType: 'Tenant', entityId: tenant.id, detail: { previousStatus: tenant.status.toLowerCase(), status: targetStatus.toLowerCase(), revokedTenantCount: affectedTenantIds.length } } })
      return result
    })
    return this.view(updated)
  }

  async listAuditLogs(actor: AdminActor): Promise<ManagedAuditLog[]> {
    this.requirePlatform(actor)
    const rows = await this.prisma.auditLog.findMany({
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map((row) => ({
      id: row.id,
      tenantName: row.tenant?.name ?? null,
      actorScope: row.actorTenantId ? 'tenant_admin' : 'system',
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      detail: sanitizeAuditDetail(row.detail),
      createdAt: row.createdAt.toISOString(),
    }))
  }

  async listTaskOperations(actor: AdminActor): Promise<PlatformTaskOperations> {
    this.requirePlatform(actor)
    const [aiCounts, doubaoCounts, publishCounts, aiTasks, doubaoBatches, publishTasks] = await Promise.all([
      this.prisma.aiGenerationTask.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.doubaoCheckBatch.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.publishTask.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.aiGenerationTask.findMany({ take: 20, orderBy: { updatedAt: 'desc' }, select: { id: true, type: true, status: true, totalCount: true, completedCount: true, failedCount: true, failureReason: true, createdAt: true, updatedAt: true, tenant: { select: { name: true } } } }),
      this.prisma.doubaoCheckBatch.findMany({ take: 20, orderBy: { updatedAt: 'desc' }, select: { id: true, status: true, totalCount: true, completedCount: true, failedCount: true, failureReason: true, createdAt: true, updatedAt: true, whiteLabel: { select: { name: true } } } }),
      this.prisma.publishTask.findMany({ take: 20, orderBy: { updatedAt: 'desc' }, select: { id: true, status: true, failureReason: true, createdAt: true, updatedAt: true, tenant: { select: { name: true } } } }),
    ])
    const count = (rows: Array<{ status: string; _count: { _all: number } }>, statuses: string[]) => rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row._count._all, 0)
    const summary = {
      queued: count(aiCounts, ['QUEUED']) + count(doubaoCounts, ['QUEUED']) + count(publishCounts, ['QUEUED']),
      running: count(aiCounts, ['RUNNING']) + count(doubaoCounts, ['RUNNING']) + count(publishCounts, ['RUNNING']),
      attention: count(publishCounts, ['ATTENTION']),
      failed: count(aiCounts, ['FAILED', 'PARTIALLY_FAILED', 'STOPPED']) + count(doubaoCounts, ['FAILED', 'PARTIALLY_FAILED']) + count(publishCounts, ['FAILED', 'STOPPED']),
    }
    const items: PlatformTaskItem[] = [
      ...aiTasks.map((row) => this.taskItem({ id: row.id, category: row.type === 'QUESTION_EXPANSION' ? 'ai_question_expansion' : 'ai_article_writing', status: row.status, tenantName: row.tenant.name, totalCount: row.totalCount, completedCount: row.completedCount, failedCount: row.failedCount, failureReason: row.failureReason, createdAt: row.createdAt, updatedAt: row.updatedAt })),
      ...doubaoBatches.map((row) => this.taskItem({ id: row.id, category: 'doubao_check', status: row.status, tenantName: row.whiteLabel.name, totalCount: row.totalCount, completedCount: row.completedCount, failedCount: row.failedCount, failureReason: row.failureReason, createdAt: row.createdAt, updatedAt: row.updatedAt })),
      ...publishTasks.map((row) => this.taskItem({ id: row.id, category: 'publish', status: row.status, tenantName: row.tenant.name, totalCount: 1, completedCount: row.status === 'SUCCEEDED' ? 1 : 0, failedCount: ['FAILED', 'STOPPED'].includes(row.status) ? 1 : 0, failureReason: row.failureReason, createdAt: row.createdAt, updatedAt: row.updatedAt })),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 30)
    return { summary, items }
  }

  private async affectedTenantIds(tenant: { id: string; kind: TenantKind }): Promise<string[]> {
    const where = tenant.kind === TenantKind.WHITE_LABEL
      ? { OR: [{ id: tenant.id }, { whiteLabelId: tenant.id }] }
      : { OR: [{ id: tenant.id }, { parentId: tenant.id }] }
    const rows = await this.prisma.tenant.findMany({ where, select: { id: true } })
    return rows.map((row) => row.id)
  }

  private view(tenant: { id: string; name: string; kind: TenantKind; status: AccountStatus; expiresAt: Date; parent: { id: string; name: string } | null; whiteLabelId: string | null; users: Array<{ usernameCanonical: string }>; createdAt: Date }): ManagedTenant {
    const expired = tenant.expiresAt <= new Date()
    return {
      id: tenant.id,
      companyName: tenant.name,
      kind: tenant.kind.toLowerCase() as ManagedTenant['kind'],
      status: expired ? 'expired' : tenant.status.toLowerCase() as ManagedTenant['status'],
      expiresAt: tenant.expiresAt.toISOString(),
      parent: tenant.parent,
      whiteLabelId: tenant.whiteLabelId,
      username: tenant.users[0]?.usernameCanonical ?? '—',
      createdAt: tenant.createdAt.toISOString(),
    }
  }

  private requirePlatform(actor: AdminActor): void {
    if (actor.role !== UserRole.PLATFORM_ADMIN) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '仅总后台可管理租户账户' })
  }

  private taskItem(item: PlatformTaskRow): PlatformTaskItem {
    return { ...item, status: item.status.toLowerCase(), failureReason: sanitizeTaskFailureReason(item.failureReason), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }
  }
}

function sanitizeAuditDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditDetail)
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 300) : value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, /secret|password|token|cookie|api.?key|access.?key/i.test(key) ? 'REDACTED' : sanitizeAuditDetail(nested)]))
}

function sanitizeTaskFailureReason(value: string | null): string | null {
  if (!value) return null
  if (/secret|password|token|cookie|api.?key|access.?key|authorization|bearer/i.test(value)) return '失败原因包含敏感字段，已隐藏'
  return value.replace(/\s+/g, ' ').trim().slice(0, 300) || null
}
